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

  const taskIds = [...new Set((taskUnits || []).map((row) => row.picking_task_id).filter(Boolean))];
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
    pickScenarioCandidate(
      picked,
      task.unit_id,
      task.scenario,
      task.created_at,
    );
  }

  return new Map([...picked.entries()].map(([unitId, item]) => [unitId, item.scenario]));
}

export async function GET(req: Request) {
  const auth = await requireCourierAuth(req, { allowedRoles: [...COURIER_ALLOWED_ROLES] });
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const includeCompleted = url.searchParams.get("includeCompleted") === "true";

  let query = supabaseAdmin
    .from("courier_tasks")
    .select(
      `
        id,
        pool_id,
        shift_id,
        unit_id,
        status,
        claimed_at,
        accepted_at,
        delivered_at,
        failed_at,
        returned_at,
        fail_reason,
        fail_comment,
        current_lat,
        current_lng,
        last_event_at,
        meta
      `,
    )
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("courier_user_id", auth.user.id)
    .order("claimed_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  } else if (!includeCompleted) {
    query = query.not("status", "in", "(delivered,failed,returned,canceled)");
  }

  const { data: rawTasks, error: tasksError } = await query;
  const tasks = (rawTasks || []).filter((t) => {
    const meta = t.meta && typeof t.meta === "object" ? (t.meta as Record<string, unknown>) : {};
    return meta.hidden_from_courier !== true;
  });
  if (tasksError) {
    return NextResponse.json({ error: tasksError.message }, { status: 500 });
  }

  const unitIds = (tasks || []).map((task) => task.unit_id).filter(Boolean);
  const poolIds = (tasks || []).map((task) => task.pool_id).filter(Boolean);
  let unitsMap = new Map<string, any>();
  let scenarioByUnit = new Map<string, string>();
  let poolById = new Map<string, any>();
  let shipmentById = new Map<string, any>();
  let shipmentByUnitId = new Map<string, any>();
  if (unitIds.length) {
    const { data: units } = await supabaseAdmin
      .from("units")
      .select("id, barcode, status, product_name, partner_name, meta")
      .in("id", unitIds);
    unitsMap = new Map((units || []).map((unit) => [unit.id, unit]));
    scenarioByUnit = await loadLatestScenarioByUnit(auth.profile.warehouse_id, unitIds);
  }
  if (poolIds.length) {
    const { data: pools } = await supabaseAdmin
      .from("courier_task_pool")
      .select("id, unit_id, source_shipment_id, meta")
      .eq("warehouse_id", auth.profile.warehouse_id)
      .in("id", poolIds);
    poolById = new Map((pools || []).map((pool) => [pool.id, pool]));
  }

  const shipmentIds = [
    ...new Set(
      (tasks || [])
        .map((task) => {
          const taskMeta = task.meta && typeof task.meta === "object" ? task.meta : null;
          const fromTaskMeta = taskMeta?.shipment_id?.toString();
          const fromPool = task.pool_id ? poolById.get(task.pool_id)?.source_shipment_id?.toString() : null;
          return fromTaskMeta || fromPool || null;
        })
        .filter(Boolean),
    ),
  ] as string[];

  if (shipmentIds.length) {
    const { data: shipments } = await supabaseAdmin
      .from("outbound_shipments")
      .select("id, unit_id, meta")
      .eq("warehouse_id", auth.profile.warehouse_id)
      .in("id", shipmentIds);
    shipmentById = new Map((shipments || []).map((shipment) => [shipment.id, shipment]));
    shipmentByUnitId = new Map((shipments || []).map((shipment) => [shipment.unit_id, shipment]));
  }

  const responseTasks = (tasks || []).map((task) => {
      const unit = unitsMap.get(task.unit_id) || null;
      const taskMeta = task.meta && typeof task.meta === "object" ? task.meta : null;
      const unitMeta = unit?.meta && typeof unit.meta === "object" ? unit.meta : null;
      const pool = task.pool_id ? poolById.get(task.pool_id) : null;
      const poolMeta = pool?.meta && typeof pool.meta === "object" ? pool.meta : null;
      const shipmentId = taskMeta?.shipment_id?.toString() || pool?.source_shipment_id?.toString() || null;
      const shipment = shipmentId ? shipmentById.get(shipmentId) : shipmentByUnitId.get(task.unit_id);
      const shipmentMeta = shipment?.meta && typeof shipment.meta === "object" ? shipment.meta : null;
      const pickupStatus =
        typeof shipmentMeta?.courier_pickup_status === "string"
          ? shipmentMeta.courier_pickup_status
          : null;
      const pickupConfirmed =
        pickupStatus === "confirmed" ||
        (typeof shipmentMeta?.courier_pickup_confirmed_at === "string" &&
          shipmentMeta.courier_pickup_confirmed_at.trim().length > 0);
      const selfPickup =
        taskMeta?.source === "api.courier.tasks.scan_claim" ||
        Boolean(shipmentMeta?.external_pickup);
      return {
        ...task,
        shipment_id: shipment?.id || shipmentId,
        pickup_status: pickupStatus,
        pickup_confirmed: pickupConfirmed,
        self_pickup: selfPickup,
        scenario: resolveScenario(
          scenarioByUnit.get(task.unit_id),
          taskMeta,
          poolMeta,
          shipmentMeta,
          unitMeta,
        ),
        unit,
      };
    });

  return NextResponse.json({
    ok: true,
    tasks: responseTasks,
  });
}
