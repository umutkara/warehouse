import { NextResponse } from "next/server";
import { requireUserProfile } from "@/app/api/_shared/user-profile";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import {
  canEditRoutePlanning,
  ROUTE_PLANNING_VIEW_ROLES,
} from "@/lib/routeplanning/access";

const ACTIVE_COURIER_TASK_STATUSES = ["claimed", "in_route", "arrived", "dropped"] as const;
const OPEN_SHIFT_STATUSES = ["open", "closing"] as const;
const MAX_PICKING_UNITS = 500;
const MAX_DROP_EVENTS = 700;

type JsonRecord = Record<string, unknown>;

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractScenario(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const record = meta as JsonRecord;
  return (
    asTrimmedString(record.scenario) ??
    asTrimmedString(record.picking_scenario) ??
    asTrimmedString(record.ops_scenario)
  );
}

function extractOpsStatus(proofMeta: unknown): string | null {
  if (!proofMeta || typeof proofMeta !== "object") return null;
  const record = proofMeta as JsonRecord;
  return asTrimmedString(record.ops_status);
}

function dbErrorResponse(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  const supabase = await supabaseServer();
  const auth = await requireUserProfile(supabase, {
    profileSelect: "warehouse_id, role",
    allowedRoles: [...ROUTE_PLANNING_VIEW_ROLES],
  });
  if (!auth.ok) return auth.response;

  const warehouseId = String(auth.profile.warehouse_id);
  const role = String(auth.profile.role || "");
  const canEdit = canEditRoutePlanning(role);

  const [
    pickingCellsResult,
    couriersResult,
    zonesResult,
    openShiftsResult,
    dropEventsResult,
    activeTaskRowsResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("warehouse_cells")
      .select("id, code, meta")
      .eq("warehouse_id", warehouseId)
      .eq("cell_type", "picking")
      .eq("is_active", true)
      .order("code", { ascending: true }),
    supabaseAdmin
      .from("profiles")
      .select("id, full_name, role")
      .eq("warehouse_id", warehouseId)
      .eq("role", "courier")
      .order("full_name", { ascending: true }),
    supabaseAdmin
      .from("delivery_zones")
      .select("id, name, code, polygon, priority")
      .eq("warehouse_id", warehouseId)
      .eq("active", true)
      .order("priority", { ascending: false })
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("courier_shifts")
      .select("id, courier_user_id, status, started_at")
      .eq("warehouse_id", warehouseId)
      .in("status", [...OPEN_SHIFT_STATUSES])
      .order("started_at", { ascending: false }),
    supabaseAdmin
      .from("courier_task_events")
      .select(
        "id, task_id, unit_id, courier_user_id, happened_at, lat, lng, note, proof_meta",
      )
      .eq("warehouse_id", warehouseId)
      .eq("event_type", "dropped")
      .order("happened_at", { ascending: false })
      .limit(MAX_DROP_EVENTS),
    supabaseAdmin
      .from("courier_tasks")
      .select("courier_user_id, status")
      .eq("warehouse_id", warehouseId)
      .in("status", [...ACTIVE_COURIER_TASK_STATUSES]),
  ]);

  if (pickingCellsResult.error) return dbErrorResponse(pickingCellsResult.error.message);
  if (couriersResult.error) return dbErrorResponse(couriersResult.error.message);
  if (zonesResult.error) return dbErrorResponse(zonesResult.error.message);
  if (openShiftsResult.error) return dbErrorResponse(openShiftsResult.error.message);
  if (dropEventsResult.error) return dbErrorResponse(dropEventsResult.error.message);
  if (activeTaskRowsResult.error) return dbErrorResponse(activeTaskRowsResult.error.message);

  const pickingCells = pickingCellsResult.data || [];
  const pickingCellIds = pickingCells.map((cell) => cell.id);
  const pickingCellsMap = new Map(
    pickingCells.map((cell) => [
      cell.id,
      {
        id: cell.id,
        code: cell.code,
        meta: cell.meta ?? null,
      },
    ]),
  );

  const activeTaskCountByCourier = new Map<string, number>();
  for (const row of activeTaskRowsResult.data || []) {
    const courierId = row.courier_user_id;
    if (!courierId) continue;
    activeTaskCountByCourier.set(
      courierId,
      (activeTaskCountByCourier.get(courierId) || 0) + 1,
    );
  }

  let pickingUnitsRows: Array<{
    id: string;
    barcode: string | null;
    status: string | null;
    cell_id: string | null;
    created_at: string;
    meta: unknown;
  }> = [];

  if (pickingCellIds.length > 0) {
    const pickingUnitsResult = await supabaseAdmin
      .from("units")
      .select("id, barcode, status, cell_id, created_at, meta")
      .eq("warehouse_id", warehouseId)
      .in("cell_id", pickingCellIds)
      .order("created_at", { ascending: false })
      .limit(MAX_PICKING_UNITS);

    if (pickingUnitsResult.error) return dbErrorResponse(pickingUnitsResult.error.message);

    pickingUnitsRows =
      (pickingUnitsResult.data as Array<{
        id: string;
        barcode: string | null;
        status: string | null;
        cell_id: string | null;
        created_at: string;
        meta: unknown;
      }>) || [];
  }

  const pickingUnitIds = pickingUnitsRows.map((unit) => unit.id);
  const shippedOutSet = new Set<string>();
  if (pickingUnitIds.length > 0) {
    const shippedOutResult = await supabaseAdmin
      .from("outbound_shipments")
      .select("unit_id")
      .in("unit_id", pickingUnitIds)
      .eq("status", "out");

    if (shippedOutResult.error) return dbErrorResponse(shippedOutResult.error.message);

    for (const shipment of shippedOutResult.data || []) {
      if (shipment.unit_id) shippedOutSet.add(shipment.unit_id);
    }
  }

  const pickingUnits = pickingUnitsRows
    .filter((unit) => !shippedOutSet.has(unit.id))
    .map((unit) => ({
      id: unit.id,
      barcode: unit.barcode || "",
      status: unit.status || "",
      cell_id: unit.cell_id,
      created_at: unit.created_at,
      scenario: extractScenario(unit.meta),
      cell: unit.cell_id ? pickingCellsMap.get(unit.cell_id) || null : null,
    }));

  const dropEvents = dropEventsResult.data || [];
  const dropUnitIds = [...new Set(dropEvents.map((event) => event.unit_id).filter(Boolean))];
  const dropCourierIds = [
    ...new Set(dropEvents.map((event) => event.courier_user_id).filter(Boolean)),
  ];
  const shiftCourierIds = [
    ...new Set(
      (openShiftsResult.data || []).map((shift) => shift.courier_user_id).filter(Boolean),
    ),
  ];
  const allCourierIdsForNames = [...new Set([...dropCourierIds, ...shiftCourierIds])];

  const courierMap = new Map(
    (couriersResult.data || []).map((courier) => [courier.id, courier.full_name || "Без имени"]),
  );

  const missingCourierIds = allCourierIdsForNames.filter((courierId) => !courierMap.has(courierId));
  if (missingCourierIds.length > 0) {
    const missingCouriersResult = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", missingCourierIds);
    if (missingCouriersResult.error) {
      return dbErrorResponse(missingCouriersResult.error.message);
    }
    for (const profile of missingCouriersResult.data || []) {
      courierMap.set(profile.id, profile.full_name || "Без имени");
    }
  }

  const unitsForDropsMap = new Map<string, { barcode: string; status: string; cell_id: string | null }>();
  if (dropUnitIds.length > 0) {
    const unitsForDropsResult = await supabaseAdmin
      .from("units")
      .select("id, barcode, status, cell_id")
      .in("id", dropUnitIds);
    if (unitsForDropsResult.error) return dbErrorResponse(unitsForDropsResult.error.message);
    for (const unit of unitsForDropsResult.data || []) {
      unitsForDropsMap.set(unit.id, {
        barcode: unit.barcode || "",
        status: unit.status || "",
        cell_id: unit.cell_id,
      });
    }
  }

  const dropPoints = dropEvents
    .map((event) => {
      const lat = toFiniteNumber(event.lat);
      const lng = toFiniteNumber(event.lng);
      return {
        id: event.id,
        task_id: event.task_id,
        unit_id: event.unit_id,
        unit_barcode: unitsForDropsMap.get(event.unit_id)?.barcode || "",
        courier_user_id: event.courier_user_id,
        courier_name: courierMap.get(event.courier_user_id) || "Неизвестный курьер",
        happened_at: event.happened_at,
        note: event.note || null,
        ops_status: extractOpsStatus(event.proof_meta),
        lat,
        lng,
      };
    })
    .filter((point) => point.lat !== null && point.lng !== null);

  const latestDropByUnitId = new Map<string, (typeof dropPoints)[number]>();
  for (const point of dropPoints) {
    if (!latestDropByUnitId.has(point.unit_id)) {
      latestDropByUnitId.set(point.unit_id, point);
    }
  }

  const droppedUnits = Array.from(latestDropByUnitId.values()).map((point) => ({
    unit_id: point.unit_id,
    unit_barcode: point.unit_barcode,
    current_status: unitsForDropsMap.get(point.unit_id)?.status || "",
    current_cell_id: unitsForDropsMap.get(point.unit_id)?.cell_id || null,
    dropped_at: point.happened_at,
    courier_user_id: point.courier_user_id,
    courier_name: point.courier_name,
    note: point.note,
    ops_status: point.ops_status,
    lat: point.lat,
    lng: point.lng,
  }));

  const latestLocationByCourierId = new Map<
    string,
    { lat: number | null; lng: number | null; recorded_at: string; accuracy_m: number | null }
  >();
  if (shiftCourierIds.length > 0) {
    const latestLocationsResult = await supabaseAdmin
      .from("courier_locations")
      .select("courier_user_id, lat, lng, recorded_at, accuracy_m")
      .eq("warehouse_id", warehouseId)
      .in("courier_user_id", shiftCourierIds)
      .order("recorded_at", { ascending: false });
    if (latestLocationsResult.error) return dbErrorResponse(latestLocationsResult.error.message);

    for (const location of latestLocationsResult.data || []) {
      if (!latestLocationByCourierId.has(location.courier_user_id)) {
        latestLocationByCourierId.set(location.courier_user_id, {
          lat: toFiniteNumber(location.lat),
          lng: toFiniteNumber(location.lng),
          recorded_at: location.recorded_at,
          accuracy_m: toFiniteNumber(location.accuracy_m),
        });
      }
    }
  }

  const liveCouriers = (openShiftsResult.data || []).map((shift) => ({
    shift_id: shift.id,
    courier_user_id: shift.courier_user_id,
    courier_name: courierMap.get(shift.courier_user_id) || "Без имени",
    status: shift.status,
    started_at: shift.started_at,
    active_tasks: activeTaskCountByCourier.get(shift.courier_user_id) || 0,
    last_location: latestLocationByCourierId.get(shift.courier_user_id) || null,
  }));

  const zones = (zonesResult.data || []).map((zone) => ({
    id: zone.id,
    name: zone.name,
    code: zone.code,
    priority: zone.priority,
    polygon: Array.isArray(zone.polygon) ? zone.polygon : [],
  }));

  return NextResponse.json({
    ok: true,
    role,
    can_edit: canEdit,
    updated_at: new Date().toISOString(),
    couriers: (couriersResult.data || []).map((courier) => ({
      id: courier.id,
      full_name: courier.full_name || "Без имени",
    })),
    picking_units: pickingUnits,
    dropped_units: droppedUnits,
    drop_points: dropPoints,
    live_couriers: liveCouriers,
    zones,
  });
}
