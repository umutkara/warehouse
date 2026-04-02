import { supabaseAdmin } from "@/lib/supabase/admin";
import { getActivePickingTargetCellIdByUnitId } from "./active-picking-target-cell";

/**
 * Как в /api/units/list (до подмены rejected/ff): последний unit_moves.to_cell_id,
 * иначе units.cell_id, иначе целевая ячейка открытой picking-задачи.
 * out/shipped → null.
 */
export async function getDisplayCellIdsByUnitIds(
  warehouseId: string,
  units: Array<{ id: string; cell_id: string | null; status?: string | null }>,
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (units.length === 0) return result;

  const unitIds = units.map((u) => u.id).filter(Boolean);
  const lastMove = new Map<string, string>();
  const chunkSize = 400;
  for (let i = 0; i < unitIds.length; i += chunkSize) {
    const chunk = unitIds.slice(i, i + chunkSize);
    const { data: moves } = await supabaseAdmin
      .from("unit_moves")
      .select("unit_id, to_cell_id, created_at")
      .in("unit_id", chunk)
      .order("created_at", { ascending: false })
      .limit(15000);
    for (const m of moves ?? []) {
      if (m?.unit_id && m?.to_cell_id && !lastMove.has(m.unit_id)) {
        lastMove.set(m.unit_id, m.to_cell_id);
      }
    }
  }

  const needPicking = units
    .filter((u) => {
      if (u.status === "out" || u.status === "shipped") return false;
      return !lastMove.get(u.id) && !u.cell_id;
    })
    .map((u) => u.id);

  const pickingMap = await getActivePickingTargetCellIdByUnitId(warehouseId, needPicking);

  for (const u of units) {
    if (u.status === "out" || u.status === "shipped") {
      result.set(u.id, null);
      continue;
    }
    const resolved = lastMove.get(u.id) || u.cell_id || pickingMap.get(u.id) || null;
    result.set(u.id, resolved);
  }

  return result;
}
