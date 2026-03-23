import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasAnyRole } from "@/app/api/_shared/role-access";
import { resolveDropColor } from "@/lib/courier/drop-color";

const ALLOWED_ROLES = ["ops", "logistics", "admin", "head", "manager"] as const;

function extractOpsStatus(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const record = meta as Record<string, unknown>;
  return typeof record.ops_status === "string" && record.ops_status.trim()
    ? record.ops_status.trim()
    : null;
}

function parseMs(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET() {
  const supabase = await supabaseServer();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("warehouse_id, role")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile?.warehouse_id) {
    return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
  }
  if (!hasAnyRole(profile.role, [...ALLOWED_ROLES])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const warehouseId = profile.warehouse_id;

  const { data: sessions, error: sessionsError } = await supabaseAdmin
    .from("warehouse_handover_sessions")
    .select("id, courier_user_id, status, started_at, confirmed_at")
    .eq("warehouse_id", warehouseId)
    .in("status", ["draft", "confirmed"])
    .order("confirmed_at", { ascending: false })
    .limit(200);
  if (sessionsError) {
    return NextResponse.json({ error: sessionsError.message }, { status: 500 });
  }
  if (!sessions?.length) {
    return NextResponse.json({ ok: true, pending_groups: [] });
  }

  const sessionIds = sessions.map((session) => session.id);
  const { data: handoverItems, error: itemsError } = await supabaseAdmin
    .from("warehouse_handover_items")
    .select("id, handover_session_id, unit_id, task_id, condition_status, meta")
    .in("handover_session_id", sessionIds);
  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }
  if (!handoverItems?.length) {
    return NextResponse.json({ ok: true, pending_groups: [] });
  }

  const unitIds = [...new Set(handoverItems.map((item) => item.unit_id).filter(Boolean))];
  if (!unitIds.length) {
    return NextResponse.json({ ok: true, pending_groups: [] });
  }

  const [unitsResult, droppedEventsResult, binCellsResult] = await Promise.all([
    supabaseAdmin
      .from("units")
      .select("id, barcode, status, cell_id, meta")
      .in("id", unitIds),
    supabaseAdmin
      .from("courier_task_events")
      .select("id, task_id, unit_id, happened_at, proof_meta")
      .eq("warehouse_id", warehouseId)
      .eq("event_type", "dropped")
      .in("unit_id", unitIds)
      .order("happened_at", { ascending: false }),
    supabaseAdmin
      .from("warehouse_cells_map")
      .select("id")
      .eq("warehouse_id", warehouseId)
      .eq("cell_type", "bin"),
  ]);

  if (unitsResult.error) return NextResponse.json({ error: unitsResult.error.message }, { status: 500 });
  if (droppedEventsResult.error) {
    return NextResponse.json({ error: droppedEventsResult.error.message }, { status: 500 });
  }
  if (binCellsResult.error) return NextResponse.json({ error: binCellsResult.error.message }, { status: 500 });

  const binCellIds = (binCellsResult.data || []).map((cell) => cell.id).filter(Boolean);
  const unitMovesResult =
    binCellIds.length > 0
      ? await supabaseAdmin
          .from("unit_moves")
          .select("unit_id, created_at")
          .eq("warehouse_id", warehouseId)
          .in("unit_id", unitIds)
          .in("to_cell_id", binCellIds)
          .order("created_at", { ascending: false })
      : { data: [] as Array<{ unit_id: string; created_at: string }>, error: null };
  if (unitMovesResult.error) {
    return NextResponse.json({ error: unitMovesResult.error.message }, { status: 500 });
  }

  const sessionById = new Map((sessions || []).map((session) => [session.id, session]));
  const unitById = new Map((unitsResult.data || []).map((unit) => [unit.id, unit]));
  const latestDroppedEventByUnitId = new Map<string, (typeof droppedEventsResult.data)[number]>();
  for (const event of droppedEventsResult.data || []) {
    if (!latestDroppedEventByUnitId.has(event.unit_id)) {
      latestDroppedEventByUnitId.set(event.unit_id, event);
    }
  }
  const latestBinMoveByUnitId = new Map<string, string>();
  for (const move of unitMovesResult.data || []) {
    if (!latestBinMoveByUnitId.has(move.unit_id)) {
      latestBinMoveByUnitId.set(move.unit_id, move.created_at);
    }
  }

  const courierIds = [...new Set(sessions.map((session) => session.courier_user_id).filter(Boolean))];
  const { data: courierProfiles, error: couriersError } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name")
    .in("id", courierIds);
  if (couriersError) return NextResponse.json({ error: couriersError.message }, { status: 500 });
  const courierNameById = new Map((courierProfiles || []).map((courier) => [courier.id, courier.full_name || "Без имени"]));

  const grouped = new Map<
    string,
    {
      courier_user_id: string;
      courier_name: string;
      handover_session_id: string;
      handover_confirmed_at: string | null;
      items: Array<{
        handover_item_id: string;
        task_id: string | null;
        unit_id: string;
        unit_barcode: string;
        current_status: string | null;
        current_cell_id: string | null;
        dropped_at: string;
        ops_status: string | null;
        color_key: string;
        color_hex: string;
      }>;
    }
  >();

  for (const item of handoverItems || []) {
    if (!item.unit_id) continue;
    const session = sessionById.get(item.handover_session_id);
    if (!session) continue;

    const droppedEvent = latestDroppedEventByUnitId.get(item.unit_id);
    const sessionMs = parseMs(session.confirmed_at || session.started_at);

    const binMoveMs = parseMs(latestBinMoveByUnitId.get(item.unit_id));
    if (binMoveMs > 0 && sessionMs > 0 && binMoveMs >= sessionMs) {
      continue;
    }

    const unit = unitById.get(item.unit_id);
    const unitMeta =
      unit?.meta && typeof unit.meta === "object" ? (unit.meta as Record<string, unknown>) : {};
    const opsStatus = droppedEvent ? extractOpsStatus(droppedEvent.proof_meta) : null;
    const color = resolveDropColor({
      opsStatus: opsStatus ?? undefined,
      overrideColorKey: unitMeta.drop_point_color_override,
    });

    const droppedAt = droppedEvent?.happened_at ?? session.started_at ?? session.confirmed_at ?? "";

    if (!grouped.has(session.courier_user_id)) {
      grouped.set(session.courier_user_id, {
        courier_user_id: session.courier_user_id,
        courier_name: courierNameById.get(session.courier_user_id) || "Без имени",
        handover_session_id: session.id,
        handover_confirmed_at: session.confirmed_at,
        items: [],
      });
    }

    grouped.get(session.courier_user_id)!.items.push({
      handover_item_id: item.id,
      task_id: item.task_id || null,
      unit_id: item.unit_id,
      unit_barcode: unit?.barcode || item.unit_id,
      current_status: unit?.status || null,
      current_cell_id: unit?.cell_id || null,
      dropped_at: droppedAt,
      ops_status: opsStatus,
      color_key: color.color_key,
      color_hex: color.color_hex,
    });
  }

  const pendingGroups = Array.from(grouped.values())
    .map((group) => ({
      ...group,
      total_units: group.items.length,
      items: group.items.sort((a, b) => parseMs(b.dropped_at) - parseMs(a.dropped_at)),
    }))
    .filter((group) => group.total_units > 0)
    .sort(
      (a, b) =>
        parseMs(b.handover_confirmed_at || "") - parseMs(a.handover_confirmed_at || ""),
    );

  return NextResponse.json({
    ok: true,
    pending_groups: pendingGroups,
  });
}
