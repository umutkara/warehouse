import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/logistics/picking-units
 * Returns all units currently in picking cells for logistics role
 */
export async function GET(req: Request) {
  const supabase = await supabaseServer();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profError } = await supabase
    .from("profiles")
    .select("warehouse_id, role")
    .eq("id", userData.user.id)
    .single();

  if (profError || !profile?.warehouse_id) {
    return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
  }

  // Only logistics, admin, head can access
  if (!["logistics", "admin", "head", "hub_worker"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // First, get all picking cells for this warehouse (with meta for descriptions)
  const { data: pickingCells, error: cellsError } = await supabaseAdmin
    .from("warehouse_cells")
    .select("id, code, cell_type, meta")
    .eq("warehouse_id", profile.warehouse_id)
    .eq("cell_type", "picking")
    .eq("is_active", true);

  if (cellsError) {
    return NextResponse.json({ error: cellsError.message }, { status: 400 });
  }

  const pickingCellIds = pickingCells?.map(c => c.id) || [];
  
  if (pickingCellIds.length === 0) {
    return NextResponse.json({
      ok: true,
      units: [],
    });
  }

  // Get all units in picking cells (use admin to bypass RLS)
  const { data: units, error: unitsError } = await supabaseAdmin
    .from("units")
    .select(`
      id,
      barcode,
      status,
      cell_id,
      created_at
    `)
    .eq("warehouse_id", profile.warehouse_id)
    .in("cell_id", pickingCellIds)
    .order("created_at", { ascending: false });

  if (unitsError) {
    return NextResponse.json({ error: unitsError.message }, { status: 400 });
  }

  const unitIds = units?.map(u => u.id) || [];
  const { data: shipped, error: shippedError } = await supabaseAdmin
    .from("outbound_shipments")
    .select("unit_id, status")
    .in("unit_id", unitIds)
    .eq("status", "out");

  const shippedSet = new Set((shipped || []).map(s => s.unit_id));
  const filteredUnits = (units || []).filter(u => !shippedSet.has(u.id));

  // Create cells map for quick lookup
  const cellsMap = new Map(pickingCells?.map(c => [c.id, c]) || []);

  // Get picking_tasks info to show scenario (read-only for logistics)
  // After migration, units are linked via picking_task_units junction table
  // First, get picking_task_units to find which tasks contain these units
  const { data: taskUnits, error: taskUnitsError } = await supabaseAdmin
    .from("picking_task_units")
    .select("unit_id, picking_task_id")
    .in("unit_id", filteredUnits.map(u => u.id));
  
  // Also check legacy unit_id field for old tasks (any status - unit is already in picking)
  const { data: legacyTasks, error: legacyTasksError } = await supabaseAdmin
    .from("picking_tasks")
    .select("id, unit_id, scenario, status, created_at")
    .in("unit_id", filteredUnits.map(u => u.id))
    .eq("warehouse_id", profile.warehouse_id);
  
  // Get task IDs from picking_task_units
  const taskIds = [...new Set(taskUnits?.map(tu => tu.picking_task_id) || [])];
  
  // Get tasks with scenario (any status - unit is already in picking, so task exists)
  const { data: tasks, error: tasksError } = await supabaseAdmin
    .from("picking_tasks")
    .select("id, scenario, status, created_at")
    .in("id", taskIds)
    .eq("warehouse_id", profile.warehouse_id);

  // Для задач с пустым scenario — взять сценарий из audit_events. При «осиротевших» задачах (task удалён из picking_tasks) — запрашиваем audit по всем taskIds.
  const taskIdsWithoutScenario =
    (tasks && tasks.length > 0)
      ? (tasks as any[]).filter((t: any) => !t.scenario?.trim()).map((t: any) => t.id)
      : taskIds;
  let auditScenarioByTaskId = new Map<string, string>();
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
        .eq("warehouse_id", profile.warehouse_id)
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
          .eq("warehouse_id", profile.warehouse_id)
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
      const scenarioFromMeta = typeof meta === "string" ? (() => { try { const p = JSON.parse(meta); return p?.scenario; } catch { return null; } })() : meta?.scenario;
      if (tid && scenarioFromMeta && typeof scenarioFromMeta === "string" && scenarioFromMeta.trim() && !auditScenarioByTaskId.has(tid)) {
        auditScenarioByTaskId.set(tid, scenarioFromMeta.trim());
      }
    });
  }

  // Create maps: task_id -> task and unit_id -> latest task
  const tasksMap = new Map(tasks?.map(t => [t.id, t]) || []);
  const latestTaskByUnitId = new Map<string, any>();
  (taskUnits || []).forEach((tu: any) => {
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
    if (candidateTs >= currentTs) {
      latestTaskByUnitId.set(tu.unit_id, candidateTask);
    }
  });
  const latestLegacyTaskByUnitId = new Map<string, any>();
  (legacyTasks || []).forEach((task: any) => {
    if (!task?.unit_id) return;
    const current = latestLegacyTaskByUnitId.get(task.unit_id);
    if (!current) {
      latestLegacyTaskByUnitId.set(task.unit_id, task);
      return;
    }
    const currentTs = new Date(current.created_at || 0).getTime();
    const candidateTs = new Date(task.created_at || 0).getTime();
    if (candidateTs >= currentTs) {
      latestLegacyTaskByUnitId.set(task.unit_id, task);
    }
  });

  // Enrich units with cell and scenario info
  const enrichedUnits = (filteredUnits || []).map((u, idx) => {
    // Choose scenario from latest linked task first; fallback to latest legacy task.
    const latestTask = latestTaskByUnitId.get(u.id) || null;
    const latestLegacyTask = latestLegacyTaskByUnitId.get(u.id) || null;
    const effectiveTaskId = latestTask?.id || latestLegacyTask?.id || null;
    const scenarioFromTask =
      latestTask?.scenario?.trim() ||
      latestLegacyTask?.scenario?.trim() ||
      null;
    const scenario = scenarioFromTask || (effectiveTaskId ? auditScenarioByTaskId.get(effectiveTaskId) || null : null);
    return {
      ...u,
      cell: cellsMap.get(u.cell_id) || null,
      scenario,
    };
  });

  return NextResponse.json({
    ok: true,
    units: enrichedUnits,
  });
}
