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
    (typeof shipmentMeta?.scenario === "string" &&
      shipmentMeta.scenario.trim()) ||
    (typeof shipmentMeta?.ops_scenario === "string" &&
      shipmentMeta.ops_scenario.trim()) ||
    (typeof shipmentMeta?.picking_scenario === "string" &&
      shipmentMeta.picking_scenario.trim());
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
  const auth = await requireCourierAuth(req, {
    allowedRoles: [...COURIER_ALLOWED_ROLES],
  });
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const shipmentIds = Array.isArray(body?.shipmentIds)
    ? body.shipmentIds.map((id: unknown) => id?.toString()).filter(Boolean)
    : [];
  const note = body?.note?.toString() || null;
  const giverSignature =
    typeof body?.giver_signature === "string"
      ? body.giver_signature.trim() || null
      : null;
  if (shipmentIds.length === 0) {
    return NextResponse.json(
      { error: "shipmentIds are required" },
      { status: 400 },
    );
  }

  const { data: shipments, error: shipmentsError } = await supabaseAdmin
    .from("outbound_shipments")
    .select("id, unit_id, status, courier_user_id, meta")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .in("id", shipmentIds);

  const unitIds = [
    ...new Set((shipments || []).map((s) => s.unit_id).filter(Boolean)),
  ];
  const { data: unitsData } = unitIds.length
    ? await supabaseAdmin
        .from("units")
        .select("id, barcode, meta")
        .in("id", unitIds)
    : { data: [] };
  const barcodeByUnitId = new Map(
    (unitsData || []).map((u) => [u.id, u.barcode]),
  );
  const unitMetaById = new Map(
    (unitsData || []).map((u) => [
      u.id,
      (u as any).meta && typeof (u as any).meta === "object"
        ? (u as any).meta
        : {},
    ]),
  );

  let scenarioByUnitId = new Map<string, string>();
  if (unitIds.length > 0) {
    const { data: taskUnits } = await supabaseAdmin
      .from("picking_task_units")
      .select("unit_id, picking_task_id")
      .in("unit_id", unitIds);
    const taskIds = [
      ...new Set(
        (taskUnits || []).map((r) => r.picking_task_id).filter(Boolean),
      ),
    ];
    if (taskIds.length > 0) {
      const { data: tasks } = await supabaseAdmin
        .from("picking_tasks")
        .select("id, scenario")
        .eq("warehouse_id", auth.profile.warehouse_id)
        .in("id", taskIds);
      const taskById = new Map((tasks || []).map((t) => [t.id, t]));
      for (const row of taskUnits || []) {
        const task = taskById.get(row.picking_task_id);
        if (task?.scenario?.trim() && row.unit_id) {
          scenarioByUnitId.set(row.unit_id, task.scenario.trim());
        }
      }
    }
    const { data: legacyTasks } = await supabaseAdmin
      .from("picking_tasks")
      .select("unit_id, scenario")
      .eq("warehouse_id", auth.profile.warehouse_id)
      .in("unit_id", unitIds);
    for (const t of legacyTasks || []) {
      if (t.unit_id && t.scenario?.trim()) {
        scenarioByUnitId.set(t.unit_id, t.scenario.trim());
      }
    }
  }

  if (shipmentsError) {
    return NextResponse.json(
      { error: shipmentsError.message },
      { status: 500 },
    );
  }

  const eligible = (shipments || []).filter(
    (shipment) =>
      shipment.status === "out" && shipment.courier_user_id === auth.user.id,
  );
  if (eligible.length === 0) {
    return NextResponse.json(
      { error: "No eligible shipments found" },
      { status: 404 },
    );
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
    const unitMeta = unitMetaById.get(shipment.unit_id) || {};
    const existingScenario = resolveExistingScenario(
      existingMeta,
      unitMeta,
      scenarioByUnitId.get(shipment.unit_id) || null,
    );
    const mergedMeta: Record<string, unknown> = {
      ...existingMeta,
      courier_pickup_confirmed_at: now,
      courier_pickup_confirmed_by: auth.user.id,
      courier_pickup_note: note,
      ...(giverSignature
        ? { courier_pickup_giver_signature: giverSignature }
        : {}),
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

    const taskScenario = existingScenario || DEFAULT_DROP_TO_WAREHOUSE_SCENARIO;

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
            ...(giverSignature ? { giver_signature: giverSignature } : {}),
            scenario: taskScenario,
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
        meta: {
          source: "api.courier.assignments.confirm",
          confirmed_by_dialog: true,
          ...(giverSignature ? { giver_signature: giverSignature } : {}),
        },
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
            ...(giverSignature ? { giver_signature: giverSignature } : {}),
            scenario: taskScenario,
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
          meta: {
            source: "api.courier.assignments.confirm",
            confirmed_by_dialog: true,
            ...(giverSignature ? { giver_signature: giverSignature } : {}),
          },
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
        giver_signature_logged: Boolean(giverSignature),
        confirmed_by_dialog: true,
      },
    });
  }

  return NextResponse.json({ ok: true, confirmed: confirmedIds });
}
