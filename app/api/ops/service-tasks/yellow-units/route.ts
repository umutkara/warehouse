import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasAnyRole } from "@/app/api/_shared/role-access";
import { resolveDropColor } from "@/lib/courier/drop-color";

const ALLOWED_ROLES = ["ops", "logistics", "admin", "head", "manager"] as const;
const MAX_DROP_EVENTS = 500;

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

function extractOpsStatus(proofMeta: unknown): string | null {
  if (!proofMeta || typeof proofMeta !== "object") return null;
  const record = proofMeta as JsonRecord;
  return asTrimmedString(record.ops_status);
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

function parseIsoMs(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * GET /api/ops/service-tasks/yellow-units
 * Returns yellow dropped units (courier drops, sent_to_sc) that can be assigned to blue/green.
 */
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

  const dropEventsResult = await supabaseAdmin
    .from("courier_task_events")
    .select("id, task_id, unit_id, courier_user_id, happened_at, lat, lng, note, proof_meta")
    .eq("warehouse_id", warehouseId)
    .eq("event_type", "dropped")
    .order("happened_at", { ascending: false })
    .limit(MAX_DROP_EVENTS);

  if (dropEventsResult.error) {
    return NextResponse.json({ error: dropEventsResult.error.message }, { status: 500 });
  }

  const dropEvents = dropEventsResult.data || [];
  const dropUnitIds = [...new Set(dropEvents.map((e) => e.unit_id).filter(Boolean))];
  if (dropUnitIds.length === 0) {
    return NextResponse.json({ ok: true, units: [] });
  }

  const [unitsResult, binCellsResult] = await Promise.all([
    supabaseAdmin
      .from("units")
      .select("id, barcode, status, cell_id, meta")
      .eq("warehouse_id", warehouseId)
      .in("id", dropUnitIds),
    supabaseAdmin
      .from("warehouse_cells_map")
      .select("id")
      .eq("warehouse_id", warehouseId)
      .eq("cell_type", "bin"),
  ]);

  if (unitsResult.error) return NextResponse.json({ error: unitsResult.error.message }, { status: 500 });
  if (binCellsResult.error) return NextResponse.json({ error: binCellsResult.error.message }, { status: 500 });

  const unitsMap = new Map(
    (unitsResult.data || []).map((u) => [
      u.id,
      { barcode: u.barcode || "", status: u.status || "", cell_id: u.cell_id, meta: u.meta || null },
    ]),
  );

  const binCellIds = (binCellsResult.data || []).map((c) => c.id).filter(Boolean);
  let latestBinMoveByUnitId = new Map<string, string>();
  if (binCellIds.length > 0) {
    const movesResult = await supabaseAdmin
      .from("unit_moves")
      .select("unit_id, created_at")
      .eq("warehouse_id", warehouseId)
      .in("unit_id", dropUnitIds)
      .in("to_cell_id", binCellIds)
      .order("created_at", { ascending: false });
    if (!movesResult.error && movesResult.data) {
      for (const m of movesResult.data) {
        if (!latestBinMoveByUnitId.has(m.unit_id)) latestBinMoveByUnitId.set(m.unit_id, m.created_at);
      }
    }
  }

  const courierIds = [...new Set(dropEvents.map((e) => e.courier_user_id).filter(Boolean))];
  const courierMap = new Map<string, string>();
  if (courierIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", courierIds);
    for (const p of profiles || []) {
      courierMap.set(p.id, p.full_name || "Без имени");
    }
  }

  const yellowUnits: Array<{
    unit_id: string;
    unit_barcode: string;
    current_status: string;
    current_cell_id: string | null;
    dropped_at: string;
    courier_name: string;
    ops_status: string | null;
    scenario: string | null;
    color_key: string;
    color_hex: string;
  }> = [];

  const latestByUnitId = new Map<string, (typeof dropEvents)[number]>();
  for (const event of dropEvents) {
    if (!event.unit_id || latestByUnitId.has(event.unit_id)) continue;

    const unitInfo = unitsMap.get(event.unit_id);
    const unitMeta = (unitInfo?.meta && typeof unitInfo.meta === "object"
      ? unitInfo.meta
      : {}) as JsonRecord;
    const opsStatus =
      extractOpsStatus(event.proof_meta) ||
      (typeof unitMeta.ops_status === "string" && unitMeta.ops_status.trim()
        ? unitMeta.ops_status.trim()
        : null);
    const color = resolveDropColor({
      opsStatus,
      overrideColorKey: unitMeta.drop_point_color_override,
    });

    if (color.color_key !== "yellow") continue;

    const dropMs = parseIsoMs(event.happened_at);
    const movedToBinAt = latestBinMoveByUnitId.get(event.unit_id);
    const movedToBinMs = movedToBinAt ? parseIsoMs(movedToBinAt) : null;
    const isReturnedToBin = dropMs !== null && movedToBinMs !== null && movedToBinMs >= dropMs;
    if (isReturnedToBin) continue;

    const lat = toFiniteNumber(event.lat);
    const lng = toFiniteNumber(event.lng);
    if (lat === null || lng === null || (lat === 0 && lng === 0)) continue;

    latestByUnitId.set(event.unit_id, event);

    yellowUnits.push({
      unit_id: event.unit_id,
      unit_barcode: unitInfo?.barcode || event.unit_id,
      current_status: unitInfo?.status || "",
      current_cell_id: unitInfo?.cell_id || null,
      dropped_at: event.happened_at,
      courier_name: courierMap.get(event.courier_user_id || "") || "Неизвестный",
      ops_status: opsStatus,
      scenario: extractScenario(unitMeta),
      color_key: color.color_key,
      color_hex: color.color_hex,
    });
  }

  yellowUnits.sort((a, b) => parseIsoMs(b.dropped_at)! - parseIsoMs(a.dropped_at)!);

  return NextResponse.json({
    ok: true,
    units: yellowUnits,
  });
}
