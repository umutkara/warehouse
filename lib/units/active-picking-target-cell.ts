import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Для юнитов без физического cell_id — целевая picking-ячейка из последней
 * активной задачи (open/in_progress, непустой target), в духе /api/units/find.
 */
export async function getActivePickingTargetCellIdByUnitId(
  warehouseId: string,
  unitIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (unitIds.length === 0) return result;

  const chunkSize = 200;
  for (let i = 0; i < unitIds.length; i += chunkSize) {
    const chunk = unitIds.slice(i, i + chunkSize);
    const { data: links, error: linkErr } = await supabaseAdmin
      .from("picking_task_units")
      .select("unit_id, picking_task_id")
      .in("unit_id", chunk);
    if (linkErr || !links?.length) continue;

    const taskIds = [...new Set(links.map((l: { picking_task_id?: string }) => l.picking_task_id).filter(Boolean))];
    const tasks: Array<{ id: string; created_at: string; target_picking_cell_id: string }> = [];
    for (let j = 0; j < taskIds.length; j += chunkSize) {
      const tc = taskIds.slice(j, j + chunkSize);
      const { data: trows } = await supabaseAdmin
        .from("picking_tasks")
        .select("id, created_at, target_picking_cell_id")
        .eq("warehouse_id", warehouseId)
        .in("id", tc)
        .in("status", ["open", "in_progress"])
        .not("target_picking_cell_id", "is", null);
      if (trows?.length) tasks.push(...(trows as any[]));
    }
    const taskById = new Map(tasks.map((t) => [t.id, t]));

    const bestByUnit = new Map<string, { ts: number; cellId: string }>();
    for (const link of links as { unit_id: string; picking_task_id: string }[]) {
      const t = taskById.get(link.picking_task_id);
      if (!t?.target_picking_cell_id) continue;
      const ts = new Date(t.created_at || 0).getTime();
      const cur = bestByUnit.get(link.unit_id);
      if (!cur || ts >= cur.ts) {
        bestByUnit.set(link.unit_id, { ts, cellId: t.target_picking_cell_id });
      }
    }
    for (const [uid, v] of bestByUnit) {
      result.set(uid, v.cellId);
    }
  }

  return result;
}
