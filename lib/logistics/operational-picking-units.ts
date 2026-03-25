import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Юниты «в picking» по операционной модели (как /api/logistics/picking-units и оверлей карты):
 * последняя активная picking_task (open/in_progress) с target в активной picking-ячейке,
 * без outbound_shipments.status = 'out'.
 */
export type OperationalPickingUnit = {
  id: string;
  barcode: string;
  status: string;
  cell_id: string | null;
  created_at: string;
  scenario: string | null;
  cell: { id: string; code: string; cell_type: string; meta?: unknown } | null;
};

export async function getOperationalPickingUnitsForWarehouse(
  warehouseId: string,
): Promise<{ ok: true; units: OperationalPickingUnit[] } | { ok: false; error: string }> {
  const { data: pickingCells, error: cellsError } = await supabaseAdmin
    .from("warehouse_cells")
    .select("id, code, cell_type, meta")
    .eq("warehouse_id", warehouseId)
    .eq("cell_type", "picking")
    .eq("is_active", true);

  if (cellsError) {
    return { ok: false, error: cellsError.message };
  }

  const pickingCellIds = pickingCells?.map((c) => c.id) || [];
  if (pickingCellIds.length === 0) {
    return { ok: true, units: [] };
  }

  const pickingCellIdSet = new Set(pickingCellIds);

  const { data: activeTasksRaw, error: activeTasksError } = await supabaseAdmin
    .from("picking_tasks")
    .select("id, scenario, status, created_at, target_picking_cell_id")
    .eq("warehouse_id", warehouseId)
    .in("status", ["open", "in_progress"])
    .not("target_picking_cell_id", "is", null)
    .order("created_at", { ascending: false });

  if (activeTasksError) {
    return { ok: false, error: activeTasksError.message };
  }

  const activeTasks = (activeTasksRaw || []).filter(
    (t: { target_picking_cell_id?: string | null }) =>
      t?.target_picking_cell_id && pickingCellIdSet.has(t.target_picking_cell_id),
  );

  const activeTaskIds = [...new Set(activeTasks.map((t: { id: string }) => t.id))];
  const activeTaskMap = new Map(activeTasks.map((t: any) => [t.id, t]));
  let activeTaskUnits: { unit_id: string; picking_task_id: string }[] = [];
  if (activeTaskIds.length > 0) {
    const chunkSize = 200;
    for (let i = 0; i < activeTaskIds.length; i += chunkSize) {
      const chunk = activeTaskIds.slice(i, i + chunkSize);
      const { data: chunkRows, error: chunkErr } = await supabaseAdmin
        .from("picking_task_units")
        .select("unit_id, picking_task_id")
        .in("picking_task_id", chunk);
      if (chunkErr) {
        return { ok: false, error: chunkErr.message };
      }
      if (chunkRows?.length) activeTaskUnits.push(...(chunkRows as any[]));
    }
  }

  const latestActiveTaskByUnitId = new Map<string, any>();
  activeTaskUnits.forEach((tu: any) => {
    if (!tu.unit_id || !tu.picking_task_id) return;
    const candidateTask = activeTaskMap.get(tu.picking_task_id);
    if (!candidateTask) return;
    const current = latestActiveTaskByUnitId.get(tu.unit_id);
    if (!current) {
      latestActiveTaskByUnitId.set(tu.unit_id, candidateTask);
      return;
    }
    const currentTs = new Date(current.created_at || 0).getTime();
    const candidateTs = new Date(candidateTask.created_at || 0).getTime();
    if (candidateTs >= currentTs) latestActiveTaskByUnitId.set(tu.unit_id, candidateTask);
  });

  const activeUnitIds = [...latestActiveTaskByUnitId.keys()];
  let activeUnits: any[] = [];
  if (activeUnitIds.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < activeUnitIds.length; i += chunkSize) {
      const chunk = activeUnitIds.slice(i, i + chunkSize);
      const { data: chunkUnits, error: chunkErr } = await supabaseAdmin
        .from("units")
        .select("id, barcode, status, cell_id, created_at")
        .eq("warehouse_id", warehouseId)
        .in("id", chunk);
      if (chunkErr) {
        return { ok: false, error: chunkErr.message };
      }
      if (chunkUnits?.length) activeUnits.push(...chunkUnits);
    }
  }

  const shippedActiveSet = new Set<string>();
  if (activeUnitIds.length > 0) {
    const shipChunk = 300;
    for (let i = 0; i < activeUnitIds.length; i += shipChunk) {
      const chunk = activeUnitIds.slice(i, i + shipChunk);
      const { data: shippedActive, error: shipErr } = await supabaseAdmin
        .from("outbound_shipments")
        .select("unit_id")
        .in("unit_id", chunk)
        .eq("status", "out");
      if (shipErr) {
        return { ok: false, error: shipErr.message };
      }
      for (const row of shippedActive || []) {
        if ((row as { unit_id?: string }).unit_id) shippedActiveSet.add((row as { unit_id: string }).unit_id);
      }
    }
  }

  const workingUnits = activeUnits.filter((u: { id: string }) => !shippedActiveSet.has(u.id));

  if (workingUnits.length === 0) {
    return { ok: true, units: [] };
  }

  const cellsMap = new Map((pickingCells || []).map((c: any) => [c.id, c]));

  const workingUnitIds = workingUnits.map((u: { id: string }) => u.id);
  let taskUnits: any[] = [];
  const linkChunk = 200;
  for (let i = 0; i < workingUnitIds.length; i += linkChunk) {
    const chunk = workingUnitIds.slice(i, i + linkChunk);
    const { data: chunkRows, error: taskUnitsError } = await supabaseAdmin
      .from("picking_task_units")
      .select("unit_id, picking_task_id")
      .in("unit_id", chunk);
    if (taskUnitsError) {
      return { ok: false, error: taskUnitsError.message };
    }
    if (chunkRows?.length) taskUnits.push(...chunkRows);
  }

  let legacyTasks: any[] = [];
  for (let i = 0; i < workingUnitIds.length; i += linkChunk) {
    const chunk = workingUnitIds.slice(i, i + linkChunk);
    const { data: chunkLegacy, error: legacyTasksError } = await supabaseAdmin
      .from("picking_tasks")
      .select("id, unit_id, scenario, status, created_at")
      .in("unit_id", chunk)
      .eq("warehouse_id", warehouseId);
    if (legacyTasksError) {
      return { ok: false, error: legacyTasksError.message };
    }
    if (chunkLegacy?.length) legacyTasks.push(...chunkLegacy);
  }

  const taskIds = [...new Set(taskUnits.map((tu: any) => tu.picking_task_id).filter(Boolean))];
  let tasks: any[] = [];
  if (taskIds.length > 0) {
    const idChunk = 200;
    for (let i = 0; i < taskIds.length; i += idChunk) {
      const chunk = taskIds.slice(i, i + idChunk);
      const { data: chunkTasks, error: tasksError } = await supabaseAdmin
        .from("picking_tasks")
        .select("id, scenario, status, created_at")
        .in("id", chunk)
        .eq("warehouse_id", warehouseId);
      if (tasksError) {
        return { ok: false, error: tasksError.message };
      }
      if (chunkTasks?.length) tasks.push(...chunkTasks);
    }
  }

  const taskIdsWithoutScenario =
    tasks.length > 0
      ? tasks.filter((t: any) => !t.scenario?.trim()).map((t: any) => t.id)
      : taskIds;
  const auditScenarioByTaskId = new Map<string, string>();
  if (taskIdsWithoutScenario.length > 0) {
    const chunkSize = 100;
    let auditRows: any[] = [];
    for (let i = 0; i < taskIdsWithoutScenario.length; i += chunkSize) {
      const chunk = taskIdsWithoutScenario.slice(i, i + chunkSize);
      const auditByEntity = await supabaseAdmin
        .from("audit_events")
        .select("entity_id, meta")
        .eq("entity_type", "picking_task")
        .eq("action", "picking_task_create")
        .in("entity_id", chunk)
        .eq("warehouse_id", warehouseId)
        .order("created_at", { ascending: false });
      if (auditByEntity.data?.length) auditRows.push(...auditByEntity.data);
    }
    try {
      for (let i = 0; i < taskIdsWithoutScenario.length; i += chunkSize) {
        const chunk = taskIdsWithoutScenario.slice(i, i + chunkSize);
        const auditByRecord = await supabaseAdmin
          .from("audit_events")
          .select("record_id, meta")
          .eq("action", "picking_task_create")
          .in("record_id", chunk)
          .eq("warehouse_id", warehouseId)
          .order("created_at", { ascending: false })
          .limit(500);
        if (auditByRecord.data?.length) auditRows.push(...auditByRecord.data);
      }
    } catch (_) {
      // record_id column may not exist
    }
    auditRows.forEach((row: any) => {
      const tid = row.entity_id ?? row.record_id;
      const meta = row.meta ?? {};
      const scenarioFromMeta =
        typeof meta === "string"
          ? (() => {
              try {
                const p = JSON.parse(meta);
                return p?.scenario;
              } catch {
                return null;
              }
            })()
          : meta?.scenario;
      if (
        tid &&
        scenarioFromMeta &&
        typeof scenarioFromMeta === "string" &&
        scenarioFromMeta.trim() &&
        !auditScenarioByTaskId.has(tid)
      ) {
        auditScenarioByTaskId.set(tid, scenarioFromMeta.trim());
      }
    });
  }

  const tasksMap = new Map(tasks.map((t: any) => [t.id, t]));
  const latestTaskByUnitId = new Map<string, any>();
  taskUnits.forEach((tu: any) => {
    if (!tu.unit_id || !tu.picking_task_id) return;
    const candidateTask = tasksMap.get(tu.picking_task_id);
    if (!candidateTask) return;
    const current = latestTaskByUnitId.get(tu.unit_id);
    if (!current) {
      latestTaskByUnitId.set(tu.unit_id, candidateTask);
      return;
    }
    const currentTs = new Date(current.created_at || 0).getTime();
    const candidateTs = new Date(candidateTask.created_at || 0).getTime();
    if (candidateTs >= currentTs) latestTaskByUnitId.set(tu.unit_id, candidateTask);
  });
  const latestLegacyTaskByUnitId = new Map<string, any>();
  legacyTasks.forEach((task: any) => {
    if (!task?.unit_id) return;
    const current = latestLegacyTaskByUnitId.get(task.unit_id);
    if (!current) {
      latestLegacyTaskByUnitId.set(task.unit_id, task);
      return;
    }
    const currentTs = new Date(current.created_at || 0).getTime();
    const candidateTs = new Date(task.created_at || 0).getTime();
    if (candidateTs >= currentTs) latestLegacyTaskByUnitId.set(task.unit_id, task);
  });

  const enrichedUnits: OperationalPickingUnit[] = workingUnits.map((u: any) => {
    const latestTask = latestTaskByUnitId.get(u.id) || null;
    const latestLegacyTask = latestLegacyTaskByUnitId.get(u.id) || null;
    const effectiveTaskId = latestTask?.id || latestLegacyTask?.id || null;
    const scenarioFromTask =
      latestTask?.scenario?.trim() || latestLegacyTask?.scenario?.trim() || null;
    const scenario =
      scenarioFromTask || (effectiveTaskId ? auditScenarioByTaskId.get(effectiveTaskId) || null : null);
    const displayCellId =
      latestActiveTaskByUnitId.get(u.id)?.target_picking_cell_id || u.cell_id || null;
    const cellRaw = displayCellId ? cellsMap.get(displayCellId) : null;
    return {
      id: u.id,
      barcode: u.barcode ?? "",
      status: u.status ?? "",
      cell_id: displayCellId,
      created_at: u.created_at,
      scenario,
      cell: cellRaw
        ? {
            id: cellRaw.id,
            code: cellRaw.code,
            cell_type: cellRaw.cell_type,
            meta: cellRaw.meta ?? null,
          }
        : null,
    };
  });

  return { ok: true, units: enrichedUnits };
}
