import { NextResponse } from "next/server";
import { requireUserProfile } from "@/app/api/_shared/user-profile";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { ROUTE_PLANNING_VIEW_ROLES } from "@/lib/routeplanning/access";
import { resolveDropColor } from "@/lib/courier/drop-color";

const ACTIVE_TASK_STATUSES = ["claimed", "in_route", "arrived", "dropped"] as const;
const OPEN_SHIFT_STATUSES = ["open", "closing"] as const;
const MAX_LOCATIONS = 4000;
const MAX_EVENTS = 2000;
const MAX_TASKS = 1000;
const MAX_SHIFTS = 1000;
const MAX_HANDOVERS = 500;

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toIsoOrNull(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toPositiveInt(value: unknown, fallback: number, max: number): number {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string" && value.trim().length === 0) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractOpsStatus(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const record = meta as Record<string, unknown>;
  const status = record.ops_status;
  return typeof status === "string" && status.trim() ? status.trim() : null;
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sin1 = Math.sin(dLat / 2);
  const sin2 = Math.sin(dLng / 2);
  const x = sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const auth = await requireUserProfile(supabase, {
    profileSelect: "warehouse_id, role",
    allowedRoles: [...ROUTE_PLANNING_VIEW_ROLES],
  });
  if (!auth.ok) return auth.response;

  const warehouseId = String(auth.profile.warehouse_id);
  const url = new URL(req.url);
  const courierUserId = asString(url.searchParams.get("courierUserId"));
  const fromIso =
    toIsoOrNull(url.searchParams.get("from")) ||
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const toIso = toIsoOrNull(url.searchParams.get("to")) || new Date().toISOString();
  const eventType = asString(url.searchParams.get("eventType"));
  const shiftStatus = asString(url.searchParams.get("shiftStatus"));
  const taskStatus = asString(url.searchParams.get("taskStatus"));
  const handoverStatus = asString(url.searchParams.get("handoverStatus"));
  const limitLocations = toPositiveInt(url.searchParams.get("limitLocations"), 1200, MAX_LOCATIONS);
  const limitEvents = toPositiveInt(url.searchParams.get("limitEvents"), 500, MAX_EVENTS);
  const limitTasks = toPositiveInt(url.searchParams.get("limitTasks"), 350, MAX_TASKS);
  const limitShifts = toPositiveInt(url.searchParams.get("limitShifts"), 250, MAX_SHIFTS);
  const limitHandovers = toPositiveInt(url.searchParams.get("limitHandovers"), 100, MAX_HANDOVERS);

  const { data: couriers, error: couriersError } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, role")
    .eq("warehouse_id", warehouseId)
    .eq("role", "courier")
    .order("full_name", { ascending: true });
  if (couriersError) return NextResponse.json({ error: couriersError.message }, { status: 500 });

  const courierIds = (couriers || []).map((courier) => courier.id);
  const courierNameById = new Map(
    (couriers || []).map((courier) => [courier.id, courier.full_name || "Без имени"]),
  );

  if (!courierUserId) {
    const [openShiftsResult, activeTasksResult, latestLocationsResult, latestEventsResult] =
      await Promise.all([
        supabaseAdmin
          .from("courier_shifts")
          .select("id, courier_user_id, status, started_at")
          .eq("warehouse_id", warehouseId)
          .in("status", [...OPEN_SHIFT_STATUSES])
          .order("started_at", { ascending: false }),
        supabaseAdmin
          .from("courier_tasks")
          .select("courier_user_id, status")
          .eq("warehouse_id", warehouseId)
          .in("status", [...ACTIVE_TASK_STATUSES]),
        courierIds.length
          ? supabaseAdmin
              .from("courier_locations")
              .select("courier_user_id, lat, lng, recorded_at, accuracy_m")
              .eq("warehouse_id", warehouseId)
              .in("courier_user_id", courierIds)
              .order("recorded_at", { ascending: false })
          : Promise.resolve({ data: [] as any[], error: null }),
        courierIds.length
          ? supabaseAdmin
              .from("courier_task_events")
              .select("courier_user_id, event_type, happened_at")
              .eq("warehouse_id", warehouseId)
              .in("courier_user_id", courierIds)
              .gte("happened_at", fromIso)
              .lte("happened_at", toIso)
              .order("happened_at", { ascending: false })
              .limit(5000)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

    if (openShiftsResult.error) {
      return NextResponse.json({ error: openShiftsResult.error.message }, { status: 500 });
    }
    if (activeTasksResult.error) {
      return NextResponse.json({ error: activeTasksResult.error.message }, { status: 500 });
    }
    if (latestLocationsResult.error) {
      return NextResponse.json({ error: latestLocationsResult.error.message }, { status: 500 });
    }
    if (latestEventsResult.error) {
      return NextResponse.json({ error: latestEventsResult.error.message }, { status: 500 });
    }

    const latestLocationByCourier = new Map<string, any>();
    for (const row of latestLocationsResult.data || []) {
      if (!latestLocationByCourier.has(row.courier_user_id)) {
        latestLocationByCourier.set(row.courier_user_id, row);
      }
    }
    const openShiftByCourier = new Map<string, any>();
    for (const shift of openShiftsResult.data || []) {
      if (!openShiftByCourier.has(shift.courier_user_id)) {
        openShiftByCourier.set(shift.courier_user_id, shift);
      }
    }
    const activeTaskCountByCourier = new Map<string, number>();
    for (const row of activeTasksResult.data || []) {
      const key = row.courier_user_id;
      activeTaskCountByCourier.set(key, (activeTaskCountByCourier.get(key) || 0) + 1);
    }
    const eventStatsByCourier = new Map<
      string,
      { total: number; dropped: number; failed: number; returned: number; lastEventAt: string | null }
    >();
    for (const event of latestEventsResult.data || []) {
      const current = eventStatsByCourier.get(event.courier_user_id) || {
        total: 0,
        dropped: 0,
        failed: 0,
        returned: 0,
        lastEventAt: null,
      };
      current.total += 1;
      if (event.event_type === "dropped") current.dropped += 1;
      if (event.event_type === "failed") current.failed += 1;
      if (event.event_type === "returned") current.returned += 1;
      if (!current.lastEventAt) current.lastEventAt = event.happened_at;
      eventStatsByCourier.set(event.courier_user_id, current);
    }

    return NextResponse.json({
      ok: true,
      from: fromIso,
      to: toIso,
      couriers: (couriers || []).map((courier) => {
        const openShift = openShiftByCourier.get(courier.id) || null;
        const lastLocation = latestLocationByCourier.get(courier.id) || null;
        const stats = eventStatsByCourier.get(courier.id) || {
          total: 0,
          dropped: 0,
          failed: 0,
          returned: 0,
          lastEventAt: null,
        };
        return {
          courier_user_id: courier.id,
          courier_name: courier.full_name || "Без имени",
          role: courier.role,
          open_shift: openShift,
          active_tasks: activeTaskCountByCourier.get(courier.id) || 0,
          last_location: lastLocation
            ? {
                lat: toFiniteNumber(lastLocation.lat),
                lng: toFiniteNumber(lastLocation.lng),
                recorded_at: lastLocation.recorded_at,
                accuracy_m: toFiniteNumber(lastLocation.accuracy_m),
              }
            : null,
          stats,
        };
      }),
    });
  }

  if (!courierNameById.has(courierUserId)) {
    return NextResponse.json({ error: "Courier not found in this warehouse" }, { status: 404 });
  }

  let shiftsQuery = supabaseAdmin
    .from("courier_shifts")
    .select(
      "id, courier_user_id, status, started_at, closed_at, started_by, closed_by, close_approved_by, start_note, close_note, meta",
    )
    .eq("warehouse_id", warehouseId)
    .eq("courier_user_id", courierUserId)
    .order("started_at", { ascending: false })
    .limit(limitShifts);
  if (shiftStatus) shiftsQuery = shiftsQuery.eq("status", shiftStatus);
  shiftsQuery = shiftsQuery.gte("started_at", fromIso).lte("started_at", toIso);

  let tasksQuery = supabaseAdmin
    .from("courier_tasks")
    .select(
      "id, unit_id, shift_id, status, claimed_at, accepted_at, delivered_at, failed_at, returned_at, fail_reason, fail_comment, last_event_at, updated_at, meta",
    )
    .eq("warehouse_id", warehouseId)
    .eq("courier_user_id", courierUserId)
    .order("updated_at", { ascending: false })
    .limit(limitTasks);
  if (taskStatus) tasksQuery = tasksQuery.eq("status", taskStatus);
  tasksQuery = tasksQuery.gte("updated_at", fromIso).lte("updated_at", toIso);

  let eventsQuery = supabaseAdmin
    .from("courier_task_events")
    .select("id, task_id, unit_id, event_type, happened_at, lat, lng, note, proof_meta, event_id")
    .eq("warehouse_id", warehouseId)
    .eq("courier_user_id", courierUserId)
    .gte("happened_at", fromIso)
    .lte("happened_at", toIso)
    .order("happened_at", { ascending: false })
    .limit(limitEvents);
  if (eventType) eventsQuery = eventsQuery.eq("event_type", eventType);

  let locationsQuery = supabaseAdmin
    .from("courier_locations")
    .select("id, shift_id, zone_id, lat, lng, recorded_at, accuracy_m, speed_m_s, heading_deg, battery_level")
    .eq("warehouse_id", warehouseId)
    .eq("courier_user_id", courierUserId)
    .gte("recorded_at", fromIso)
    .lte("recorded_at", toIso)
    .order("recorded_at", { ascending: false })
    .limit(limitLocations);

  let handoversQuery = supabaseAdmin
    .from("warehouse_handover_sessions")
    .select("id, shift_id, status, started_at, confirmed_at, receiver_user_id, note, meta")
    .eq("warehouse_id", warehouseId)
    .eq("courier_user_id", courierUserId)
    .order("started_at", { ascending: false })
    .limit(limitHandovers);
  if (handoverStatus) handoversQuery = handoversQuery.eq("status", handoverStatus);
  handoversQuery = handoversQuery.gte("started_at", fromIso).lte("started_at", toIso);

  const [shiftsResult, tasksResult, eventsResult, locationsResult, handoversResult] =
    await Promise.all([
      shiftsQuery,
      tasksQuery,
      eventsQuery,
      locationsQuery,
      handoversQuery,
    ]);

  if (shiftsResult.error) return NextResponse.json({ error: shiftsResult.error.message }, { status: 500 });
  if (tasksResult.error) return NextResponse.json({ error: tasksResult.error.message }, { status: 500 });
  if (eventsResult.error) return NextResponse.json({ error: eventsResult.error.message }, { status: 500 });
  if (locationsResult.error) {
    return NextResponse.json({ error: locationsResult.error.message }, { status: 500 });
  }
  if (handoversResult.error) {
    return NextResponse.json({ error: handoversResult.error.message }, { status: 500 });
  }

  const { data: currentActiveTasksRows, error: currentActiveTasksError } = await supabaseAdmin
    .from("courier_tasks")
    .select(
      "id, unit_id, shift_id, status, claimed_at, accepted_at, delivered_at, failed_at, returned_at, fail_reason, fail_comment, last_event_at, updated_at, meta",
    )
    .eq("warehouse_id", warehouseId)
    .eq("courier_user_id", courierUserId)
    .in("status", [...ACTIVE_TASK_STATUSES]);
  if (currentActiveTasksError) {
    return NextResponse.json({ error: currentActiveTasksError.message }, { status: 500 });
  }

  const tasksInRangeRows = tasksResult.data || [];
  const nowMs = Date.now();
  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(toIso);
  const includeCurrentActiveTasks =
    !taskStatus &&
    Number.isFinite(fromMs) &&
    Number.isFinite(toMs) &&
    fromMs <= nowMs &&
    nowMs <= toMs;
  const tasksRows = taskStatus
    ? tasksInRangeRows
    : includeCurrentActiveTasks
      ? (() => {
        const merged = new Map<string, any>();
        for (const row of tasksInRangeRows) merged.set(row.id, row);
        for (const row of currentActiveTasksRows || []) merged.set(row.id, row);
        return Array.from(merged.values())
          .sort((a, b) => Date.parse(b.updated_at || "") - Date.parse(a.updated_at || ""))
          .slice(0, limitTasks);
      })()
      : tasksInRangeRows;

  const unitIds = [
    ...new Set(
      [...tasksRows.map((row) => row.unit_id), ...(eventsResult.data || []).map((row) => row.unit_id)].filter(Boolean),
    ),
  ] as string[];

  const { data: unitRows, error: unitsError } = unitIds.length
    ? await supabaseAdmin
        .from("units")
        .select("id, barcode, status, meta")
        .in("id", unitIds)
    : { data: [] as any[], error: null };
  if (unitsError) return NextResponse.json({ error: unitsError.message }, { status: 500 });
  const unitById = new Map((unitRows || []).map((unit) => [unit.id, unit]));

  const locationsAsc = [...(locationsResult.data || [])].reverse();
  let distanceMeters = 0;
  for (let index = 1; index < locationsAsc.length; index += 1) {
    const prev = locationsAsc[index - 1];
    const next = locationsAsc[index];
    const prevLat = toFiniteNumber(prev.lat);
    const prevLng = toFiniteNumber(prev.lng);
    const nextLat = toFiniteNumber(next.lat);
    const nextLng = toFiniteNumber(next.lng);
    if (prevLat === null || prevLng === null || nextLat === null || nextLng === null) continue;
    distanceMeters += haversineMeters({ lat: prevLat, lng: prevLng }, { lat: nextLat, lng: nextLng });
  }

  const eventBreakdown: Record<string, number> = {};
  for (const event of eventsResult.data || []) {
    eventBreakdown[event.event_type] = (eventBreakdown[event.event_type] || 0) + 1;
  }

  const taskStatusBreakdown: Record<string, number> = {};
  for (const task of tasksRows) {
    taskStatusBreakdown[task.status] = (taskStatusBreakdown[task.status] || 0) + 1;
  }

  const shiftStatusBreakdown: Record<string, number> = {};
  for (const shift of shiftsResult.data || []) {
    shiftStatusBreakdown[shift.status] = (shiftStatusBreakdown[shift.status] || 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    from: fromIso,
    to: toIso,
    courier: {
      courier_user_id: courierUserId,
      courier_name: courierNameById.get(courierUserId) || "Без имени",
      role: "courier",
    },
    summary: {
      shifts_count: (shiftsResult.data || []).length,
      tasks_count: tasksRows.length,
      events_count: (eventsResult.data || []).length,
      location_points_count: (locationsResult.data || []).length,
      handovers_count: (handoversResult.data || []).length,
      distance_km: Number((distanceMeters / 1000).toFixed(2)),
      shift_status_breakdown: shiftStatusBreakdown,
      task_status_breakdown: taskStatusBreakdown,
      event_breakdown: eventBreakdown,
    },
    shifts: (shiftsResult.data || []).map((shift) => ({
      ...shift,
      courier_name: courierNameById.get(shift.courier_user_id) || "Без имени",
    })),
    tasks: tasksRows.map((task) => ({
      ...task,
      unit: unitById.get(task.unit_id) || { id: task.unit_id, barcode: null, status: null },
    })),
    events: (eventsResult.data || []).map((event) => ({
      ...event,
      lat: toFiniteNumber(event.lat),
      lng: toFiniteNumber(event.lng),
      ops_status:
        extractOpsStatus(event.proof_meta) ||
        (typeof unitById.get(event.unit_id)?.meta?.ops_status === "string" &&
        unitById.get(event.unit_id)?.meta?.ops_status.trim()
          ? unitById.get(event.unit_id)?.meta?.ops_status.trim()
          : null),
      ...(event.event_type === "dropped"
        ? resolveDropColor({
            opsStatus:
              extractOpsStatus(event.proof_meta) ||
              (typeof unitById.get(event.unit_id)?.meta?.ops_status === "string" &&
              unitById.get(event.unit_id)?.meta?.ops_status.trim()
                ? unitById.get(event.unit_id)?.meta?.ops_status.trim()
                : null),
            overrideColorKey:
              unitById.get(event.unit_id)?.meta &&
              typeof unitById.get(event.unit_id)?.meta === "object"
                ? (unitById.get(event.unit_id)?.meta as Record<string, unknown>)
                    .drop_point_color_override
                : null,
          })
        : {
            color_key: null,
            color_hex: null,
          }),
      unit: unitById.get(event.unit_id) || { id: event.unit_id, barcode: null, status: null },
    })),
    locations: (locationsResult.data || []).map((location) => ({
      ...location,
      lat: toFiniteNumber(location.lat),
      lng: toFiniteNumber(location.lng),
      accuracy_m: toFiniteNumber(location.accuracy_m),
      speed_m_s: toFiniteNumber(location.speed_m_s),
      heading_deg: toFiniteNumber(location.heading_deg),
      battery_level: toFiniteNumber(location.battery_level),
    })),
    handovers: handoversResult.data || [],
  });
}

