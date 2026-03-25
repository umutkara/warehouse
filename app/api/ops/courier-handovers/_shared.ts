import { NextResponse } from "next/server";

import { hasAnyRole } from "@/app/api/_shared/role-access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

const ALLOWED_WAREHOUSE_ROLES = [
  "worker",
  "manager",
  "head",
  "admin",
  "hub_worker",
  "ops",
  "logistics",
] as const;

export type HandoverWorkflowStatus = "pending" | "received" | "lost";
export type HandoverSourceKind = "expected" | "extra";
export type ReceiveVia = "courier_receiving" | "regular_receiving";

type HandoverSessionRow = {
  id: string;
  shift_id: string | null;
  courier_user_id: string | null;
  status: string | null;
  started_at: string | null;
  confirmed_at: string | null;
  receiver_user_id: string | null;
  note: string | null;
  meta?: unknown;
};

type HandoverItemRow = {
  id: string;
  handover_session_id: string;
  unit_id: string | null;
  task_id: string | null;
  condition_status: string | null;
  meta?: unknown;
};

type UnitRow = {
  id: string;
  barcode?: string | null;
  status?: string | null;
  cell_id?: string | null;
};

export type HandoverComputedItem = {
  handover_item_id: string;
  handover_session_id: string;
  task_id: string | null;
  unit_id: string;
  unit_barcode: string;
  current_status: string | null;
  current_cell_id: string | null;
  condition_status: string | null;
  source_kind: HandoverSourceKind;
  workflow_status: HandoverWorkflowStatus;
  received_at: string | null;
  received_by: string | null;
  received_via: ReceiveVia | null;
  lost_at: string | null;
  lost_by: string | null;
};

export type HandoverComputedSession = {
  handover_session_id: string;
  shift_id: string | null;
  courier_user_id: string;
  courier_name: string;
  status: string | null;
  started_at: string | null;
  confirmed_at: string | null;
  receiver_user_id: string | null;
  note: string | null;
  expected_total: number;
  received_total: number;
  remaining_total: number;
  lost_total: number;
  extra_total: number;
  remaining_items: HandoverComputedItem[];
  received_items: HandoverComputedItem[];
  extra_items: HandoverComputedItem[];
  lost_items: HandoverComputedItem[];
};

export function parseMs(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function readHandoverItemMeta(meta: unknown): {
  sourceKind: HandoverSourceKind;
  workflowStatus: HandoverWorkflowStatus;
  hasExplicitStatus: boolean;
  receivedAt: string | null;
  receivedBy: string | null;
  receivedVia: ReceiveVia | null;
  lostAt: string | null;
  lostBy: string | null;
} {
  const record = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
  const sourceKind = record.source_kind === "extra" ? "extra" : "expected";
  const rawStatus =
    record.receiving_status === "received" || record.receiving_status === "lost"
      ? (record.receiving_status as HandoverWorkflowStatus)
      : record.receiving_status === "pending"
        ? "pending"
        : null;
  const receivedVia =
    record.received_via === "courier_receiving" || record.received_via === "regular_receiving"
      ? (record.received_via as ReceiveVia)
      : null;
  return {
    sourceKind,
    workflowStatus: rawStatus ?? "pending",
    hasExplicitStatus: rawStatus !== null,
    receivedAt: typeof record.received_at === "string" ? record.received_at : null,
    receivedBy: typeof record.received_by === "string" ? record.received_by : null,
    receivedVia,
    lostAt: typeof record.lost_at === "string" ? record.lost_at : null,
    lostBy: typeof record.lost_by === "string" ? record.lost_by : null,
  };
}

export function mergeHandoverItemMeta(
  meta: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    merged[key] = value;
  }
  return merged;
}

export async function requireWarehouseHandoverAccess() {
  const supabase = await supabaseServer();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("warehouse_id, role, full_name")
    .eq("id", auth.user.id)
    .single();

  if (profileError || !profile?.warehouse_id) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 }),
    };
  }

  if (!hasAnyRole(profile.role, [...ALLOWED_WAREHOUSE_ROLES])) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    supabase,
    user: auth.user,
    profile,
  };
}

export async function loadComputedHandovers({
  warehouseId,
  statuses,
  handoverId,
}: {
  warehouseId: string;
  statuses?: string[];
  handoverId?: string;
}): Promise<HandoverComputedSession[]> {
  let sessionsQuery = supabaseAdmin
    .from("warehouse_handover_sessions")
    .select("id, shift_id, courier_user_id, status, started_at, confirmed_at, receiver_user_id, note, meta")
    .eq("warehouse_id", warehouseId)
    .order("started_at", { ascending: false })
    .limit(200);

  if (handoverId) {
    sessionsQuery = sessionsQuery.eq("id", handoverId);
  } else if (statuses?.length) {
    sessionsQuery = sessionsQuery.in("status", statuses);
  }

  const { data: sessions, error: sessionsError } = await sessionsQuery;
  if (sessionsError) {
    throw new Error(sessionsError.message);
  }
  if (!sessions?.length) return [];

  const sessionRows = sessions as HandoverSessionRow[];
  const sessionIds = sessionRows.map((session) => session.id);

  const { data: items, error: itemsError } = await supabaseAdmin
    .from("warehouse_handover_items")
    .select("id, handover_session_id, unit_id, task_id, condition_status, meta")
    .in("handover_session_id", sessionIds);
  if (itemsError) {
    throw new Error(itemsError.message);
  }

  const itemRows = (items || []) as HandoverItemRow[];
  const unitIds = [...new Set(itemRows.map((item) => item.unit_id).filter(Boolean))] as string[];
  const courierIds = [
    ...new Set(sessionRows.map((session) => session.courier_user_id).filter(Boolean)),
  ] as string[];

  const [unitsResult, couriersResult, binCellsResult] = await Promise.all([
    unitIds.length
      ? supabaseAdmin
          .from("units")
          .select("id, barcode, status, cell_id")
          .in("id", unitIds)
      : Promise.resolve({ data: [] as UnitRow[], error: null }),
    courierIds.length
      ? supabaseAdmin.from("profiles").select("id, full_name").in("id", courierIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; full_name?: string | null }>,
          error: null,
        }),
    supabaseAdmin.from("warehouse_cells_map").select("id").eq("warehouse_id", warehouseId).eq("cell_type", "bin"),
  ]);

  if (unitsResult.error) throw new Error(unitsResult.error.message);
  if (couriersResult.error) throw new Error(couriersResult.error.message);
  if (binCellsResult.error) throw new Error(binCellsResult.error.message);

  const binCellIds = (binCellsResult.data || []).map((cell) => cell.id).filter(Boolean);
  const unitMovesResult =
    unitIds.length > 0 && binCellIds.length > 0
      ? await supabaseAdmin
          .from("unit_moves")
          .select("unit_id, created_at")
          .eq("warehouse_id", warehouseId)
          .in("unit_id", unitIds)
          .in("to_cell_id", binCellIds)
          .order("created_at", { ascending: false })
      : { data: [] as Array<{ unit_id: string; created_at: string }>, error: null };
  if (unitMovesResult.error) {
    throw new Error(unitMovesResult.error.message);
  }

  const sessionById = new Map(sessionRows.map((session) => [session.id, session]));
  const unitById = new Map(((unitsResult.data || []) as UnitRow[]).map((unit) => [unit.id, unit]));
  const courierNameById = new Map(
    (couriersResult.data || []).map((row) => [row.id, row.full_name || "Без имени"]),
  );
  const latestBinMoveByUnitId = new Map<string, string>();
  for (const move of unitMovesResult.data || []) {
    if (!latestBinMoveByUnitId.has(move.unit_id)) {
      latestBinMoveByUnitId.set(move.unit_id, move.created_at);
    }
  }

  const computedBySessionId = new Map<string, HandoverComputedSession>();
  for (const session of sessionRows) {
    if (!session.courier_user_id) continue;
    computedBySessionId.set(session.id, {
      handover_session_id: session.id,
      shift_id: session.shift_id,
      courier_user_id: session.courier_user_id,
      courier_name: courierNameById.get(session.courier_user_id) || "Без имени",
      status: session.status,
      started_at: session.started_at,
      confirmed_at: session.confirmed_at,
      receiver_user_id: session.receiver_user_id,
      note: session.note,
      expected_total: 0,
      received_total: 0,
      remaining_total: 0,
      lost_total: 0,
      extra_total: 0,
      remaining_items: [],
      received_items: [],
      extra_items: [],
      lost_items: [],
    });
  }

  for (const item of itemRows) {
    if (!item.unit_id) continue;
    const session = sessionById.get(item.handover_session_id);
    const computedSession = computedBySessionId.get(item.handover_session_id);
    if (!session || !computedSession) continue;

    const metaInfo = readHandoverItemMeta(item.meta);
    const latestBinMoveAt = latestBinMoveByUnitId.get(item.unit_id);
    let workflowStatus = metaInfo.workflowStatus;
    if (!metaInfo.hasExplicitStatus) {
      if (metaInfo.sourceKind === "extra") {
        workflowStatus = "received";
      } else {
        const sessionMs = parseMs(session.confirmed_at || session.started_at);
        const binMoveMs = parseMs(latestBinMoveAt);
        workflowStatus = binMoveMs > 0 && sessionMs > 0 && binMoveMs >= sessionMs ? "received" : "pending";
      }
    }

    const unit = unitById.get(item.unit_id);
    const computedItem: HandoverComputedItem = {
      handover_item_id: item.id,
      handover_session_id: item.handover_session_id,
      task_id: item.task_id,
      unit_id: item.unit_id,
      unit_barcode: unit?.barcode || item.unit_id,
      current_status: unit?.status || null,
      current_cell_id: unit?.cell_id || null,
      condition_status: item.condition_status,
      source_kind: metaInfo.sourceKind,
      workflow_status: workflowStatus,
      received_at: metaInfo.receivedAt,
      received_by: metaInfo.receivedBy,
      received_via: metaInfo.receivedVia,
      lost_at: metaInfo.lostAt,
      lost_by: metaInfo.lostBy,
    };

    if (computedItem.source_kind === "extra") {
      computedSession.extra_total += 1;
      computedSession.extra_items.push(computedItem);
      continue;
    }

    computedSession.expected_total += 1;
    if (computedItem.workflow_status === "received") {
      computedSession.received_total += 1;
      computedSession.received_items.push(computedItem);
    } else if (computedItem.workflow_status === "lost") {
      computedSession.lost_total += 1;
      computedSession.lost_items.push(computedItem);
    } else {
      computedSession.remaining_total += 1;
      computedSession.remaining_items.push(computedItem);
    }
  }

  return Array.from(computedBySessionId.values())
    .map((session) => ({
      ...session,
      remaining_items: session.remaining_items.sort((a, b) => a.unit_barcode.localeCompare(b.unit_barcode)),
      received_items: session.received_items.sort((a, b) => a.unit_barcode.localeCompare(b.unit_barcode)),
      extra_items: session.extra_items.sort((a, b) => a.unit_barcode.localeCompare(b.unit_barcode)),
      lost_items: session.lost_items.sort((a, b) => {
        return parseMs(b.lost_at || "") - parseMs(a.lost_at || "");
      }),
    }))
    .sort((a, b) => parseMs(b.started_at || b.confirmed_at || "") - parseMs(a.started_at || a.confirmed_at || ""));
}

export async function findResolvableHandoverItemByUnit({
  warehouseId,
  unitId,
}: {
  warehouseId: string;
  unitId: string;
}): Promise<{
  itemId: string;
  meta: unknown;
  sessionId: string;
  sessionStatus: string | null;
} | null> {
  const { data: items, error: itemsError } = await supabaseAdmin
    .from("warehouse_handover_items")
    .select("id, handover_session_id, meta")
    .eq("unit_id", unitId)
    .limit(50);
  if (itemsError || !items?.length) return null;

  const sessionIds = [...new Set(items.map((item) => item.handover_session_id).filter(Boolean))];
  const { data: sessions, error: sessionsError } = await supabaseAdmin
    .from("warehouse_handover_sessions")
    .select("id, status, started_at, confirmed_at")
    .eq("warehouse_id", warehouseId)
    .in("id", sessionIds);
  if (sessionsError || !sessions?.length) return null;

  const sessionById = new Map(
    sessions.map((session) => [
      session.id,
      {
        status: session.status,
        sortMs: parseMs(session.started_at || session.confirmed_at || ""),
      },
    ]),
  );

  const candidates = items
    .map((item) => {
      const session = sessionById.get(item.handover_session_id);
      if (!session) return null;
      const metaInfo = readHandoverItemMeta(item.meta);
      if (metaInfo.sourceKind !== "expected") return null;
      if (metaInfo.workflowStatus !== "pending" && metaInfo.workflowStatus !== "lost") return null;
      return {
        itemId: item.id,
        meta: item.meta,
        sessionId: item.handover_session_id,
        sessionStatus: session.status,
        sortMs: session.sortMs,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b?.sortMs || 0) - (a?.sortMs || 0));

  const match = candidates[0];
  if (!match) return null;
  return {
    itemId: match.itemId,
    meta: match.meta,
    sessionId: match.sessionId,
    sessionStatus: match.sessionStatus,
  };
}
