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

  // Check role: worker + ops + admin/head/manager can view
  if (!["worker", "ops", "admin", "head", "manager"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get open and in_progress tasks with joined data
  // Use supabaseAdmin to bypass RLS (avoid recursive policies)
  const { data: tasks, error: tasksError } = await supabaseAdmin
    .from("picking_tasks")
    .select(`
      id,
      status,
      scenario,
      created_at,
      picked_at,
      picked_by,
      completed_at,
      target_picking_cell_id,
      units!inner (
        id,
        barcode,
        cell_id,
        status
      )
    `)
    .eq("warehouse_id", profile.warehouse_id)
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: true });

  if (tasksError) {
    console.error("Error loading picking_tasks:", tasksError);
    return NextResponse.json({ error: tasksError.message }, { status: 400 });
  }

  // Filter: show only tasks that are "open" OR "in_progress" by current user
  // Hide "in_progress" tasks by other users
  const filteredTasks = (tasks || []).filter((t: any) => {
    if (t.status === "open") return true;
    if (t.status === "in_progress" && t.picked_by === userData.user.id) return true;
    return false;
  });

  // Sort: in_progress for current user first, then by created_at
  const sortedTasks = filteredTasks.sort((a: any, b: any) => {
    // Priority 1: in_progress for current user
    const aIsMyInProgress = a.status === "in_progress" && a.picked_by === userData.user.id;
    const bIsMyInProgress = b.status === "in_progress" && b.picked_by === userData.user.id;
    if (aIsMyInProgress && !bIsMyInProgress) return -1;
    if (!aIsMyInProgress && bIsMyInProgress) return 1;
    
    // Priority 2: by created_at
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  // Get all cell IDs we need (from units + target cells)
  const unitCellIds = sortedTasks
    .map((t: any) => t.units?.cell_id)
    .filter((id: any) => id) as string[];
  
  const targetCellIds = sortedTasks
    .map((t: any) => t.target_picking_cell_id)
    .filter((id: any) => id) as string[];
  
  const allCellIds = [...new Set([...unitCellIds, ...targetCellIds])];

  // Fetch all cells via warehouse_cells_map (use admin to avoid RLS recursion)
  let cellsMap = new Map();
  if (allCellIds.length > 0) {
    const { data: cells } = await supabaseAdmin
      .from("warehouse_cells_map")
      .select("id, code, cell_type")
      .in("id", allCellIds);

    cells?.forEach((cell) => {
      cellsMap.set(cell.id, cell);
    });
  }

  // Separate maps for convenience
  let fromCellsMap = new Map();
  let targetCellsMap = new Map();
  
  unitCellIds.forEach((id) => {
    const cell = cellsMap.get(id);
    if (cell) fromCellsMap.set(id, cell);
  });
  
  targetCellIds.forEach((id) => {
    const cell = cellsMap.get(id);
    if (cell) targetCellsMap.set(id, cell);
  });

  // Format response
  const formattedTasks = sortedTasks.map((task: any) => {
    const unit = task.units;
    const fromCell = unit?.cell_id ? fromCellsMap.get(unit.cell_id) : null;
    const targetCell = task.target_picking_cell_id ? targetCellsMap.get(task.target_picking_cell_id) : null;

    return {
      id: task.id,
      status: task.status,
      scenario: task.scenario,
      created_at: task.created_at,
      picked_at: task.picked_at,
      completed_at: task.completed_at,
      unit: {
        id: unit?.id,
        barcode: unit?.barcode,
        cell_id: unit?.cell_id,
        status: unit?.status,
      },
      fromCell: fromCell
        ? {
            code: fromCell.code,
            cell_type: fromCell.cell_type,
          }
        : null,
      targetCell: targetCell
        ? {
            id: targetCell.id,
            code: targetCell.code,
            cell_type: targetCell.cell_type,
          }
        : null,
    };
  });

  return NextResponse.json({
    ok: true,
    tasks: formattedTasks,
  });
}
