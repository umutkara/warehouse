import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { COURIER_ALLOWED_ROLES } from "@/app/api/courier/_shared/state";

export async function POST(req: Request) {
  const auth = await requireCourierAuth(req, { allowedRoles: [...COURIER_ALLOWED_ROLES] });
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const barcode = body?.barcode?.toString().trim();
  const note = body?.note?.toString() || null;
  if (!barcode) {
    return NextResponse.json({ error: "barcode is required" }, { status: 400 });
  }

  const { data: unit, error: unitError } = await supabaseAdmin
    .from("units")
    .select("id, barcode")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("barcode", barcode)
    .maybeSingle();
  if (unitError) return NextResponse.json({ error: unitError.message }, { status: 500 });
  if (!unit) {
    return NextResponse.json({ error: "Unit not found by barcode" }, { status: 404 });
  }

  const { data: shipment, error: shipmentError } = await supabaseAdmin
    .from("outbound_shipments")
    .select("id, unit_id, status, courier_user_id, meta")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("unit_id", unit.id)
    .eq("courier_user_id", auth.user.id)
    .eq("status", "out")
    .order("out_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (shipmentError) return NextResponse.json({ error: shipmentError.message }, { status: 500 });
  if (!shipment) {
    return NextResponse.json({ error: "No pending assignment found for this barcode" }, { status: 404 });
  }

  const now = new Date().toISOString();
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
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { data: shift } = await supabaseAdmin
    .from("courier_shifts")
    .select("id")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("courier_user_id", auth.user.id)
    .in("status", ["open", "closing"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: existingTask } = await supabaseAdmin
    .from("courier_tasks")
    .select("id")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("unit_id", shipment.unit_id)
    .not("status", "in", "(delivered,failed,returned,canceled)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let taskId = existingTask?.id || null;
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
          source: "api.courier.assignments.scan_confirm",
          shipment_id: shipment.id,
          scanned_barcode: barcode,
          pickup_confirmed: true,
          note,
        },
      })
      .eq("id", existingTask.id);
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
          source: "api.courier.assignments.scan_confirm",
          shipment_id: shipment.id,
          scanned_barcode: barcode,
          pickup_confirmed: true,
          note,
        },
      })
      .select("id")
      .single();
    taskId = insertedTask?.id || null;
  }

  if (taskId) {
    await supabaseAdmin.from("courier_task_events").insert({
      warehouse_id: auth.profile.warehouse_id,
      task_id: taskId,
      unit_id: shipment.unit_id,
      courier_user_id: auth.user.id,
      shift_id: shift?.id ?? null,
      event_id: `scan-confirm-${taskId}-${Date.now()}`,
      event_type: "claimed",
      happened_at: now,
      note: note || `Pickup confirmed by scan: ${barcode}`,
      meta: { source: "api.courier.assignments.scan_confirm" },
    });
  }

  return NextResponse.json({ ok: true, shipment_id: shipment.id, task_id: taskId, barcode });
}
