import type { SupabaseClient } from "@supabase/supabase-js";

const POSTPONED_OPS_STATUSES = ["postponed_1", "postponed_2"] as const;

export type TryCreatePostponedTaskResult =
  | { created: true; taskId: string }
  | { created: false; reason?: string };

/**
 * Авто-задача «Перенос 1/2»: вызывается только при смене OPS на «Перенос 1» или «Перенос 2» (ops-status).
 * Если unit в ячейке shipping/storage и есть прошлая задача с target_picking_cell_id —
 * создаёт новую задачу ТСД с тем же сценарием и picking-ячейкой.
 * Не бросает исключения — при любой ошибке возвращает { created: false }.
 */
export async function tryCreatePostponedTask(
  unitId: string,
  warehouseId: string,
  createdByUserId: string,
  createdByName: string,
  supabaseAdmin: SupabaseClient
): Promise<TryCreatePostponedTaskResult> {
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "postponed-auto-task.ts:entry", message: "tryCreatePostponedTask called", data: { unitId }, timestamp: Date.now(), sessionId: "debug-session", hypothesisId: "H1" }) }).catch(() => {});
  // #endregion
  try {
    const { data: unit, error: unitErr } = await supabaseAdmin
      .from("units")
      .select("id, barcode, cell_id, meta, warehouse_id")
      .eq("id", unitId)
      .eq("warehouse_id", warehouseId)
      .single();

    if (unitErr || !unit) {
      return { created: false, reason: "unit not found" };
    }
    const opsStatus = (unit.meta as any)?.ops_status;
    if (!POSTPONED_OPS_STATUSES.includes(opsStatus)) {
      return { created: false, reason: "not postponed_1/2" };
    }
    if (!unit.cell_id) {
      return { created: false, reason: "unit not in cell" };
    }

    const { data: cellRow, error: cellErr } = await supabaseAdmin
      .from("warehouse_cells_map")
      .select("id, cell_type")
      .eq("id", unit.cell_id)
      .eq("warehouse_id", warehouseId)
      .maybeSingle();

    if (cellErr || !cellRow) {
      return { created: false, reason: "cell not found" };
    }
    if (cellRow.cell_type !== "storage" && cellRow.cell_type !== "shipping") {
      return { created: false, reason: "cell not storage/shipping" };
    }

    const { data: ptuRows, error: ptuErr } = await supabaseAdmin
      .from("picking_task_units")
      .select("picking_task_id")
      .eq("unit_id", unitId);

    if (ptuErr || !ptuRows?.length) {
      return { created: false, reason: "no previous task" };
    }

    const taskIds = ptuRows.map((r: any) => r.picking_task_id).filter(Boolean);
    const { data: lastTasks, error: tasksErr } = await supabaseAdmin
      .from("picking_tasks")
      .select("id, scenario, target_picking_cell_id")
      .in("id", taskIds)
      .order("created_at", { ascending: false })
      .limit(1);

    if (tasksErr || !lastTasks?.[0]) {
      return { created: false, reason: "no previous task" };
    }

    const lastTask = lastTasks[0];
    const scenario = lastTask.scenario ?? null;
    const targetPickingCellId = lastTask.target_picking_cell_id ?? null;

    if (!targetPickingCellId) {
      return { created: false, reason: "no target cell in last task" };
    }

    const { data: targetCell, error: targetCellErr } = await supabaseAdmin
      .from("warehouse_cells_map")
      .select("id, cell_type, is_active")
      .eq("id", targetPickingCellId)
      .eq("warehouse_id", warehouseId)
      .maybeSingle();

    if (targetCellErr || !targetCell || targetCell.cell_type !== "picking" || !targetCell.is_active) {
      return { created: false, reason: "target picking cell invalid" };
    }

    const { data: openTasks } = await supabaseAdmin
      .from("picking_tasks")
      .select("id")
      .eq("warehouse_id", warehouseId)
      .in("status", ["open", "in_progress"]);

    const openTaskIds = (openTasks ?? []).map((t: any) => t.id).filter(Boolean);
    if (openTaskIds.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < openTaskIds.length; i += chunkSize) {
        const chunk = openTaskIds.slice(i, i + chunkSize);
        const { data: taskUnits } = await supabaseAdmin
          .from("picking_task_units")
          .select("unit_id")
          .in("picking_task_id", chunk);
        const inTask = (taskUnits ?? []).some((tu: any) => tu.unit_id === unitId);
        if (inTask) {
          return { created: false, reason: "unit already in open task" };
        }
      }
    }

    const { data: insertedTasks, error: insertErr } = await supabaseAdmin
      .from("picking_tasks")
      .insert({
        warehouse_id: warehouseId,
        unit_id: null,
        from_cell_id: null,
        target_picking_cell_id: targetPickingCellId,
        scenario,
        status: "open",
        created_by: createdByUserId,
        created_by_name: createdByName,
      })
      .select("id");

    if (insertErr || !insertedTasks?.[0]?.id) {
      console.error("[postponed-auto-task] insert task error:", insertErr);
      return { created: false, reason: "insert failed" };
    }

    const taskId = insertedTasks[0].id;
    const { error: unitsInsertErr } = await supabaseAdmin.from("picking_task_units").insert({
      picking_task_id: taskId,
      unit_id: unitId,
      from_cell_id: unit.cell_id,
    });

    if (unitsInsertErr) {
      console.error("[postponed-auto-task] insert task_units error:", unitsInsertErr);
      await supabaseAdmin.from("picking_tasks").delete().eq("id", taskId);
      return { created: false, reason: "insert task_units failed" };
    }

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "postponed-auto-task.ts:created", message: "postponed task created", data: { unitId, taskId, unitCellId: unit.cell_id, createdByName }, timestamp: Date.now(), sessionId: "debug-session", hypothesisId: "H1" }) }).catch(() => {});
    // #endregion
    return { created: true, taskId };
  } catch (e: any) {
    console.error("[postponed-auto-task] unexpected error:", e);
    return { created: false, reason: e?.message ?? "unexpected" };
  }
}
