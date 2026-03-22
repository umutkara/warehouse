import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { COURIER_ALLOWED_ROLES, mapEventToTaskStatus } from "@/app/api/courier/_shared/state";

const OPS_STATUS_RULES = {
  partner_accepted_return: {
    createsDropPoint: true,
    requiresSignature: true,
    requiresPhoto: true,
    requiresComment: false,
  },
  partner_rejected_return: {
    createsDropPoint: false,
    requiresSignature: true,
    requiresPhoto: true,
    requiresComment: true,
  },
  sent_to_sc: {
    createsDropPoint: true,
    requiresSignature: true,
    requiresPhoto: true,
    requiresComment: false,
  },
  client_accepted: {
    createsDropPoint: true,
    requiresSignature: true,
    requiresPhoto: false,
    requiresComment: false,
  },
  client_rejected: {
    createsDropPoint: false,
    requiresSignature: false,
    requiresPhoto: false,
    requiresComment: true,
  },
  sent_to_client: {
    createsDropPoint: true,
    requiresSignature: true,
    requiresPhoto: true,
    requiresComment: false,
  },
  delivered_to_pudo: {
    createsDropPoint: true,
    requiresSignature: true,
    requiresPhoto: false,
    requiresComment: false,
  },
  postponed_1: {
    createsDropPoint: false,
    requiresSignature: false,
    requiresPhoto: false,
    requiresComment: false,
  },
  in_progress: {
    createsDropPoint: false,
    requiresSignature: false,
    requiresPhoto: false,
    requiresComment: false,
  },
} as const;

type OpsStatusRule = (typeof OPS_STATUS_RULES)[keyof typeof OPS_STATUS_RULES];
const ALLOWED_OPS_STATUSES = Object.keys(OPS_STATUS_RULES) as Array<keyof typeof OPS_STATUS_RULES>;

const DROP_TO_DELIVERED_OPS_STATUSES = new Set<string>([
  "client_accepted",
  "delivered_to_pudo",
]);
const DROP_TO_RETURNED_OPS_STATUSES = new Set<string>([
  "partner_accepted_return",
  "sent_to_sc",
]);

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
  const proofObj = proof && typeof proof === "object" ? (proof as Record<string, unknown>) : {};
  const receiverSignature = proofObj.receiver_signature;
  const actPhotoUrl = proofObj.act_photo_url ?? proofObj.act_photo_filename;
  const isOpsStatusEvent = eventType === "dropped" || eventType === "ops_status_update";
  let opsRule: OpsStatusRule | null = null;

  if (isOpsStatusEvent) {
    if (!opsStatus) {
      return NextResponse.json({ error: "opsStatus is required for this event" }, { status: 400 });
    }
    if (!ALLOWED_OPS_STATUSES.includes(opsStatus as keyof typeof OPS_STATUS_RULES)) {
      return NextResponse.json(
        {
          error: `Invalid opsStatus. Allowed: ${ALLOWED_OPS_STATUSES.join(", ")}`,
        },
        { status: 400 },
      );
    }
    opsRule = OPS_STATUS_RULES[opsStatus as keyof typeof OPS_STATUS_RULES];

    if (eventType === "dropped" && !opsRule.createsDropPoint) {
      return NextResponse.json(
        { error: "Selected opsStatus must not create drop point. Use ops_status_update event." },
        { status: 400 },
      );
    }
    if (eventType === "ops_status_update" && opsRule.createsDropPoint) {
      return NextResponse.json(
        { error: "Selected opsStatus requires dropped event." },
        { status: 400 },
      );
    }
    if (opsRule.requiresComment && (!note || !note.trim())) {
      return NextResponse.json({ error: "Комментарий обязателен для выбранного OPS статуса" }, { status: 400 });
    }
    if (opsRule.requiresSignature) {
      if (!receiverSignature || (typeof receiverSignature !== "string" && typeof receiverSignature !== "object")) {
        return NextResponse.json(
          { error: "Подпись принимающей стороны обязательна для выбранного OPS статуса" },
          { status: 400 },
        );
      }
    }
    if (opsRule.requiresPhoto) {
      if (!actPhotoUrl || typeof actPhotoUrl !== "string" || !actPhotoUrl.trim()) {
        return NextResponse.json(
          { error: "Фото акта обязательно для выбранного OPS статуса" },
          { status: 400 },
        );
      }
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

  // For OPS status events: upload signature if base64, resolve act_photo_url
  let receiverSignatureUrl: string | null = null;
  let actPhotoUrlForMeta: string | null = null;
  if (isOpsStatusEvent && proof && typeof proof === "object") {
    const proofObj = proof as Record<string, unknown>;
    const rs = proofObj.receiver_signature;
    const apo = proofObj.act_photo_url ?? proofObj.act_photo_filename;
    if (typeof apo === "string" && apo.trim()) {
      actPhotoUrlForMeta = apo.trim();
      if (!actPhotoUrlForMeta.startsWith("http")) {
        const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
        const path = actPhotoUrlForMeta.startsWith("/") ? actPhotoUrlForMeta.slice(1) : actPhotoUrlForMeta;
        actPhotoUrlForMeta = `${baseUrl}/storage/v1/object/public/unit-photos/${path}`;
      }
    }
    if (rs) {
      let base64 = "";
      if (typeof rs === "string") {
        const match = rs.match(/^data:image\/\w+;base64,(.+)$/);
        base64 = match ? match[1] : rs;
      }
      if (base64) {
        try {
          const buf = Buffer.from(base64, "base64");
          const sigFilename = `${task.warehouse_id}/${task.unit_id}/drop_signature_${Date.now()}.png`;
          const { error: sigUploadErr } = await supabaseAdmin.storage
            .from("unit-photos")
            .upload(sigFilename, buf, { contentType: "image/png", upsert: false });
          if (!sigUploadErr) {
            const { data: sigUrlData } = supabaseAdmin.storage
              .from("unit-photos")
              .getPublicUrl(sigFilename);
            receiverSignatureUrl = sigUrlData.publicUrl;
          }
        } catch (_) {
          console.warn("Failed to upload signature image");
        }
      }
    }
  }

  let proofMetaForEvent: Record<string, unknown> = {
    ...(proof && typeof proof === "object" ? proof : {}),
    ...(opsStatus ? { ops_status: opsStatus } : {}),
    ...(receiverSignatureUrl ? { receiver_signature_url: receiverSignatureUrl } : {}),
    ...(actPhotoUrlForMeta ? { act_photo_url: actPhotoUrlForMeta } : {}),
  };
  if (isOpsStatusEvent && opsStatus) {
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

  let nextStatus = mapEventToTaskStatus(eventType);
  if (eventType === "ops_status_update") {
    nextStatus = task.status;
  } else if (eventType === "dropped" && opsStatus) {
    if (DROP_TO_DELIVERED_OPS_STATUSES.has(opsStatus)) {
      nextStatus = "delivered";
    } else if (DROP_TO_RETURNED_OPS_STATUSES.has(opsStatus)) {
      nextStatus = "returned";
    } else {
      nextStatus = "dropped";
    }
  }
  const now = new Date().toISOString();
  const taskMeta = task.meta && typeof task.meta === "object" ? (task.meta as Record<string, unknown>) : {};
  const patch: Record<string, any> = {
    status: nextStatus,
    last_event_at: happenedAt,
    updated_at: now,
    current_lat: lat,
    current_lng: lng,
    meta: {
      ...taskMeta,
      source: "api.courier.tasks.event",
      last_event_type: eventType,
      ...(opsStatus ? { ops_status: opsStatus } : {}),
    },
  };
  if (effectiveShiftId && !task.shift_id) patch.shift_id = effectiveShiftId;
  if (eventType === "delivered" || nextStatus === "delivered") patch.delivered_at = happenedAt;
  if (eventType === "failed") patch.failed_at = happenedAt;
  if (eventType === "returned" || nextStatus === "returned") patch.returned_at = happenedAt;
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

  if (isOpsStatusEvent && opsStatus) {
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
      ops_status_source: eventType === "dropped" ? "courier_drop" : "courier_status_update",
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

    const opsStatusTextMap: Record<string, string> = {
      partner_accepted_return: "Партнер принял на возврат",
      partner_rejected_return: "Партнер не принял на возврат",
      sent_to_sc: "Передан в СЦ",
      delivered_to_rc: "Товар доставлен на РЦ",
      client_accepted: "Клиент принял",
      client_rejected: "Клиент не принял",
      sent_to_client: "Товар отправлен клиенту",
      delivered_to_pudo: "Товар доставлен на ПУДО",
      case_cancelled_cc: "Кейс отменен (Направлен КК)",
      postponed_1: "Перенос",
      postponed_2: "Перенос 2",
      warehouse_did_not_issue: "Склад не выдал",
      in_progress: "В работе",
      no_report: "Отчета нет",
    };
    const oldStatusText = oldStatus ? (opsStatusTextMap[oldStatus] || oldStatus) : "не назначен";
    const newStatusText = opsStatusTextMap[opsStatus] || opsStatus;

    await supabaseAdmin.rpc("audit_log_event", {
      p_action: "ops.unit_status_update",
      p_entity_type: "unit",
      p_entity_id: task.unit_id,
      p_summary:
        eventType === "dropped"
          ? `OPS статус изменён курьером при дропе: ${oldStatusText} → ${newStatusText}`
          : `OPS статус обновлён курьером: ${oldStatusText} → ${newStatusText}`,
      p_meta: {
        old_status: oldStatus,
        new_status: opsStatus,
        old_status_text: oldStatusText,
        new_status_text: newStatusText,
        comment: note || null,
        old_comment: oldComment,
        source:
          eventType === "dropped"
            ? "api.courier.tasks.event:dropped"
            : "api.courier.tasks.event:ops_status_update",
        task_id: task.id,
        event_id: eventId,
        unit_barcode: unitRow.barcode,
        receiver_signature_url: receiverSignatureUrl ?? undefined,
        act_photo_url: actPhotoUrlForMeta ?? undefined,
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
