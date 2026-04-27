import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireUserProfile } from "@/app/api/_shared/user-profile";

export const dynamic = "force-dynamic";

type PickingTaskRow = {
  id: string;
  created_at: string;
  scenario: string | null;
  unit_id: string | null;
  picked_at?: string | null;
  picked_by?: string | null;
  completed_by?: string | null;
  completed_at?: string | null;
};

type TaskUnitRow = {
  picking_task_id: string;
  unit_id: string;
};

type ShipmentOutRow = {
  unit_id: string;
  out_at: string;
};

type ShipmentReturnedRow = {
  unit_id: string;
  returned_at: string;
};

type OutboundShipmentRow = {
  unit_id: string;
  out_at: string | null;
  returned_at: string | null;
};

type UnitMetaRow = {
  id: string;
  barcode?: string | null;
  meta?: {
    ops_status?: string | null;
    ops_status_comment?: string | null;
  } | null;
};

type UnitMoveRow = {
  unit_id: string;
  created_at: string;
  to_cell_id: string | null;
};

type UnitCellRow = {
  id: string;
  cell_id: string | null;
};

type CellCodeRow = {
  id: string;
  code: string;
  cell_type?: string | null;
  meta?: {
    tag?: string | null;
    tags?: string[] | null;
    description?: string | null;
  } | null;
};

const EXCLUDED_SCENARIO_KEYWORD = "diaqnostika";
const EXCLUDED_SCENARIO_NS_REGEX = /(^|[^a-z0-9])ns([^a-z0-9]|$)/i;
const REQUIRED_SCENARIO_REGEX = /geri\s+qaytarma/i;
const EXCLUDED_KUDA = new Set(["pudo", "клиент"]);
const EXCLUDED_OPS_MARK = "ns";
const MAX_RANGE_DAYS = 180;
const DEFAULT_RANGE_DAYS = 14;
const PAGE_SIZE = 1000;
const IN_CHUNK = 200;
const MAX_RETURNED_EXAMPLES_PER_KUDA = 30;

function isDateOnly(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function getDateDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function parseDateRange(req: Request) {
  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const today = new Date().toISOString().slice(0, 10);
  const fallbackFrom = getDateDaysAgo(DEFAULT_RANGE_DAYS - 1);

  const from = isDateOnly(fromParam) ? fromParam : fallbackFrom;
  const to = isDateOnly(toParam) ? toParam : today;

  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return { ok: false as const, error: "Invalid date format. Use YYYY-MM-DD." };
  }

  if (fromDate > toDate) {
    return { ok: false as const, error: "`from` must be earlier than or equal to `to`." };
  }

  const diffMs = toDate.getTime() - fromDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  if (diffDays > MAX_RANGE_DAYS) {
    return { ok: false as const, error: `Date range is too large. Max ${MAX_RANGE_DAYS} days.` };
  }

  return {
    ok: true as const,
    from,
    to,
    fromIso: `${from}T00:00:00.000Z`,
    toIso: `${to}T23:59:59.999Z`,
  };
}

function listDateKeys(from: string, to: string): string[] {
  const keys: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);

  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return keys;
}

function normalizeKuda(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function foldText(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ıİI]/g, "i")
    .toLowerCase()
    .trim();
}

function extractKudaFromScenario(scenario: string | null | undefined): string {
  if (!scenario || !scenario.trim()) return "Без КУДА";

  const normalized = scenario.trim();
  const parts = normalized
    .split(/\s*(?:→|->)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 3) return normalizeKuda(parts[1]);
  if (parts.length === 2) return normalizeKuda(parts[1]);
  return normalizeKuda(normalized);
}

function extractSellerNameFromScenario(scenario: string | null | undefined): string {
  if (!scenario || !scenario.trim()) return "Не определен";
  const match = scenario.match(/Mer[çc]ant:\s*([^\r\n]+)/i);
  if (match?.[1]) {
    const cleaned = match[1].replace(/\s+/g, " ").trim();
    if (cleaned) return cleaned;
  }
  return "Не определен";
}

function hasScenarioKeyword(scenario: string | null | undefined): boolean {
  const normalized = foldText(scenario);
  if (!normalized) return false;
  if (normalized.includes(EXCLUDED_SCENARIO_KEYWORD)) return true;
  return EXCLUDED_SCENARIO_NS_REGEX.test(normalized);
}

function hasRequiredScenarioPhrase(scenario: string | null | undefined): boolean {
  return REQUIRED_SCENARIO_REGEX.test(foldText(scenario));
}

function hasOpsNsMark(meta: UnitMetaRow["meta"]): boolean {
  const status = String(meta?.ops_status || "").trim().toLowerCase();
  const comment = String(meta?.ops_status_comment || "").trim().toLowerCase();
  if (status === EXCLUDED_OPS_MARK) return true;
  return /(^|[^a-z0-9])ns([^a-z0-9]|$)/i.test(comment);
}

async function fetchCreatedTasks(
  warehouseId: string,
  fromIso: string,
  toIso: string,
): Promise<{ data: PickingTaskRow[]; error?: string }> {
  const all: PickingTaskRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("picking_tasks")
      .select("id, created_at, scenario, unit_id, picked_at, picked_by, completed_by, completed_at")
      .eq("warehouse_id", warehouseId)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) return { data: [], error: error.message };
    if (!data?.length) break;

    all.push(...(data as PickingTaskRow[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return { data: all };
}

async function fetchProfileNamesByIds(userIds: string[]): Promise<{ data: Array<{ id: string; full_name: string | null; role: string | null }>; error?: string }> {
  if (userIds.length === 0) return { data: [] };
  const all: Array<{ id: string; full_name: string | null; role: string | null }> = [];
  for (let i = 0; i < userIds.length; i += IN_CHUNK) {
    const chunk = userIds.slice(i, i + IN_CHUNK);
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, role")
      .in("id", chunk);
    if (error) return { data: [], error: error.message };
    if (data?.length) all.push(...(data as Array<{ id: string; full_name: string | null; role: string | null }>));
  }
  return { data: all };
}

async function fetchTaskUnitsByTaskIds(taskIds: string[]): Promise<{ data: TaskUnitRow[]; error?: string }> {
  if (taskIds.length === 0) return { data: [] };
  const all: TaskUnitRow[] = [];

  for (let i = 0; i < taskIds.length; i += IN_CHUNK) {
    const chunk = taskIds.slice(i, i + IN_CHUNK);
    const { data, error } = await supabaseAdmin
      .from("picking_task_units")
      .select("picking_task_id, unit_id")
      .in("picking_task_id", chunk);

    if (error) {
      return { data: [], error: error.message };
    }
    if (data?.length) all.push(...(data as TaskUnitRow[]));
  }

  return { data: all };
}

async function fetchTaskUnitsByUnitIds(unitIds: string[]): Promise<{ data: Array<{ unit_id: string; picking_task_id: string }>; error?: string }> {
  if (unitIds.length === 0) return { data: [] };
  const all: Array<{ unit_id: string; picking_task_id: string }> = [];

  for (let i = 0; i < unitIds.length; i += IN_CHUNK) {
    const chunk = unitIds.slice(i, i + IN_CHUNK);
    const { data, error } = await supabaseAdmin
      .from("picking_task_units")
      .select("unit_id, picking_task_id")
      .in("unit_id", chunk);

    if (error) return { data: [], error: error.message };
    if (data?.length) all.push(...(data as Array<{ unit_id: string; picking_task_id: string }>));
  }

  return { data: all };
}

async function fetchTasksByIds(taskIds: string[], warehouseId: string): Promise<{ data: PickingTaskRow[]; error?: string }> {
  if (taskIds.length === 0) return { data: [] };
  const all: PickingTaskRow[] = [];

  for (let i = 0; i < taskIds.length; i += IN_CHUNK) {
    const chunk = taskIds.slice(i, i + IN_CHUNK);
    const { data, error } = await supabaseAdmin
      .from("picking_tasks")
      .select("id, created_at, scenario, unit_id")
      .eq("warehouse_id", warehouseId)
      .in("id", chunk);

    if (error) return { data: [], error: error.message };
    if (data?.length) all.push(...(data as PickingTaskRow[]));
  }

  return { data: all };
}

async function fetchLegacyTasksByUnitIds(unitIds: string[], warehouseId: string): Promise<{ data: PickingTaskRow[]; error?: string }> {
  if (unitIds.length === 0) return { data: [] };
  const all: PickingTaskRow[] = [];

  for (let i = 0; i < unitIds.length; i += IN_CHUNK) {
    const chunk = unitIds.slice(i, i + IN_CHUNK);
    const { data, error } = await supabaseAdmin
      .from("picking_tasks")
      .select("id, created_at, scenario, unit_id")
      .eq("warehouse_id", warehouseId)
      .in("unit_id", chunk);

    if (error) return { data: [], error: error.message };
    if (data?.length) all.push(...(data as PickingTaskRow[]));
  }

  return { data: all };
}

async function fetchOutRowsByPeriod(
  warehouseId: string,
  fromIso: string,
  toIso: string,
): Promise<{ data: ShipmentOutRow[]; error?: string }> {
  const all: ShipmentOutRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("outbound_shipments")
      .select("unit_id, out_at")
      .eq("warehouse_id", warehouseId)
      .gte("out_at", fromIso)
      .lte("out_at", toIso)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) return { data: [], error: error.message };
    if (!data?.length) break;

    all.push(
      ...(data as Array<{ unit_id: string; out_at: string | null }>)
        .filter((row) => Boolean(row.unit_id && row.out_at))
        .map((row) => ({ unit_id: row.unit_id, out_at: row.out_at as string }))
    );
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return { data: all };
}

async function fetchReturnedRowsByPeriod(
  warehouseId: string,
  fromIso: string,
  toIso: string,
): Promise<{ data: ShipmentReturnedRow[]; error?: string }> {
  const all: ShipmentReturnedRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("outbound_shipments")
      .select("unit_id, returned_at")
      .eq("warehouse_id", warehouseId)
      .gte("returned_at", fromIso)
      .lte("returned_at", toIso)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) return { data: [], error: error.message };
    if (!data?.length) break;

    all.push(
      ...(data as Array<{ unit_id: string; returned_at: string | null }>)
        .filter((row) => Boolean(row.unit_id && row.returned_at))
        .map((row) => ({ unit_id: row.unit_id, returned_at: row.returned_at as string }))
    );
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return { data: all };
}

async function fetchAllShipmentsByUnitIds(
  unitIds: string[],
  fromIso: string,
  toIso: string,
): Promise<{ data: OutboundShipmentRow[]; error?: string }> {
  if (unitIds.length === 0) return { data: [] };
  const all: OutboundShipmentRow[] = [];

  for (let i = 0; i < unitIds.length; i += IN_CHUNK) {
    const chunk = unitIds.slice(i, i + IN_CHUNK);
    const { data, error } = await supabaseAdmin
      .from("outbound_shipments")
      .select("unit_id, out_at, returned_at")
      .in("unit_id", chunk)
      .gte("out_at", fromIso)
      .lte("out_at", toIso);

    if (error) {
      return { data: [], error: error.message };
    }
    if (data?.length) all.push(...(data as OutboundShipmentRow[]));
  }

  return { data: all };
}

async function fetchUnitsMeta(unitIds: string[]): Promise<{ data: UnitMetaRow[]; error?: string }> {
  if (unitIds.length === 0) return { data: [] };
  const all: UnitMetaRow[] = [];

  for (let i = 0; i < unitIds.length; i += IN_CHUNK) {
    const chunk = unitIds.slice(i, i + IN_CHUNK);
    const { data, error } = await supabaseAdmin
      .from("units")
      .select("id, barcode, meta")
      .in("id", chunk);

    if (error) {
      return { data: [], error: error.message };
    }
    if (data?.length) all.push(...(data as UnitMetaRow[]));
  }

  return { data: all };
}

async function fetchUnitsCellIds(unitIds: string[]): Promise<{ data: UnitCellRow[]; error?: string }> {
  if (unitIds.length === 0) return { data: [] };
  const all: UnitCellRow[] = [];
  for (let i = 0; i < unitIds.length; i += IN_CHUNK) {
    const chunk = unitIds.slice(i, i + IN_CHUNK);
    const { data, error } = await supabaseAdmin
      .from("units")
      .select("id, cell_id")
      .in("id", chunk);
    if (error) return { data: [], error: error.message };
    if (data?.length) all.push(...(data as UnitCellRow[]));
  }
  return { data: all };
}

async function fetchCellCodes(cellIds: string[]): Promise<{ data: CellCodeRow[]; error?: string }> {
  if (cellIds.length === 0) return { data: [] };
  const all: CellCodeRow[] = [];
  for (let i = 0; i < cellIds.length; i += IN_CHUNK) {
    const chunk = cellIds.slice(i, i + IN_CHUNK);
    const { data, error } = await supabaseAdmin
      .from("warehouse_cells_map")
      .select("id, code, cell_type, meta")
      .in("id", chunk);
    if (error) return { data: [], error: error.message };
    if (data?.length) all.push(...(data as CellCodeRow[]));
  }
  return { data: all };
}

function extractCellTag(meta: CellCodeRow["meta"]): string | null {
  if (!meta || typeof meta !== "object") return null;
  if (typeof meta.tag === "string" && meta.tag.trim()) return meta.tag.trim();
  if (Array.isArray(meta.tags)) {
    const firstTag = meta.tags.find((value) => typeof value === "string" && value.trim());
    if (firstTag) return firstTag.trim();
  }
  if (typeof meta.description === "string" && meta.description.trim()) return meta.description.trim();
  return null;
}

async function fetchBinCellIds(warehouseId: string): Promise<{ data: string[]; error?: string }> {
  const { data, error } = await supabaseAdmin
    .from("warehouse_cells_map")
    .select("id")
    .eq("warehouse_id", warehouseId)
    .eq("cell_type", "bin");
  if (error) return { data: [], error: error.message };
  return { data: (data || []).map((row: any) => row.id).filter(Boolean) };
}

async function fetchPickingCellIds(warehouseId: string): Promise<{ data: string[]; error?: string }> {
  const { data, error } = await supabaseAdmin
    .from("warehouse_cells_map")
    .select("id")
    .eq("warehouse_id", warehouseId)
    .eq("cell_type", "picking");
  if (error) return { data: [], error: error.message };
  return { data: (data || []).map((row: any) => row.id).filter(Boolean) };
}

async function fetchUnitMovesToBin(unitIds: string[], binCellIds: string[]): Promise<{ data: UnitMoveRow[]; error?: string }> {
  if (unitIds.length === 0 || binCellIds.length === 0) return { data: [] };
  const all: UnitMoveRow[] = [];

  for (let i = 0; i < unitIds.length; i += IN_CHUNK) {
    const chunk = unitIds.slice(i, i + IN_CHUNK);
    const { data, error } = await supabaseAdmin
      .from("unit_moves")
      .select("unit_id, created_at, to_cell_id")
      .in("unit_id", chunk)
      .in("to_cell_id", binCellIds);

    if (error) {
      return { data: [], error: error.message };
    }
    if (data?.length) all.push(...(data as UnitMoveRow[]));
  }

  return { data: all };
}

async function fetchUnitMovesToPicking(unitIds: string[], pickingCellIds: string[]): Promise<{ data: UnitMoveRow[]; error?: string }> {
  if (unitIds.length === 0 || pickingCellIds.length === 0) return { data: [] };
  const all: UnitMoveRow[] = [];

  for (let i = 0; i < unitIds.length; i += IN_CHUNK) {
    const chunk = unitIds.slice(i, i + IN_CHUNK);
    const { data, error } = await supabaseAdmin
      .from("unit_moves")
      .select("unit_id, created_at, to_cell_id")
      .in("unit_id", chunk)
      .in("to_cell_id", pickingCellIds);

    if (error) return { data: [], error: error.message };
    if (data?.length) all.push(...(data as UnitMoveRow[]));
  }

  return { data: all };
}

function chooseLatestScenario(
  prev: { scenario: string | null; created_at: string } | undefined,
  next: { scenario: string | null; created_at: string },
) {
  if (!next.scenario || !next.scenario.trim()) return prev;
  if (!prev) return next;
  return new Date(next.created_at) > new Date(prev.created_at) ? next : prev;
}

function dayAtOffset(iso: string, offsetMinutes: number): string {
  const ms = new Date(iso).getTime();
  return new Date(ms + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const supabase = await supabaseServer();

  const auth = await requireUserProfile(supabase, {
    allowedRoles: ["ops", "admin", "head", "manager", "logistics"],
  });
  if (!auth.ok) return auth.response;

  const dateRange = parseDateRange(req);
  if (!dateRange.ok) {
    return NextResponse.json({ error: dateRange.error }, { status: 400 });
  }
  const { from, to } = dateRange;
  const timezone = "Asia/Baku";

  const shiftDate = (dateOnly: string, days: number) => {
    const date = new Date(`${dateOnly}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };

  const dayInTimeZone = (iso: string) => {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(new Date(iso));
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (!year || !month || !day) return "";
    return `${year}-${month}-${day}`;
  };

  const dateKeys = listDateKeys(from, to);
  const dateKeySet = new Set(dateKeys);
  const sourceByTargetDay = new Map(dateKeys.map((day) => [day, shiftDate(day, -1)]));

  const queryFrom = shiftDate(from, -2);
  const queryTo = shiftDate(to, 2);
  const queryFromIso = `${queryFrom}T00:00:00.000Z`;
  const queryToIso = `${queryTo}T23:59:59.999Z`;

  const createdTasksRes = await fetchCreatedTasks(auth.profile.warehouse_id, queryFromIso, queryToIso);
  if (createdTasksRes.error) return NextResponse.json({ error: createdTasksRes.error }, { status: 400 });
  const createdTasks = createdTasksRes.data;
  const createdTaskById = new Map(createdTasks.map((task) => [task.id, task]));

  const createdTaskIds = createdTasks.map((task) => task.id);
  const createdTaskUnitsRes = await fetchTaskUnitsByTaskIds(createdTaskIds);
  if (createdTaskUnitsRes.error) return NextResponse.json({ error: createdTaskUnitsRes.error }, { status: 400 });

  const taskUnitsByTaskId = new Map<string, Set<string>>();
  const createdUnitIds = new Set<string>();
  for (const task of createdTasks) {
    const bucket = taskUnitsByTaskId.get(task.id) || new Set<string>();
    if (task.unit_id) {
      bucket.add(task.unit_id);
      createdUnitIds.add(task.unit_id);
    }
    taskUnitsByTaskId.set(task.id, bucket);
  }
  for (const row of createdTaskUnitsRes.data) {
    const bucket = taskUnitsByTaskId.get(row.picking_task_id) || new Set<string>();
    bucket.add(row.unit_id);
    taskUnitsByTaskId.set(row.picking_task_id, bucket);
    createdUnitIds.add(row.unit_id);
  }

  const createdUnitIdsArray = Array.from(createdUnitIds);
  const [unitsMetaRes, createdUnitShipmentsRes, binCellIdsRes] = await Promise.all([
    fetchUnitsMeta(createdUnitIdsArray),
    fetchAllShipmentsByUnitIds(createdUnitIdsArray, dateRange.fromIso, dateRange.toIso),
    fetchBinCellIds(auth.profile.warehouse_id),
  ]);
  if (unitsMetaRes.error) return NextResponse.json({ error: unitsMetaRes.error }, { status: 400 });
  if (createdUnitShipmentsRes.error) {
    return NextResponse.json({ error: createdUnitShipmentsRes.error }, { status: 400 });
  }
  if (binCellIdsRes.error) {
    return NextResponse.json({ error: binCellIdsRes.error }, { status: 400 });
  }

  const unitHasOpsNs = new Map<string, boolean>();
  const unitBarcodeById = new Map<string, string>();
  for (const row of unitsMetaRes.data) {
    unitHasOpsNs.set(row.id, hasOpsNsMark(row.meta || null));
    if (row.barcode) {
      unitBarcodeById.set(row.id, row.barcode);
    }
  }

  const binMovesRes = await fetchUnitMovesToBin(createdUnitIdsArray, binCellIdsRes.data);

  if (binMovesRes.error) {
    return NextResponse.json({ error: binMovesRes.error }, { status: 400 });
  }

  const outTimesByUnitAndDay = new Map<string, Map<string, string[]>>();
  for (const shipment of createdUnitShipmentsRes.data) {
    if (!shipment.unit_id || !shipment.out_at) continue;
    const day = dayInTimeZone(shipment.out_at);
    if (!dateKeySet.has(day)) {
      continue;
    }
    const byDay = outTimesByUnitAndDay.get(shipment.unit_id) || new Map<string, string[]>();
    const times = byDay.get(day) || [];
    times.push(shipment.out_at);
    byDay.set(day, times);
    outTimesByUnitAndDay.set(shipment.unit_id, byDay);
  }

  const binMoveTimesByUnit = new Map<string, string[]>();
  for (const move of binMovesRes.data) {
    if (!move.unit_id || !move.created_at) continue;
    const times = binMoveTimesByUnit.get(move.unit_id) || [];
    times.push(move.created_at);
    binMoveTimesByUnit.set(move.unit_id, times);
  }
  for (const [unitId, times] of binMoveTimesByUnit.entries()) {
    times.sort((a, b) => a.localeCompare(b));
    binMoveTimesByUnit.set(unitId, times);
  }

  const dayCreated = new Map<string, number>(dateKeys.map((key) => [key, 0]));
  const dayOut = new Map<string, number>(dateKeys.map((key) => [key, 0]));
  const dayReturned = new Map<string, number>(dateKeys.map((key) => [key, 0]));
  const dayKudaCreated = new Map<string, Map<string, number>>(dateKeys.map((key) => [key, new Map()]));

  const kudaCreated = new Map<string, number>();
  const kudaOut = new Map<string, number>();
  const kudaReturned = new Map<string, number>();
  const kudaReturnedExamples = new Map<string, Array<{ barcode: string; accepted_in_bin_at: string }>>();
  const merchantSellerReturned = new Map<string, number>();
  const merchantSellerReturnedOrders = new Map<string, Array<{ barcode: string; accepted_in_bin_at: string }>>();
  const notOutUnitIds = new Set<string>();
  const outTaskIds = new Set<string>();

  let excludedByKeyword = 0;
  let excludedByRequiredScenario = 0;
  let excludedByKuda = 0;
  let excludedByOpsNs = 0;

  const tasksByTargetDay = new Map<
    string,
    Array<{ taskId: string; unitIds: string[]; kuda: string; sellerName: string }>
  >(dateKeys.map((day) => [day, []]));
  const notOutUnitIdsByDay = new Map<string, Set<string>>(dateKeys.map((day) => [day, new Set<string>()]));

  for (const task of createdTasks) {
    const createdDayBaku = dayInTimeZone(task.created_at);
    const targetDay = shiftDate(createdDayBaku, 1);
    const expectedSourceDay = sourceByTargetDay.get(targetDay);
    if (!dateKeySet.has(targetDay) || expectedSourceDay !== createdDayBaku) continue;

    const scenario = task.scenario || null;
    if (!hasRequiredScenarioPhrase(scenario)) {
      excludedByRequiredScenario += 1;
      continue;
    }
    if (hasScenarioKeyword(scenario)) {
      excludedByKeyword += 1;
      continue;
    }

    const kuda = extractKudaFromScenario(scenario);
    const sellerName = extractSellerNameFromScenario(scenario);
    if (EXCLUDED_KUDA.has(kuda.toLowerCase())) {
      excludedByKuda += 1;
      continue;
    }

    const unitIds = Array.from(taskUnitsByTaskId.get(task.id) || []);
    if (unitIds.some((unitId) => unitHasOpsNs.get(unitId))) {
      excludedByOpsNs += 1;
      continue;
    }

    const list = tasksByTargetDay.get(targetDay) || [];
    list.push({ taskId: task.id, unitIds, kuda, sellerName });
    tasksByTargetDay.set(targetDay, list);

    dayCreated.set(targetDay, (dayCreated.get(targetDay) || 0) + 1);
    kudaCreated.set(kuda, (kudaCreated.get(kuda) || 0) + 1);
    const breakdown = dayKudaCreated.get(targetDay)!;
    breakdown.set(kuda, (breakdown.get(kuda) || 0) + 1);
  }

  const hasOutOnDay = (unitId: string, day: string) => {
    const byDay = outTimesByUnitAndDay.get(unitId);
    return Boolean(byDay && (byDay.get(day)?.length || 0) > 0);
  };

  const hasReturnedAfterOutOnDay = (unitId: string, day: string) => {
    const outTimes = outTimesByUnitAndDay.get(unitId)?.get(day);
    if (!outTimes?.length) return false;
    const earliestOut = outTimes.reduce((min, current) => (current < min ? current : min), outTimes[0]);
    const moveTimes = binMoveTimesByUnit.get(unitId) || [];
    return moveTimes.some((moveTime) => moveTime > earliestOut);
  };

  const getReturnedUnitDetailOnDay = (unitId: string, day: string) => {
    const outTimes = outTimesByUnitAndDay.get(unitId)?.get(day);
    if (!outTimes?.length) return null;
    const earliestOut = outTimes.reduce((min, current) => (current < min ? current : min), outTimes[0]);
    const moveTimes = binMoveTimesByUnit.get(unitId) || [];
    const acceptedInBinAt = moveTimes.find((moveTime) => moveTime > earliestOut);
    if (!acceptedInBinAt) return null;
    return { barcode: unitBarcodeById.get(unitId) || unitId, accepted_in_bin_at: acceptedInBinAt };
  };

  for (const day of dateKeys) {
    const dayTasks = tasksByTargetDay.get(day) || [];
    let outCount = 0;
    let returnedCount = 0;

    for (const task of dayTasks) {
      const hasOut = task.unitIds.some((unitId) => hasOutOnDay(unitId, day));
      const hasReturned = task.unitIds.some((unitId) => hasReturnedAfterOutOnDay(unitId, day));

      if (hasOut) {
        outCount += 1;
        kudaOut.set(task.kuda, (kudaOut.get(task.kuda) || 0) + 1);
        outTaskIds.add(task.taskId);
      } else {
        const dayNotOutUnits = notOutUnitIdsByDay.get(day) || new Set<string>();
        task.unitIds.forEach((unitId) => {
          notOutUnitIds.add(unitId);
          dayNotOutUnits.add(unitId);
        });
        notOutUnitIdsByDay.set(day, dayNotOutUnits);
      }

      if (hasReturned) {
        returnedCount += 1;
        kudaReturned.set(task.kuda, (kudaReturned.get(task.kuda) || 0) + 1);

        const returnedDetail = task.unitIds
          .map((unitId) => getReturnedUnitDetailOnDay(unitId, day))
          .filter((detail): detail is { barcode: string; accepted_in_bin_at: string } => Boolean(detail))
          .sort((a, b) => a.accepted_in_bin_at.localeCompare(b.accepted_in_bin_at))[0];

        if (returnedDetail) {
          const existing = kudaReturnedExamples.get(task.kuda) || [];
          if (existing.length < MAX_RETURNED_EXAMPLES_PER_KUDA) {
            existing.push(returnedDetail);
            kudaReturnedExamples.set(task.kuda, existing);
          }
        }

        if (foldText(task.kuda) === foldText("Мерчант")) {
          merchantSellerReturned.set(
            task.sellerName,
            (merchantSellerReturned.get(task.sellerName) || 0) + 1
          );
          if (returnedDetail) {
            const orders = merchantSellerReturnedOrders.get(task.sellerName) || [];
            if (orders.length < MAX_RETURNED_EXAMPLES_PER_KUDA) {
              orders.push(returnedDetail);
              merchantSellerReturnedOrders.set(task.sellerName, orders);
            }
          }
        }
      }
    }

    dayOut.set(day, outCount);
    dayReturned.set(day, returnedCount);
  }

  const byDay = dateKeys.map((dateKey) => {
    const breakdown = Array.from((dayKudaCreated.get(dateKey) || new Map()).entries())
      .map(([kuda, created_tasks]) => ({ kuda, created_tasks }))
      .sort((a, b) => b.created_tasks - a.created_tasks);

    return {
      date: dateKey,
      created_tasks: dayCreated.get(dateKey) || 0,
      out_tasks: dayOut.get(dateKey) || 0,
      out_returned_tasks: dayReturned.get(dateKey) || 0,
      kuda_breakdown: breakdown,
    };
  });

  const kudaKeys = new Set<string>([
    ...kudaCreated.keys(),
    ...kudaOut.keys(),
    ...kudaReturned.keys(),
  ]);

  const byKuda = Array.from(kudaKeys)
    .map((kuda) => ({
      kuda,
      created_tasks: kudaCreated.get(kuda) || 0,
      out_tasks: kudaOut.get(kuda) || 0,
      out_returned_tasks: kudaReturned.get(kuda) || 0,
      returned_orders: (kudaReturnedExamples.get(kuda) || [])
        .slice()
        .sort((a, b) => b.accepted_in_bin_at.localeCompare(a.accepted_in_bin_at)),
    }))
    .sort((a, b) => b.out_tasks - a.out_tasks || b.created_tasks - a.created_tasks);

  const createdKudaCategories = byKuda.filter((row) => row.created_tasks > 0).length;
  const merchantSellerReturnedBreakdown = Array.from(merchantSellerReturned.entries())
    .map(([seller_name, out_returned_tasks]) => ({
      seller_name,
      out_returned_tasks,
      returned_orders: (merchantSellerReturnedOrders.get(seller_name) || [])
        .slice()
        .sort((a, b) => b.accepted_in_bin_at.localeCompare(a.accepted_in_bin_at)),
    }))
    .sort((a, b) => b.out_returned_tasks - a.out_returned_tasks || a.seller_name.localeCompare(b.seller_name, "ru"));

  const summary = byDay.reduce(
    (acc, day) => {
      acc.total_tasks += day.created_tasks;
      acc.out_tasks += day.out_tasks;
      acc.out_returned_tasks += day.out_returned_tasks;
      return acc;
    },
    { total_tasks: 0, out_tasks: 0, out_returned_tasks: 0 }
  );

  const notOutUnitsRes = await fetchUnitsCellIds(Array.from(notOutUnitIds));
  if (notOutUnitsRes.error) {
    return NextResponse.json({ error: notOutUnitsRes.error }, { status: 400 });
  }

  const notOutCellIds = Array.from(
    new Set(notOutUnitsRes.data.map((row) => row.cell_id).filter((value): value is string => Boolean(value)))
  );

  const notOutCellsRes = await fetchCellCodes(notOutCellIds);
  if (notOutCellsRes.error) {
    return NextResponse.json({ error: notOutCellsRes.error }, { status: 400 });
  }

  const cellInfoById = new Map(
    notOutCellsRes.data.map((row) => [
      row.id,
      {
        code: row.code,
        cell_type: row.cell_type || null,
        tag: extractCellTag(row.meta || null),
      },
    ])
  );

  const notOutCells = Array.from(
    new Map(
      notOutUnitsRes.data.map((row) => {
        if (!row.cell_id) return ["Без ячейки", { code: "Без ячейки", tag: null }] as const;
        const cellInfo = cellInfoById.get(row.cell_id);
        const code = cellInfo?.code || row.cell_id;
        const tag = cellInfo?.tag || null;
        return [`${code}::${tag || ""}`, { code, tag }] as const;
      })
    ).values()
  ).sort((a, b) => a.code.localeCompare(b.code, "ru"));

  const notOutUnitIdsArray = Array.from(notOutUnitIds);
  const pickingCellIdsRes = await fetchPickingCellIds(auth.profile.warehouse_id);
  if (pickingCellIdsRes.error) {
    return NextResponse.json({ error: pickingCellIdsRes.error }, { status: 400 });
  }
  const notOutPickingMovesRes = await fetchUnitMovesToPicking(notOutUnitIdsArray, pickingCellIdsRes.data);
  if (notOutPickingMovesRes.error) {
    return NextResponse.json({ error: notOutPickingMovesRes.error }, { status: 400 });
  }
  const latestPickingMoveByUnit = new Map<string, string>();
  for (const move of notOutPickingMovesRes.data) {
    if (!move.unit_id || !move.created_at) continue;
    const prev = latestPickingMoveByUnit.get(move.unit_id);
    if (!prev || move.created_at > prev) {
      latestPickingMoveByUnit.set(move.unit_id, move.created_at);
    }
  }
  const latestPickingCellByUnit = new Map<string, { created_at: string; to_cell_id: string }>();
  for (const move of notOutPickingMovesRes.data) {
    if (!move.unit_id || !move.created_at || !move.to_cell_id) continue;
    const prev = latestPickingCellByUnit.get(move.unit_id);
    if (!prev || move.created_at > prev.created_at) {
      latestPickingCellByUnit.set(move.unit_id, { created_at: move.created_at, to_cell_id: move.to_cell_id });
    }
  }

  const fallbackCellIdByUnit = new Map<string, string>();
  for (const row of notOutUnitsRes.data) {
    if (row.cell_id) continue;
    const fallback = latestPickingCellByUnit.get(row.id)?.to_cell_id;
    if (fallback) {
      fallbackCellIdByUnit.set(row.id, fallback);
    }
  }

  const missingCellIdsFromFallback = Array.from(
    new Set(
      Array.from(fallbackCellIdByUnit.values()).filter(
        (cellId) => Boolean(cellId) && !cellInfoById.has(cellId)
      )
    )
  );
  if (missingCellIdsFromFallback.length > 0) {
    const fallbackCellsRes = await fetchCellCodes(missingCellIdsFromFallback);
    if (fallbackCellsRes.error) {
      return NextResponse.json({ error: fallbackCellsRes.error }, { status: 400 });
    }
    for (const row of fallbackCellsRes.data) {
      if (!cellInfoById.has(row.id)) {
        cellInfoById.set(row.id, {
          code: row.code,
          cell_type: row.cell_type || null,
          tag: extractCellTag(row.meta || null),
        });
      }
    }
  }

  const effectiveCellIdByUnit = new Map<string, string | null>();
  for (const row of notOutUnitsRes.data) {
    effectiveCellIdByUnit.set(row.id, row.cell_id || fallbackCellIdByUnit.get(row.id) || null);
  }

  const notOutCellsEffective = Array.from(
    new Map(
      notOutUnitsRes.data.map((row) => {
        const effectiveCellId = effectiveCellIdByUnit.get(row.id) || null;
        if (!effectiveCellId) return ["Без ячейки", { code: "Без ячейки", tag: null }] as const;
        const cellInfo = cellInfoById.get(effectiveCellId);
        const code = cellInfo?.code || effectiveCellId;
        const tag = cellInfo?.tag || null;
        return [`${code}::${tag || ""}`, { code, tag }] as const;
      })
    ).values()
  ).sort((a, b) => a.code.localeCompare(b.code, "ru"));

  const notOutCellCodeByUnitEffective = notOutUnitsRes.data.map((row) => {
    const effectiveCellId = effectiveCellIdByUnit.get(row.id) || null;
    if (!effectiveCellId) return "Без ячейки";
    const cellInfo = cellInfoById.get(effectiveCellId);
    return cellInfo?.code || effectiveCellId;
  });

  const notOutKgtCountEffective = notOutCellCodeByUnitEffective.filter((code) =>
    /(kqt|kgt)/i.test(String(code))
  ).length;
  const notOutMbtCountEffective = Math.max(0, notOutCellCodeByUnitEffective.length - notOutKgtCountEffective);

  const notOutZoneCounts = new Map<string, number>();
  for (const row of notOutUnitsRes.data) {
    const effectiveCellId = effectiveCellIdByUnit.get(row.id) || null;
    const zone = effectiveCellId
      ? String(cellInfoById.get(effectiveCellId)?.cell_type || "unknown")
      : "without_cell";
    notOutZoneCounts.set(zone, (notOutZoneCounts.get(zone) || 0) + 1);
  }
  const notOutZoneBreakdown = Array.from(notOutZoneCounts.entries())
    .map(([zone, count]) => ({ zone, count }))
    .sort((a, b) => b.count - a.count || a.zone.localeCompare(b.zone));

  const notOutBarcodes = notOutUnitsRes.data
    .map((row) => {
      const effectiveCellId = effectiveCellIdByUnit.get(row.id) || null;
      const cellInfo = effectiveCellId ? cellInfoById.get(effectiveCellId) : null;
      const cellCode = effectiveCellId ? (cellInfo?.code || effectiveCellId) : "Без ячейки";
      return {
        unit_id: row.id,
        barcode: unitBarcodeById.get(row.id) || row.id,
        cell_code: cellCode,
      };
    })
    .sort((a, b) => a.barcode.localeCompare(b.barcode, "ru"));

  const includedTaskIds = Array.from(
    new Set(Array.from(tasksByTargetDay.values()).flatMap((rows) => rows.map((row) => row.taskId)))
  );
  const includedTasks = includedTaskIds
    .map((taskId) => createdTaskById.get(taskId))
    .filter((task): task is PickingTaskRow => Boolean(task));

  const minIso = (values: Array<string | null | undefined>) => {
    const prepared = values.filter((value): value is string => Boolean(value)).sort((a, b) => a.localeCompare(b));
    return prepared[0] || null;
  };
  const maxIso = (values: Array<string | null | undefined>) => {
    const prepared = values.filter((value): value is string => Boolean(value)).sort((a, b) => b.localeCompare(a));
    return prepared[0] || null;
  };

  const scannedTasks = includedTasks.filter((task) => Boolean(task.picked_at));
  const startedAt = minIso(scannedTasks.map((task) => task.picked_at || null));
  const firstScanAt = startedAt;
  const lastScanAt = maxIso(scannedTasks.map((task) => task.picked_at || null));
  const scannedTasksTimeline = includedTasks
    .filter((task): task is PickingTaskRow & { picked_at: string } => Boolean(task.picked_at))
    .map((task) => {
      const unitIds = Array.from(taskUnitsByTaskId.get(task.id) || []);
      const barcodes = unitIds
        .map((unitId) => unitBarcodeById.get(unitId) || unitId)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "ru"));
      return {
        task_id: task.id,
        picked_at: task.picked_at,
        barcode: barcodes[0] || "—",
      };
    })
    .sort((a, b) => a.picked_at.localeCompare(b.picked_at));
  const firstStartedUnit = scannedTasksTimeline[0] || null;
  const lastStartedUnit = scannedTasksTimeline[scannedTasksTimeline.length - 1] || null;
  const outTasksForPeriod = Array.from(outTaskIds)
    .map((taskId) => createdTaskById.get(taskId))
    .filter((task): task is PickingTaskRow => Boolean(task));
  const outTasksWithPickedAt = outTasksForPeriod.filter((task) => Boolean(task.picked_at)).length;
  const outTasksWithoutPickedAt = Math.max(0, outTasksForPeriod.length - outTasksWithPickedAt);
  const includedTasksWithCompletedAt = includedTasks.filter((task) => Boolean(task.completed_at)).length;

  const tasksByTsdUser = new Map<string, number>();
  for (const task of scannedTasks) {
    if (!task.picked_by) continue;
    tasksByTsdUser.set(task.picked_by, (tasksByTsdUser.get(task.picked_by) || 0) + 1);
  }
  const shippedTasksByUser = new Map<string, number>();
  for (const task of outTasksForPeriod) {
    const actorId = task.picked_by || null;
    if (!actorId) continue;
    shippedTasksByUser.set(actorId, (shippedTasksByUser.get(actorId) || 0) + 1);
  }

  const tsdUserIds = Array.from(tasksByTsdUser.keys());
  const shippedUserIds = Array.from(shippedTasksByUser.keys());
  const allUserIds = Array.from(new Set([...tsdUserIds, ...shippedUserIds]));
  const tsdProfilesRes = await fetchProfileNamesByIds(allUserIds);
  if (tsdProfilesRes.error) {
    return NextResponse.json({ error: tsdProfilesRes.error }, { status: 400 });
  }
  const profileNameById = new Map(
    tsdProfilesRes.data.map((profile) => [profile.id, profile.full_name || null])
  );
  const profileRoleById = new Map(
    tsdProfilesRes.data.map((profile) => [profile.id, profile.role || null])
  );
  const tasks_per_tsd = tsdUserIds
    .map((userId) => ({
      user_id: userId,
      user_name: profileNameById.get(userId) || "Без имени",
      tasks_count: tasksByTsdUser.get(userId) || 0,
    }))
    .sort((a, b) => b.tasks_count - a.tasks_count || a.user_name.localeCompare(b.user_name, "ru"));
  const shipped_tasks_per_user = shippedUserIds
    .filter((userId) => String(profileRoleById.get(userId) || "").toLowerCase() === "worker")
    .map((userId) => ({
      user_id: userId,
      user_name: profileNameById.get(userId) || "Без имени",
      tasks_count: shippedTasksByUser.get(userId) || 0,
    }))
    .sort((a, b) => b.tasks_count - a.tasks_count || a.user_name.localeCompare(b.user_name, "ru"));

  return NextResponse.json({
    ok: true,
    filters: {
      from,
      to,
      timezone,
      created_source_day_offset: -1,
      excluded_scenario_keyword: `${EXCLUDED_SCENARIO_KEYWORD}, NS`,
      excluded_kuda: Array.from(EXCLUDED_KUDA),
      excluded_ops_mark: EXCLUDED_OPS_MARK.toUpperCase(),
    },
    summary: {
      ...summary,
      kuda_categories: createdKudaCategories,
      excluded_by_keyword: excludedByKeyword + excludedByRequiredScenario,
      excluded_by_kuda: excludedByKuda,
      excluded_by_ops_ns: excludedByOpsNs,
      not_out_kgt_count: notOutKgtCountEffective,
      not_out_mbt_count: notOutMbtCountEffective,
      not_out_cells: notOutCellsEffective,
      not_out_zone_breakdown: notOutZoneBreakdown,
      not_out_barcodes: notOutBarcodes,
      team_efficiency: {
        based_on_created_tasks: includedTasks.length,
        started_at: startedAt,
        first_scan_at: firstScanAt,
        last_scan_at: lastScanAt,
        scanned_orders_count: scannedTasks.length,
        completed_orders_count: includedTasksWithCompletedAt,
        out_tasks_count: outTasksForPeriod.length,
        out_tasks_without_tsd_scan_count: outTasksWithoutPickedAt,
        first_started_unit_barcode: firstStartedUnit?.barcode || null,
        first_started_unit_at: firstStartedUnit?.picked_at || null,
        last_started_unit_barcode: lastStartedUnit?.barcode || null,
        last_started_unit_at: lastStartedUnit?.picked_at || null,
        tasks_per_tsd,
        shipped_tasks_per_user,
      },
    },
    by_day: byDay,
    by_kuda: byKuda,
    merchant_seller_returned_breakdown: merchantSellerReturnedBreakdown,
  });
}
