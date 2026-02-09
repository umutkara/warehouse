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

  // По факту: перезапрашиваем текущий cell_id у units, чтобы отображать актуальную ячейку (не из join)
  const allUnitIds = [...new Set(Array.from(unitsMap.values()).flat().map((u: any) => u.id).filter(Boolean))];
  let freshCellByUnitId = new Map<string, string | null>();
  if (allUnitIds.length > 0) {
    for (let i = 0; i < allUnitIds.length; i += 200) {
      const chunk = allUnitIds.slice(i, i + 200);
      const { data: freshUnits } = await supabaseAdmin
        .from("units")
        .select("id, cell_id")
        .in("id", chunk)
        .eq("warehouse_id", profile.warehouse_id);
      freshUnits?.forEach((row: any) => {
        freshCellByUnitId.set(row.id, row.cell_id ?? null);
      });
    }
    unitsMap.forEach((units, taskId) => {
      units.forEach((u: any) => {
        const freshCellId = u.id ? freshCellByUnitId.get(u.id) : undefined;
        if (freshCellId !== undefined) {
          (u as any).cell_id = freshCellId;
        }
      });
    });
  }

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

  // Get all cell IDs we need (из unitsMap — уже с актуальным cell_id по факту)
  const unitCellIds: string[] = [];
  const fromCellIds: string[] = [];
  unitsMap.forEach((units) => {
    units.forEach((u: any) => {
      if (u.cell_id) unitCellIds.push(u.cell_id);
      if (u.from_cell_id) fromCellIds.push(u.from_cell_id);
    });
  });
  const targetCellIds = sortedTasks
    .map((t: any) => t.target_picking_cell_id)
    .filter((id: any) => id) as string[];
  
  const allCellIds = [...new Set([...unitCellIds, ...fromCellIds, ...targetCellIds])];

  // Fetch all cells via warehouse_cells_map (with warehouse_id = correct cell codes for this warehouse)
  let cellsMap = new Map<string, { id: string; code: string; cell_type: string }>();
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

  // Ячейки rejected/ff для склада — для отображения по статусу, когда cell_id ещё не обновлён (рассинхрон)
  let rejectedCellId: string | null = null;
  let ffCellId: string | null = null;
  const { data: statusCells } = await supabaseAdmin
    .from("warehouse_cells_map")
    .select("id, code, cell_type")
    .eq("warehouse_id", profile.warehouse_id)
    .in("cell_type", ["rejected", "ff"]);
  statusCells?.forEach((c: any) => {
    cellsMap.set(c.id, c);
    if (c.cell_type === "rejected") rejectedCellId = rejectedCellId ?? c.id;
    if (c.cell_type === "ff") ffCellId = ffCellId ?? c.id;
  });

  function getDisplayCellId(u: any): string | null {
    const rawId = u.cell_id || u.from_cell_id;
    const rawType = rawId ? cellsMap.get(rawId)?.cell_type : null;
    if (u.status === "rejected" && rawType !== "rejected" && rejectedCellId) return rejectedCellId;
    if (u.status === "ff" && rawType !== "ff" && ffCellId) return ffCellId;
    return rawId ?? null;
  }

  const fullyPickedIds = new Set(fullyPickedTasks.map((t: any) => t.id));
  const allUnitsMissingCellsIds = new Set(
    tasksAllUnitsMissingCells.map((t: any) => t.id)
  );
  const noUnitsTaskIds = new Set(tasksWithNoUnits.map((t: any) => t.id));

  // Не показывать задачи, у которых все юниты в ff — по факту (в т.ч. по status при рассинхроне)
  const NON_ACTIONABLE_CELL_TYPES = ["ff"];
  const tasksAllUnitsInRejectedOrFf = sortedTasks.filter((t: any) => {
    const units = unitsMap.get(t.id) || [];
    if (units.length === 0) return false;
    return units.every((u: any) => {
      const displayId = getDisplayCellId(u);
      const cellType = displayId ? cellsMap.get(displayId)?.cell_type : null;
      return cellType && NON_ACTIONABLE_CELL_TYPES.includes(cellType);
    });
  });
  const allUnitsRejectedOrFfIds = new Set(tasksAllUnitsInRejectedOrFf.map((t: any) => t.id));

  const tasksAfterFilter = sortedTasks.filter(
    (task: any) =>
      !fullyPickedIds.has(task.id) &&
      !allUnitsMissingCellsIds.has(task.id) &&
      !noUnitsTaskIds.has(task.id) &&
      !allUnitsRejectedOrFfIds.has(task.id)
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
  const formattedTasks = dedupedTasks.flatMap((task: any, idx: number) => {
    const units = unitsMap.get(task.id) || [];
    const activeUnits = units;
    const targetCell = task.target_picking_cell_id ? cellsMap.get(task.target_picking_cell_id) : null;

    // Unique cells for display: use display cell (по статусу при рассинхроне cell_id), then cell_id/from_cell_id
    const fromCells = [...new Set(activeUnits.map((u: any) => getDisplayCellId(u)).filter(Boolean))]
      .map((cellId) => cellId && cellsMap.get(cellId))
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
      units: activeUnits.map((u: any) => {
        const displayCellId = getDisplayCellId(u);
        return {
          id: u.id,
          barcode: u.barcode,
          cell_id: u.cell_id,
          status: u.status,
          from_cell_id: u.from_cell_id,
          cell: displayCellId ? cellsMap.get(displayCellId) : null,
          from_cell: displayCellId ? cellsMap.get(displayCellId) : (u.from_cell_id ? cellsMap.get(u.from_cell_id) : null),
        };
      }),
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
