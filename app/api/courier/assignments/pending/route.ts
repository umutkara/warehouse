import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { COURIER_ALLOWED_ROLES } from "@/app/api/courier/_shared/state";

function resolveScenario(...sources: unknown[]): string | null {
  for (const source of sources) {
    if (!source) continue;
    if (typeof source === "string") {
      const value = source.trim();
      if (value) return value;
      continue;
    }
    if (typeof source === "object") {
      const candidate = (source as Record<string, unknown>)["scenario"];
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  }
  return null;
}

type ScenarioCandidate = {
  scenario: string;
  updatedAtMs: number;
};

function pickScenarioCandidate(
  store: Map<string, ScenarioCandidate>,
  unitId: string,
  scenario: unknown,
  updatedAt: unknown,
) {
  if (typeof scenario !== "string" || !scenario.trim()) return;
  const normalized = scenario.trim();
  const nextMs = Date.parse(typeof updatedAt === "string" ? updatedAt : "");
  const effectiveMs = Number.isFinite(nextMs) ? nextMs : 0;
  const current = store.get(unitId);
  if (!current || effectiveMs >= current.updatedAtMs) {
    store.set(unitId, { scenario: normalized, updatedAtMs: effectiveMs });
  }
}

async function loadLatestScenarioByUnit(
  warehouseId: string,
  unitIds: string[],
): Promise<Map<string, string>> {
  const picked = new Map<string, ScenarioCandidate>();
  if (!unitIds.length) return new Map<string, string>();

  const { data: taskUnits } = await supabaseAdmin
    .from("picking_task_units")
    .select("unit_id, picking_task_id")
    .in("unit_id", unitIds);

  const taskIds = [
    ...new Set(
      (taskUnits || []).map((row) => row.picking_task_id).filter(Boolean),
    ),
  ];
  if (taskIds.length) {
    const { data: tasks } = await supabaseAdmin
      .from("picking_tasks")
      .select("id, scenario, created_at")
      .eq("warehouse_id", warehouseId)
      .in("id", taskIds);

    const taskById = new Map((tasks || []).map((task) => [task.id, task]));
    for (const row of taskUnits || []) {
      const task = taskById.get(row.picking_task_id);
      if (!task || !row.unit_id) continue;
      pickScenarioCandidate(
        picked,
        row.unit_id,
        task.scenario,
        task.created_at,
      );
    }
  }

  const { data: legacyTasks } = await supabaseAdmin
    .from("picking_tasks")
    .select("unit_id, scenario, created_at")
    .eq("warehouse_id", warehouseId)
    .in("unit_id", unitIds);

  for (const task of legacyTasks || []) {
    if (!task.unit_id) continue;
    pickScenarioCandidate(picked, task.unit_id, task.scenario, task.created_at);
  }

  return new Map(
    [...picked.entries()].map(([unitId, item]) => [unitId, item.scenario]),
  );
}

export async function GET(req: Request) {
  const auth = await requireCourierAuth(req, {
    allowedRoles: [...COURIER_ALLOWED_ROLES],
  });
  if (!auth.ok) return auth.response;

  const { data: shipments, error } = await supabaseAdmin
    .from("outbound_shipments")
    .select("id, unit_id, courier_name, out_at, status, meta")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("courier_user_id", auth.user.id)
    .eq("status", "out")
    .order("out_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pendingShipments = (shipments || []).filter((shipment) => {
    const meta = shipment.meta as Record<string, any> | null;
    const confirmedAt = meta?.courier_pickup_confirmed_at;
    const rejectedAt = meta?.courier_pickup_rejected_at;
    return !confirmedAt && !rejectedAt;
  });

  const unitIds = (shipments || []).map((row) => row.unit_id).filter(Boolean);
  let unitsMap = new Map<string, any>();
  let scenarioByUnit = new Map<string, string>();
  if (unitIds.length > 0) {
    const { data: units } = await supabaseAdmin
      .from("units")
      .select("id, barcode, status, product_name, partner_name, meta")
      .in("id", unitIds);
    unitsMap = new Map((units || []).map((unit) => [unit.id, unit]));
    scenarioByUnit = await loadLatestScenarioByUnit(
      auth.profile.warehouse_id,
      unitIds,
    );
  }

  return NextResponse.json({
    ok: true,
    assignments: pendingShipments.map((shipment) => {
      const unit = unitsMap.get(shipment.unit_id) || null;
      const shipmentMeta =
        shipment.meta && typeof shipment.meta === "object"
          ? shipment.meta
          : null;
      const unitMeta =
        unit?.meta && typeof unit.meta === "object" ? unit.meta : null;
      return {
        id: shipment.id,
        unit_id: shipment.unit_id,
        courier_name: shipment.courier_name,
        out_at: shipment.out_at,
        status: shipment.status,
        scenario: resolveScenario(
          scenarioByUnit.get(shipment.unit_id),
          shipmentMeta,
          unitMeta,
        ),
        unit,
        meta: shipment.meta || {},
      };
    }),
  });
}
