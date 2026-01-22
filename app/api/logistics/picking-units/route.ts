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
  if (!["logistics", "admin", "head"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // First, get all picking cells for this warehouse
  const { data: pickingCells, error: cellsError } = await supabaseAdmin
    .from("warehouse_cells")
    .select("id, code, cell_type")
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

  // Create cells map for quick lookup
  const cellsMap = new Map(pickingCells?.map(c => [c.id, c]) || []);

  // Get picking_tasks info to show scenario (read-only for logistics)
  // After migration, units are linked via picking_task_units junction table
  const unitIds = units?.map(u => u.id) || [];
  
  // First, get picking_task_units to find which tasks contain these units
  const { data: taskUnits, error: taskUnitsError } = await supabaseAdmin
    .from("picking_task_units")
    .select("unit_id, picking_task_id")
    .in("unit_id", unitIds);
  
  // Also check legacy unit_id field for old tasks (any status - unit is already in picking)
  const { data: legacyTasks, error: legacyTasksError } = await supabaseAdmin
    .from("picking_tasks")
    .select("unit_id, scenario, status")
    .in("unit_id", unitIds)
    .eq("warehouse_id", profile.warehouse_id);
  
  // Get task IDs from picking_task_units
  const taskIds = [...new Set(taskUnits?.map(tu => tu.picking_task_id) || [])];
  
  // Get tasks with scenario (any status - unit is already in picking, so task exists)
  const { data: tasks, error: tasksError } = await supabaseAdmin
    .from("picking_tasks")
    .select("id, scenario, status")
    .in("id", taskIds)
    .eq("warehouse_id", profile.warehouse_id);
  
  // Create maps: unit_id -> scenario
  const tasksMap = new Map(tasks?.map(t => [t.id, t]) || []);
  const taskUnitsMap = new Map(taskUnits?.map(tu => [tu.unit_id, tu.picking_task_id]) || []);
  const legacyTasksMap = new Map(legacyTasks?.map(t => [t.unit_id, t]) || []);

  // Enrich units with cell and scenario info
  const enrichedUnits = (units || []).map(u => {
    // Try new format first (via picking_task_units)
    const taskId = taskUnitsMap.get(u.id);
    const task = taskId ? tasksMap.get(taskId) : null;
    const scenario = task?.scenario || legacyTasksMap.get(u.id)?.scenario || null;
    
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
