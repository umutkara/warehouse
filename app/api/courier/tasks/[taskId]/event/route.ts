import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { COURIER_ALLOWED_ROLES, mapEventToTaskStatus } from "@/app/api/courier/_shared/state";

const DROPPED_ALLOWED_OPS_STATUSES = [
  "partner_accepted_return",
  "partner_rejected_return",
  "sent_to_sc",
  "client_accepted",
  "client_rejected",
  "sent_to_client",
  "delivered_to_pudo",
  "postponed_1",
  "in_progress",
] as const;

function pickScenarioText(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const record = meta as Record<string, unknown>;
  const scenario =
    (typeof record.scenario === "string" && record.scenario.trim()) ||
    (typeof record.picking_scenario === "string" && record.picking_scenario.trim()) ||
    (typeof record.ops_scenario === "string" && record.ops_scenario.trim()) ||
    null;
  return scenario;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  const auth = await requireCourierAuth(req, { allowedRoles: [...COURIER_ALLOWED_ROLES] });
  if (!auth.ok) return auth.response;

  const { taskId } = await context.params;
  if (!taskId) return NextResponse.json({ error: "taskId is required" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const eventType = body?.eventType?.toString();
  const eventId = body?.eventId?.toString();
  const note = body?.note?.toString() || null;
  const lat = body?.lat ?? null;
  const lng = body?.lng ?? null;
  const proof = body?.proof ?? {};
  const opsStatus = body?.opsStatus?.toString() || null;
  const happenedAt = body?.happenedAt?.toString() || new Date().toISOString();

  if (!eventType || !eventId) {
    return NextResponse.json({ error: "eventType and eventId are required" }, { status: 400 });
  }
  if (eventType === "dropped") {
    if (!opsStatus) {
      return NextResponse.json({ error: "opsStatus is required for dropped event" }, { status: 400 });
    }
    if (!DROPPED_ALLOWED_OPS_STATUSES.includes(opsStatus as (typeof DROPPED_ALLOWED_OPS_STATUSES)[number])) {
      return NextResponse.json(
        {
          error: `Invalid opsStatus for dropped event. Allowed: ${DROPPED_ALLOWED_OPS_STATUSES.join(", ")}`,
        },
        { status: 400 },
      );
    }
  }

  const { data: task, error: taskError } = await supabaseAdmin
    .from("courier_tasks")
    .select("id, warehouse_id, unit_id, courier_user_id, shift_id, status, meta")
    .eq("id", taskId)
    .eq("warehouse_id", auth.profile.warehouse_id)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.courier_user_id !== auth.user.id) {
    return NextResponse.json({ error: "Task belongs to another courier" }, { status: 403 });
  }

  let effectiveShiftId: string | null = task.shift_id ?? null;
  if (eventType === "dropped") {
    const { data: activeShift, error: activeShiftError } = await supabaseAdmin
      .from("courier_shifts")
      .select("id, status")
      .eq("warehouse_id", task.warehouse_id)
      .eq("courier_user_id", auth.user.id)
      .in("status", ["open", "closing"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeShiftError) {
      return NextResponse.json({ error: activeShiftError.message }, { status: 500 });
    }
    if (!activeShift) {
      return NextResponse.json(
        {
          error: "Drop is blocked: courier has no open shift",
          code: "DROP_REQUIRES_OPEN_SHIFT",
        },
        { status: 409 },
      );
    }
    effectiveShiftId = task.shift_id ?? activeShift.id;

    const taskMeta =
      task.meta && typeof task.meta === "object" ? (task.meta as Record<string, unknown>) : {};
    const directShipmentId =
      typeof taskMeta.shipment_id === "string" && taskMeta.shipment_id.trim()
        ? taskMeta.shipment_id.trim()
        : null;

    const selectShipment = "id, status, courier_user_id, meta, out_at";
    const byIdResult = directShipmentId
      ? await supabaseAdmin
          .from("outbound_shipments")
          .select(selectShipment)
          .eq("id", directShipmentId)
          .eq("warehouse_id", task.warehouse_id)
          .maybeSingle()
      : { data: null, error: null };

    if (byIdResult.error) {
      return NextResponse.json({ error: byIdResult.error.message }, { status: 500 });
    }

    const byUnitResult =
      byIdResult.data
        ? { data: null, error: null }
        : await supabaseAdmin
            .from("outbound_shipments")
            .select(selectShipment)
            .eq("warehouse_id", task.warehouse_id)
            .eq("unit_id", task.unit_id)
            .eq("courier_user_id", auth.user.id)
            .order("out_at", { ascending: false })
            .limit(1)
            .maybeSingle();

    if (byUnitResult.error) {
      return NextResponse.json({ error: byUnitResult.error.message }, { status: 500 });
    }

    const shipment = byIdResult.data || byUnitResult.data;
    if (!shipment) {
      return NextResponse.json(
        {
          error: "Drop is blocked: unit has no active outbound shipment for this courier",
          code: "DROP_REQUIRES_SHIPMENT",
        },
        { status: 409 },
      );
    }
    if (shipment.courier_user_id && shipment.courier_user_id !== auth.user.id) {
      return NextResponse.json(
        { error: "Drop is blocked: shipment belongs to another courier", code: "DROP_WRONG_COURIER" },
        { status: 409 },
      );
    }
    if (shipment.status !== "out") {
      return NextResponse.json(
        { error: "Drop is blocked: shipment is not in OUT status", code: "DROP_SHIPMENT_NOT_OUT" },
        { status: 409 },
      );
    }

    const shipmentMeta =
      shipment.meta && typeof shipment.meta === "object"
        ? (shipment.meta as Record<string, unknown>)
        : {};
    const pickupStatus =
      typeof shipmentMeta.courier_pickup_status === "string"
        ? shipmentMeta.courier_pickup_status
        : null;
    const pickupConfirmedAt =
      typeof shipmentMeta.courier_pickup_confirmed_at === "string"
        ? shipmentMeta.courier_pickup_confirmed_at
        : null;
    const pickupRejectedAt =
      typeof shipmentMeta.courier_pickup_rejected_at === "string"
        ? shipmentMeta.courier_pickup_rejected_at
        : null;

    const pickupConfirmed = pickupStatus === "confirmed" || Boolean(pickupConfirmedAt);
    const pickupRejected = pickupStatus === "rejected" || Boolean(pickupRejectedAt);
    if (!pickupConfirmed || pickupRejected) {
      return NextResponse.json(
        {
          error: "Drop is blocked: pickup is not confirmed by courier",
          code: "DROP_REQUIRES_PICKUP_CONFIRMATION",
        },
        { status: 409 },
      );
    }

    const scenarioText = pickScenarioText(taskMeta) || pickScenarioText(shipmentMeta);
    if (scenarioText && !/(warehouse|склад)/i.test(scenarioText)) {
      return NextResponse.json(
        {
          error: "Drop is blocked: only warehouse-origin scenarios are allowed for drop",
          code: "DROP_REQUIRES_WAREHOUSE_SCENARIO",
          scenario: scenarioText,
        },
        { status: 400 },
      );
    }

    const selfPickup =
      taskMeta?.source === "api.courier.tasks.scan_claim" ||
      Boolean(shipmentMeta?.external_pickup);
    if (selfPickup) {
      return NextResponse.json(
        {
          error: "Drop is blocked: self-picked orders can only be handed over when the shift closes",
          code: "DROP_BLOCKED_SELF_PICKUP",
        },
        { status: 400 },
      );
    }
  }

  const { data: existingEvent } = await supabaseAdmin
    .from("courier_task_events")
    .select("id, event_type, happened_at")
    .eq("task_id", taskId)
    .eq("event_id", eventId)
    .limit(1)
    .maybeSingle();

  if (existingEvent) {
    return NextResponse.json({
      ok: true,
      duplicated: true,
      event: existingEvent,
    });
  }

  let proofMetaForEvent: Record<string, unknown> = {
    ...(proof && typeof proof === "object" ? proof : {}),
    ...(opsStatus ? { ops_status: opsStatus } : {}),
  };
  if (eventType === "dropped" && opsStatus) {
    const { data: unitForProof } = await supabaseAdmin
      .from("units")
      .select("meta")
      .eq("id", task.unit_id)
      .eq("warehouse_id", task.warehouse_id)
      .single();
    const um = unitForProof?.meta && typeof unitForProof.meta === "object" ? unitForProof.meta : {};
    proofMetaForEvent = {
      ...proofMetaForEvent,
      old_ops_status: (um as Record<string, unknown>)?.ops_status ?? null,
      old_ops_status_comment: (um as Record<string, unknown>)?.ops_status_comment ?? null,
    };
  }

  const { data: insertedEvent, error: insertError } = await supabaseAdmin
    .from("courier_task_events")
    .insert({
      warehouse_id: task.warehouse_id,
      task_id: task.id,
      unit_id: task.unit_id,
      courier_user_id: auth.user.id,
      shift_id: effectiveShiftId,
      event_id: eventId,
      event_type: eventType,
      lat,
      lng,
      happened_at: happenedAt,
      note,
      proof_meta: proofMetaForEvent,
      meta: { source: "api.courier.tasks.event" },
    })
    .select("id, event_type, happened_at")
    .single();

  if (insertError || !insertedEvent) {
    return NextResponse.json({ error: insertError?.message || "Failed to insert event" }, { status: 500 });
  }

  const nextStatus = mapEventToTaskStatus(eventType);
  const now = new Date().toISOString();
  const patch: Record<string, any> = {
    status: nextStatus,
    last_event_at: happenedAt,
    updated_at: now,
    current_lat: lat,
    current_lng: lng,
    meta: { source: "api.courier.tasks.event", last_event_type: eventType, ...(opsStatus ? { ops_status: opsStatus } : {}) },
  };
  if (effectiveShiftId && !task.shift_id) patch.shift_id = effectiveShiftId;
  if (eventType === "delivered") patch.delivered_at = happenedAt;
  if (eventType === "failed") patch.failed_at = happenedAt;
  if (eventType === "returned") patch.returned_at = happenedAt;
  if (eventType === "arrived") patch.accepted_at = happenedAt;
  if (eventType === "failed") {
    patch.fail_reason = body?.failReason?.toString() || "unspecified";
    patch.fail_comment = note;
  }

  const { error: updateError } = await supabaseAdmin
    .from("courier_tasks")
    .update(patch)
    .eq("id", task.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (eventType === "dropped" && opsStatus) {
    const { data: unitRow, error: unitFetchError } = await supabaseAdmin
      .from("units")
      .select("id, barcode, meta")
      .eq("id", task.unit_id)
      .eq("warehouse_id", task.warehouse_id)
      .single();
    if (unitFetchError || !unitRow) {
      return NextResponse.json({ error: unitFetchError?.message || "Unit not found" }, { status: 500 });
    }

    const oldStatus = unitRow.meta?.ops_status || null;
    const oldComment = unitRow.meta?.ops_status_comment || null;
    const updatedMeta = {
      ...(unitRow.meta || {}),
      ops_status: opsStatus,
      ops_status_comment: note && note.trim() ? note.trim() : oldComment,
      ops_status_source: "courier_drop",
      ops_status_set_at: happenedAt,
      ops_status_set_by: auth.user.id,
    };

    const { error: unitUpdateError } = await supabaseAdmin
      .from("units")
      .update({ meta: updatedMeta })
      .eq("id", task.unit_id)
      .eq("warehouse_id", task.warehouse_id);
    if (unitUpdateError) {
      return NextResponse.json({ error: unitUpdateError.message }, { status: 500 });
    }

    await supabaseAdmin.rpc("audit_log_event", {
      p_action: "ops.unit_status_update",
      p_entity_type: "unit",
      p_entity_id: task.unit_id,
      p_summary: `OPS статус изменён курьером при дропе: ${oldStatus || "не назначен"} → ${opsStatus}`,
      p_meta: {
        old_status: oldStatus,
        new_status: opsStatus,
        comment: note || null,
        old_comment: oldComment,
        source: "api.courier.tasks.event:dropped",
        task_id: task.id,
        event_id: eventId,
        unit_barcode: unitRow.barcode,
      },
    });
  }

  await supabaseAdmin.rpc("audit_log_event", {
    p_action: `courier.task.${eventType}`,
    p_entity_type: "courier_task",
    p_entity_id: task.id,
    p_summary: `Courier task event: ${eventType}`,
    p_meta: {
      task_id: task.id,
      unit_id: task.unit_id,
      event_id: eventId,
      lat,
      lng,
      note,
      ops_status: opsStatus,
    },
  });

  return NextResponse.json({
    ok: true,
    event: insertedEvent,
    status: nextStatus,
  });
}
