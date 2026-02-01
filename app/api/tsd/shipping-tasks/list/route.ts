import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/tsd/shipping-tasks/list
 * Returns open and in_progress picking tasks with joined unit and cell info
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

  // Check role: worker, ops, logistics, admin, head, manager can view
  if (!["worker", "ops", "logistics", "admin", "head", "manager"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get open and in_progress tasks: newest first. Supabase defaults to max 1000 rows per request, so fetch in chunks to get up to 5000.
  const pageSize = 1000;
  const maxPages = 5;
  let tasks: any[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data: pageData, error: pageError } = await supabaseAdmin
      .from("picking_tasks")
      .select(`
        id,
        status,
        scenario,
        created_at,
        created_by_name,
        picked_at,
        picked_by,
        completed_at,
        target_picking_cell_id
      `)
      .eq("warehouse_id", profile.warehouse_id)
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false })
      .range(from, to);

    if (pageError) {
      console.error("Error loading picking_tasks:", pageError);
      return NextResponse.json({ error: pageError.message }, { status: 400 });
    }
    if (!pageData?.length) break;
    tasks.push(...pageData);
    if (pageData.length < pageSize) break;
  }

  if (tasks.length === 0) {
    return NextResponse.json({
      ok: true,
      tasks: [],
    });
  }

  // Filter: show all "open" tasks AND all "in_progress" tasks (visible to everyone)
  // This allows multiple users to see tasks even if they're in progress by others
  // For "Отгрузка (НОВАЯ)" mode, all tasks should be visible to coordinate work
  const filteredTasks = tasks.filter((t: any) => {
    if (t.status === "open") return true;
    if (t.status === "in_progress") return true; // Show all in_progress tasks to everyone
    return false;
  });

  // Sort: in_progress for current user first, then open tasks, then in_progress by others
  const sortedTasks = filteredTasks.sort((a: any, b: any) => {
    // Priority 1: in_progress for current user
    const aIsMyInProgress = a.status === "in_progress" && a.picked_by === userData.user.id;
    const bIsMyInProgress = b.status === "in_progress" && b.picked_by === userData.user.id;
    if (aIsMyInProgress && !bIsMyInProgress) return -1;
    if (!aIsMyInProgress && bIsMyInProgress) return 1;
    
    // Priority 2: open tasks before in_progress by others
    if (a.status === "open" && b.status === "in_progress" && b.picked_by !== userData.user.id) return -1;
    if (a.status === "in_progress" && a.picked_by !== userData.user.id && b.status === "open") return 1;
    
    // Priority 3: by created_at
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  // Get units for each task from picking_task_units
  const taskIds = sortedTasks.map((t: any) => t.id);
  
  const taskUnits: any[] = [];
  const chunkSize = 100;
  for (let i = 0; i < taskIds.length; i += chunkSize) {
    const chunk = taskIds.slice(i, i + chunkSize);
    const { data: chunkUnits, error: chunkError } = await supabaseAdmin
      .from("picking_task_units")
      .select(`
        picking_task_id,
        unit_id,
        from_cell_id,
        units (
          id,
          barcode,
          cell_id,
          status
        )
      `)
      .in("picking_task_id", chunk);

    if (chunkError) {
      console.error("Error loading picking_task_units:", chunkError);
      return NextResponse.json({ error: chunkError.message }, { status: 400 });
    }

    if (chunkUnits && chunkUnits.length > 0) {
      taskUnits.push(...chunkUnits);
    }
  }

  // Group units by task
  const unitsMap = new Map<string, any[]>();
  const unitIdCounts = new Map<string, number>();
  (taskUnits || []).forEach((tu: any) => {
    if (!unitsMap.has(tu.picking_task_id)) {
      unitsMap.set(tu.picking_task_id, []);
    }
    const unitData = tu.units ?? tu.unit;
    unitsMap.get(tu.picking_task_id)!.push({
      ...unitData,
      from_cell_id: tu.from_cell_id,
    });
    if (unitData?.id) {
      unitIdCounts.set(unitData.id, (unitIdCounts.get(unitData.id) || 0) + 1);
    }
  });

  const tasksWithNoUnits = sortedTasks.filter((t: any) => (unitsMap.get(t.id) || []).length === 0);
  // Hide tasks where every unit has no cell_id or no id from join (match prod: only show tasks with valid unit data)
  const tasksAllUnitsMissingCells = sortedTasks.filter((t: any) => {
    const units = unitsMap.get(t.id) || [];
    if (units.length === 0) return false;
    return units.every((u: any) => !u.cell_id || !u.id);
  });

  const fullyPickedTasks = sortedTasks.filter((t: any) => {
    const units = unitsMap.get(t.id) || [];
    if (units.length === 0) return false;
    const targetId = t.target_picking_cell_id;
    return units.every((u: any) => u.status === "picking" || (targetId && u.cell_id === targetId));
  });

  // Get all cell IDs we need
  const unitCellIds: string[] = [];
  const fromCellIds: string[] = [];
  (taskUnits || []).forEach((tu: any) => {
    const ud = tu.units ?? tu.unit;
    if (ud?.cell_id) unitCellIds.push(ud.cell_id);
    if (tu.from_cell_id) fromCellIds.push(tu.from_cell_id);
  });
  
  const targetCellIds = sortedTasks
    .map((t: any) => t.target_picking_cell_id)
    .filter((id: any) => id) as string[];
  
  const allCellIds = [...new Set([...unitCellIds, ...fromCellIds, ...targetCellIds])];

  // Fetch all cells via warehouse_cells_map (with warehouse_id = correct cell codes for this warehouse)
  let cellsMap = new Map();
  if (allCellIds.length > 0) {
    const { data: cells } = await supabaseAdmin
      .from("warehouse_cells_map")
      .select("id, code, cell_type")
      .eq("warehouse_id", profile.warehouse_id)
      .in("id", allCellIds);

    cells?.forEach((cell) => {
      cellsMap.set(cell.id, cell);
    });
  }

  const fullyPickedIds = new Set(fullyPickedTasks.map((t: any) => t.id));
  const allUnitsMissingCellsIds = new Set(
    tasksAllUnitsMissingCells.map((t: any) => t.id)
  );

  const tasksAfterFilter = sortedTasks.filter(
    (task: any) => !fullyPickedIds.has(task.id) && !allUnitsMissingCellsIds.has(task.id)
  );
  // Deduplicate by unit: keep only one task per unit (the newest by created_at) so duplicates from repeated imports don't inflate the list
  const byCreatedDesc = [...tasksAfterFilter].sort(
    (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const seenUnitIds = new Set<string>();
  const dedupedTasks: any[] = [];
  for (const task of byCreatedDesc) {
    const units = unitsMap.get(task.id) || [];
    const unitIds = units.map((u: any) => u.id).filter(Boolean);
    if (unitIds.length === 0) {
      dedupedTasks.push(task);
      continue;
    }
    const alreadySeen = unitIds.some((id: string) => seenUnitIds.has(id));
    if (alreadySeen) continue;
    dedupedTasks.push(task);
    unitIds.forEach((id: string) => seenUnitIds.add(id));
  }

  // Format response
  const formattedTasks = dedupedTasks.flatMap((task: any) => {
    const units = unitsMap.get(task.id) || [];
    const activeUnits = units;
    const targetCell = task.target_picking_cell_id ? cellsMap.get(task.target_picking_cell_id) : null;

    // Unique cells for display: use current location (cell_id) first — "по факту" where the unit is now (same fix as TSD).
    const fromCells = [...new Set(activeUnits.map((u: any) => u.cell_id || u.from_cell_id).filter(Boolean))]
      .map((cellId) => cellsMap.get(cellId))
      .filter(Boolean);

    const formatted = {
      id: task.id,
      status: task.status,
      scenario: task.scenario,
      created_at: task.created_at,
      created_by_name: task.created_by_name,
      picked_at: task.picked_at,
      completed_at: task.completed_at,
      unitCount: activeUnits.length,
      units: activeUnits.map((u: any) => ({
        id: u.id,
        barcode: u.barcode,
        cell_id: u.cell_id,
        status: u.status,
        from_cell_id: u.from_cell_id,
        cell: u.cell_id ? cellsMap.get(u.cell_id) : null,
        from_cell: u.from_cell_id ? cellsMap.get(u.from_cell_id) : null,
      })),
      fromCells: fromCells.map((cell: any) => ({
        code: cell.code,
        cell_type: cell.cell_type,
      })),
      targetCell: targetCell
        ? {
            id: targetCell.id,
            code: targetCell.code,
            cell_type: targetCell.cell_type,
          }
        : null,
    };
    return formatted;
  });

  return NextResponse.json({ ok: true, tasks: formattedTasks });
}
