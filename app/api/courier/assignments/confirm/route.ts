import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { COURIER_ALLOWED_ROLES } from "@/app/api/courier/_shared/state";

export async function POST(req: Request) {
  const auth = await requireCourierAuth(req, { allowedRoles: [...COURIER_ALLOWED_ROLES] });
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const shipmentIds = Array.isArray(body?.shipmentIds)
    ? body.shipmentIds.map((id: unknown) => id?.toString()).filter(Boolean)
    : [];
  const note = body?.note?.toString() || null;
  if (shipmentIds.length === 0) {
    return NextResponse.json({ error: "shipmentIds are required" }, { status: 400 });
  }

  const { data: shipments, error: shipmentsError } = await supabaseAdmin
    .from("outbound_shipments")
    .select("id, unit_id, status, courier_user_id, meta")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .in("id", shipmentIds);

  const unitIds = [...new Set((shipments || []).map((s) => s.unit_id).filter(Boolean))];
  const { data: unitsData } = unitIds.length
    ? await supabaseAdmin.from("units").select("id, barcode").in("id", unitIds)
    : { data: [] };
  const barcodeByUnitId = new Map((unitsData || []).map((u) => [u.id, u.barcode]));

  if (shipmentsError) {
    return NextResponse.json({ error: shipmentsError.message }, { status: 500 });
  }

  const eligible = (shipments || []).filter(
    (shipment) => shipment.status === "out" && shipment.courier_user_id === auth.user.id,
  );
  if (eligible.length === 0) {
    return NextResponse.json({ error: "No eligible shipments found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { data: shift } = await supabaseAdmin
    .from("courier_shifts")
    .select("id")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("courier_user_id", auth.user.id)
    .in("status", ["open", "closing"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const confirmedIds: string[] = [];
  for (const shipment of eligible) {
    const existingMeta =
      shipment.meta && typeof shipment.meta === "object"
        ? (shipment.meta as Record<string, any>)
        : {};
    const mergedMeta = {
      ...existingMeta,
      courier_pickup_confirmed_at: now,
      courier_pickup_confirmed_by: auth.user.id,
      courier_pickup_note: note,
      courier_pickup_status: "confirmed",
      courier_pickup_rejected_at: null,
      courier_pickup_rejected_by: null,
      courier_pickup_reject_note: null,
    };

    const { error: updateError } = await supabaseAdmin
      .from("outbound_shipments")
      .update({
        meta: mergedMeta,
        updated_at: now,
      })
      .eq("id", shipment.id)
      .eq("warehouse_id", auth.profile.warehouse_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const { data: existingTask } = await supabaseAdmin
      .from("courier_tasks")
      .select("id, status, courier_user_id")
      .eq("warehouse_id", auth.profile.warehouse_id)
      .eq("unit_id", shipment.unit_id)
      .not("status", "in", "(delivered,failed,returned,canceled)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingTask) {
      await supabaseAdmin
        .from("courier_tasks")
        .update({
          courier_user_id: auth.user.id,
          shift_id: shift?.id ?? null,
          status: "claimed",
          claimed_at: now,
          last_event_at: now,
          updated_at: now,
          meta: {
            source: "api.courier.assignments.confirm",
            shipment_id: shipment.id,
            pickup_confirmed: true,
            note,
          },
        })
        .eq("id", existingTask.id);

      await supabaseAdmin.from("courier_task_events").insert({
        warehouse_id: auth.profile.warehouse_id,
        task_id: existingTask.id,
        unit_id: shipment.unit_id,
        courier_user_id: auth.user.id,
        shift_id: shift?.id ?? null,
        event_id: `pickup-confirm-${existingTask.id}-${Date.now()}`,
        event_type: "claimed",
        happened_at: now,
        note: note || "Pickup confirmed by courier",
        meta: { source: "api.courier.assignments.confirm" },
      });
    } else {
      const { data: insertedTask } = await supabaseAdmin
        .from("courier_tasks")
        .insert({
          warehouse_id: auth.profile.warehouse_id,
          pool_id: null,
          shift_id: shift?.id ?? null,
          unit_id: shipment.unit_id,
          courier_user_id: auth.user.id,
          zone_id: null,
          status: "claimed",
          claimed_at: now,
          last_event_at: now,
          meta: {
            source: "api.courier.assignments.confirm",
            shipment_id: shipment.id,
            pickup_confirmed: true,
            note,
          },
        })
        .select("id")
        .single();

      if (insertedTask?.id) {
        await supabaseAdmin.from("courier_task_events").insert({
          warehouse_id: auth.profile.warehouse_id,
          task_id: insertedTask.id,
          unit_id: shipment.unit_id,
          courier_user_id: auth.user.id,
          shift_id: shift?.id ?? null,
          event_id: `pickup-confirm-${insertedTask.id}-${Date.now()}`,
          event_type: "claimed",
          happened_at: now,
          note: note || "Pickup confirmed by courier",
          meta: { source: "api.courier.assignments.confirm" },
        });
      }
    }

    confirmedIds.push(shipment.id);

    await supabaseAdmin.rpc("audit_log_event", {
      p_action: "courier.pickup_confirmed",
      p_entity_type: "unit",
      p_entity_id: shipment.unit_id,
      p_summary: `Курьер подтвердил забор: ${barcodeByUnitId.get(shipment.unit_id) || shipment.unit_id}`,
      p_meta: {
        source: "api.courier.assignments.confirm",
        courier_user_id: auth.user.id,
        courier_name: auth.profile.full_name || auth.user.id,
        shipment_id: shipment.id,
        unit_barcode: barcodeByUnitId.get(shipment.unit_id),
      },
    });
  }

  return NextResponse.json({ ok: true, confirmed: confirmedIds });
}
