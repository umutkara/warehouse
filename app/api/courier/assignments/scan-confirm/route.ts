import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { COURIER_ALLOWED_ROLES } from "@/app/api/courier/_shared/state";

const DEFAULT_DROP_TO_WAREHOUSE_SCENARIO = "Отвезите заказ на склад";

function resolveExistingScenario(
  shipmentMeta: Record<string, unknown>,
  unitMeta: Record<string, unknown>,
  scenarioFromPicking: string | null,
): string | null {
  const fromShipment =
    (typeof shipmentMeta?.scenario === "string" && shipmentMeta.scenario.trim()) ||
    (typeof shipmentMeta?.ops_scenario === "string" && shipmentMeta.ops_scenario.trim()) ||
    (typeof shipmentMeta?.picking_scenario === "string" && shipmentMeta.picking_scenario.trim());
  if (fromShipment) return fromShipment.trim();
  const fromUnit =
    typeof unitMeta?.ops_scenario === "string" && unitMeta.ops_scenario.trim()
      ? unitMeta.ops_scenario.trim()
      : null;
  if (fromUnit) return fromUnit;
  if (scenarioFromPicking) return scenarioFromPicking;
  return null;
}

export async function POST(req: Request) {
  const auth = await requireCourierAuth(req, { allowedRoles: [...COURIER_ALLOWED_ROLES] });
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const barcode = body?.barcode?.toString().trim();
  const note = body?.note?.toString() || null;
  const giverSignature =
    typeof body?.giver_signature === "string" ? body.giver_signature.trim() || null : null;
  if (!barcode) {
    return NextResponse.json({ error: "barcode is required" }, { status: 400 });
  }
  if (!giverSignature) {
    return NextResponse.json(
      { error: "giver_signature is required for pickup confirmation" },
      { status: 400 },
    );
  }

  const { data: unit, error: unitError } = await supabaseAdmin
    .from("units")
    .select("id, barcode, meta")
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

  let scenarioFromPicking: string | null = null;
  const { data: taskUnits } = await supabaseAdmin
    .from("picking_task_units")
    .select("unit_id, picking_task_id")
    .eq("unit_id", shipment.unit_id);
  const taskIds = [...new Set((taskUnits || []).map((r) => r.picking_task_id).filter(Boolean))];
  if (taskIds.length > 0) {
    const { data: tasks } = await supabaseAdmin
      .from("picking_tasks")
      .select("id, scenario")
      .eq("warehouse_id", auth.profile.warehouse_id)
      .in("id", taskIds);
    const taskById = new Map((tasks || []).map((t) => [t.id, t]));
    for (const row of taskUnits || []) {
      const task = taskById.get(row.picking_task_id);
      if (task?.scenario?.trim()) {
        scenarioFromPicking = task.scenario.trim();
        break;
      }
    }
  }
  if (!scenarioFromPicking) {
    const { data: legacyTask } = await supabaseAdmin
      .from("picking_tasks")
      .select("scenario")
      .eq("warehouse_id", auth.profile.warehouse_id)
      .eq("unit_id", shipment.unit_id)
      .not("scenario", "is", null)
      .limit(1)
      .maybeSingle();
    if (legacyTask?.scenario?.trim()) scenarioFromPicking = legacyTask.scenario.trim();
  }

  const now = new Date().toISOString();
  const existingMeta =
    shipment.meta && typeof shipment.meta === "object"
      ? (shipment.meta as Record<string, any>)
      : {};
  const unitMeta = (unit as any)?.meta && typeof (unit as any).meta === "object" ? (unit as any).meta : {};
  const existingScenario = resolveExistingScenario(existingMeta, unitMeta, scenarioFromPicking);
  const mergedMeta: Record<string, unknown> = {
    ...existingMeta,
    courier_pickup_confirmed_at: now,
    courier_pickup_confirmed_by: auth.user.id,
    courier_pickup_note: note,
    courier_pickup_giver_signature: giverSignature,
    courier_pickup_status: "confirmed",
    courier_pickup_rejected_at: null,
    courier_pickup_rejected_by: null,
    courier_pickup_reject_note: null,
  };
  if (!existingScenario) {
    mergedMeta.scenario = DEFAULT_DROP_TO_WAREHOUSE_SCENARIO;
    mergedMeta.ops_scenario = DEFAULT_DROP_TO_WAREHOUSE_SCENARIO;
  }
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

  const taskScenario = existingScenario || DEFAULT_DROP_TO_WAREHOUSE_SCENARIO;

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
          giver_signature: giverSignature,
          scenario: taskScenario,
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
          scenario: taskScenario,
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
        meta: {
          source: "api.courier.assignments.scan_confirm",
          giver_signature: giverSignature,
        },
    });
  }

  await supabaseAdmin.rpc("audit_log_event", {
    p_action: "courier.pickup_confirmed",
    p_entity_type: "unit",
    p_entity_id: shipment.unit_id,
    p_summary: `Курьер подтвердил забор сканом: ${barcode}`,
    p_meta: {
      source: "api.courier.assignments.scan_confirm",
      courier_user_id: auth.user.id,
      courier_name: auth.profile.full_name || auth.user.id,
      shipment_id: shipment.id,
      unit_barcode: barcode,
      scanned_barcode: barcode,
      giver_signature_logged: true,
    },
  });

  return NextResponse.json({ ok: true, shipment_id: shipment.id, task_id: taskId, barcode });
}
