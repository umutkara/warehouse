import { NextResponse } from "next/server";
import { requireUserProfile } from "@/app/api/_shared/user-profile";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import {
  canEditRoutePlanning,
  ROUTE_PLANNING_VIEW_ROLES,
} from "@/lib/routeplanning/access";
import { resolveDropColor } from "@/lib/courier/drop-color";

const ACTIVE_COURIER_TASK_STATUSES = ["claimed", "in_route", "arrived", "dropped"] as const;
const OPEN_SHIFT_STATUSES = ["open", "closing"] as const;
const MAX_PICKING_UNITS = 500;
const MAX_DROP_EVENTS = 700;
const TARGET_WAREHOUSE_ZONE_CODE = "geri-qaytarmalar-anbar";
const TARGET_WAREHOUSE_ZONE_STYLE = {
  strokeColor: "#dc2626",
  fillColor: "#ef4444",
  fillOpacity: 0.2,
  strokeOpacity: 0.95,
  strokeWeight: 3,
} as const;
const DEFAULT_ZONE_STYLE = {
  strokeColor: "#2563eb",
  fillColor: "#60a5fa",
  fillOpacity: 0.14,
  strokeOpacity: 0.75,
  strokeWeight: 2,
} as const;

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

function parseIsoMs(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function dbErrorResponse(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function pointInPolygon(
  lat: number,
  lng: number,
  polygon: Array<{ lat?: number; lng?: number } | [number, number]>,
): boolean {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    const xi = Array.isArray(pi) ? pi[0] : (pi as { lat?: number; lng?: number }).lng ?? (pi as [number, number])[0];
    const yi = Array.isArray(pi) ? pi[1] : (pi as { lat?: number; lng?: number }).lat ?? (pi as [number, number])[1];
    const xj = Array.isArray(pj) ? pj[0] : (pj as { lat?: number; lng?: number }).lng ?? (pj as [number, number])[0];
    const yj = Array.isArray(pj) ? pj[1] : (pj as { lat?: number; lng?: number }).lat ?? (pj as [number, number])[1];
    if (xi == null || yi == null || xj == null || yj == null) continue;
    const intersects =
      (yi > lat) !== (yj > lat) &&
      lng < ((xj - xi) * (lat - yi)) / (Math.abs(yj - yi) < 1e-12 ? 1e-12 : yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function extractZoneStyle(meta: unknown) {
  if (!meta || typeof meta !== "object") return DEFAULT_ZONE_STYLE;
  const record = meta as JsonRecord;
  const display = record.display && typeof record.display === "object"
    ? (record.display as JsonRecord)
    : (record as JsonRecord);

  const strokeColor = asTrimmedString(display.strokeColor) || DEFAULT_ZONE_STYLE.strokeColor;
  const fillColor = asTrimmedString(display.fillColor) || DEFAULT_ZONE_STYLE.fillColor;
  const fillOpacity = clampNumber(display.fillOpacity, DEFAULT_ZONE_STYLE.fillOpacity, 0, 1);
  const strokeOpacity = clampNumber(
    display.strokeOpacity,
    DEFAULT_ZONE_STYLE.strokeOpacity,
    0,
    1,
  );
  const strokeWeight = clampNumber(
    display.strokeWeight,
    DEFAULT_ZONE_STYLE.strokeWeight,
    1,
    8,
  );

  return {
    strokeColor,
    fillColor,
    fillOpacity,
    strokeOpacity,
    strokeWeight,
  };
}

export async function GET() {
  const supabase = await supabaseServer();
  const auth = await requireUserProfile(supabase, {
    profileSelect: "warehouse_id, role",
    allowedRoles: [...ROUTE_PLANNING_VIEW_ROLES],
  });
  if (!auth.ok) {
    return auth.response;
  }

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
      .select("id, name, code, polygon, priority, meta")
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
  const shiftCourierRoleById = new Map<string, string>();
  if (shiftCourierIds.length > 0) {
    const { data: shiftCourierProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, role, full_name")
      .in("id", shiftCourierIds);
    const roleBreakdown: Record<string, number> = {};
    for (const profile of shiftCourierProfiles || []) {
      const key = profile.role || "unknown";
      roleBreakdown[key] = (roleBreakdown[key] || 0) + 1;
      shiftCourierRoleById.set(profile.id, profile.role || "unknown");
    }
  }

  const filteredOpenShifts = (openShiftsResult.data || []).filter(
    (shift) => shiftCourierRoleById.get(shift.courier_user_id) === "courier",
  );
  const filteredShiftCourierIds = [
    ...new Set(filteredOpenShifts.map((shift) => shift.courier_user_id)),
  ];
  const allCourierIdsForNames = [...new Set([...dropCourierIds, ...filteredShiftCourierIds])];

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

  const unitsForDropsMap = new Map<
    string,
    { barcode: string; status: string; cell_id: string | null; meta: unknown }
  >();
  if (dropUnitIds.length > 0) {
    const unitsForDropsResult = await supabaseAdmin
      .from("units")
      .select("id, barcode, status, cell_id, meta")
      .in("id", dropUnitIds);
    if (unitsForDropsResult.error) return dbErrorResponse(unitsForDropsResult.error.message);
    for (const unit of unitsForDropsResult.data || []) {
      unitsForDropsMap.set(unit.id, {
        barcode: unit.barcode || "",
        status: unit.status || "",
        cell_id: unit.cell_id,
        meta: unit.meta || null,
      });
    }
  }

  const latestBinMoveByUnitId = new Map<string, string>();
  if (dropUnitIds.length > 0) {
    const binCellsResult = await supabaseAdmin
      .from("warehouse_cells_map")
      .select("id")
      .eq("warehouse_id", warehouseId)
      .eq("cell_type", "bin");
    if (binCellsResult.error) return dbErrorResponse(binCellsResult.error.message);
    const binCellIds = (binCellsResult.data || []).map((cell) => cell.id).filter(Boolean);

    if (binCellIds.length > 0) {
      const unitMovesResult = await supabaseAdmin
        .from("unit_moves")
        .select("unit_id, created_at")
        .eq("warehouse_id", warehouseId)
        .in("unit_id", dropUnitIds)
        .in("to_cell_id", binCellIds)
        .order("created_at", { ascending: false });
      if (unitMovesResult.error) return dbErrorResponse(unitMovesResult.error.message);
      for (const move of unitMovesResult.data || []) {
        if (!latestBinMoveByUnitId.has(move.unit_id)) {
          latestBinMoveByUnitId.set(move.unit_id, move.created_at);
        }
      }
    }
  }

  const dropPoints = dropEvents
    .map((event) => {
      const lat = toFiniteNumber(event.lat);
      const lng = toFiniteNumber(event.lng);
      const unitInfo = unitsForDropsMap.get(event.unit_id);
      const dropMs = parseIsoMs(event.happened_at);
      const movedToBinAt = latestBinMoveByUnitId.get(event.unit_id);
      const movedToBinMs = movedToBinAt ? parseIsoMs(movedToBinAt) : null;
      const isReturnedToBin =
        dropMs !== null && movedToBinMs !== null && movedToBinMs >= dropMs;
      const unitMeta =
        unitInfo?.meta && typeof unitInfo.meta === "object"
          ? (unitInfo.meta as Record<string, unknown>)
          : {};
      const opsStatus =
        extractOpsStatus(event.proof_meta) ||
        (typeof unitMeta.ops_status === "string" && unitMeta.ops_status.trim()
          ? unitMeta.ops_status.trim()
          : null);
      const color = resolveDropColor({
        opsStatus,
        overrideColorKey: unitMeta.drop_point_color_override,
      });

      return {
        id: event.id,
        task_id: event.task_id,
        unit_id: event.unit_id,
        unit_barcode: unitInfo?.barcode || "",
        courier_user_id: event.courier_user_id,
        courier_name: courierMap.get(event.courier_user_id) || "Неизвестный курьер",
        happened_at: event.happened_at,
        note: event.note || null,
        ops_status: opsStatus,
        color_key: color.color_key,
        color_hex: color.color_hex,
        is_returned_to_bin: isReturnedToBin,
        lat,
        lng,
      };
    })
    .filter(
    (point) =>
      point.lat !== null &&
      point.lng !== null &&
      !point.is_returned_to_bin &&
      !(point.lat === 0 && point.lng === 0),
  );

  const latestDropByUnitId = new Map<string, (typeof dropPoints)[number]>();
  for (const point of dropPoints) {
    if (!latestDropByUnitId.has(point.unit_id)) {
      latestDropByUnitId.set(point.unit_id, point);
    }
  }

  const zoneList = (zonesResult.data || []).map((z) => ({
    id: z.id,
    code: (z.code || "").trim() || null,
    name: z.name || "",
    polygon: Array.isArray(z.polygon) ? z.polygon : [],
  }));

  const droppedUnits = Array.from(latestDropByUnitId.values()).map((point) => {
    let zone_id: string | null = null;
    let zone_code: string | null = null;
    if (point.lat != null && point.lng != null) {
      for (const zone of zoneList) {
        if (zone.polygon.length >= 3 && pointInPolygon(point.lat, point.lng, zone.polygon)) {
          zone_id = zone.id;
          zone_code = zone.code;
          break;
        }
      }
    }
    return {
      unit_id: point.unit_id,
      unit_barcode: point.unit_barcode,
      current_status: unitsForDropsMap.get(point.unit_id)?.status || "",
      current_cell_id: unitsForDropsMap.get(point.unit_id)?.cell_id || null,
      dropped_at: point.happened_at,
      courier_user_id: point.courier_user_id,
      courier_name: point.courier_name,
      note: point.note,
      ops_status: point.ops_status,
      color_key: point.color_key,
      color_hex: point.color_hex,
      lat: point.lat,
      lng: point.lng,
      zone_id,
      zone_code,
    };
  });

  const latestLocationByCourierId = new Map<
    string,
    { lat: number | null; lng: number | null; recorded_at: string; accuracy_m: number | null }
  >();
  if (filteredShiftCourierIds.length > 0) {
    const latestLocationsResult = await supabaseAdmin
      .from("courier_locations")
      .select("courier_user_id, lat, lng, recorded_at, accuracy_m")
      .eq("warehouse_id", warehouseId)
      .in("courier_user_id", filteredShiftCourierIds)
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

  const liveCouriers = filteredOpenShifts.map((shift) => ({
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
    style:
      (zone.code || "").trim().toLowerCase() === TARGET_WAREHOUSE_ZONE_CODE
        ? TARGET_WAREHOUSE_ZONE_STYLE
        : extractZoneStyle(zone.meta),
  }));

  const targetZone = zones.find(
    (zone) => (zone.code || "").trim().toLowerCase() === TARGET_WAREHOUSE_ZONE_CODE,
  );

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
