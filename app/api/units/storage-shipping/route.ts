import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/units/storage-shipping
 * Returns all units that are currently in storage or shipping cells
 * EXCLUDING units that are already in picking_tasks with status 'open' or 'in_progress'
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

  // Check role: ops, admin, head, manager can view
  if (!["ops", "admin", "head", "manager"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get all units for the warehouse
  const { data: units, error: unitsError } = await supabase
    .from("units")
    .select("id, barcode, status, cell_id, created_at")
    .eq("warehouse_id", profile.warehouse_id)
    .not("cell_id", "is", null)
    .order("created_at", { ascending: false });

  if (unitsError) {
    console.error("Error loading units:", unitsError);
    return NextResponse.json({ error: unitsError.message }, { status: 400 });
  }

  if (!units || units.length === 0) {
    return NextResponse.json({ ok: true, units: [] });
  }

  // Get all cell IDs
  const cellIds = units.map((u) => u.cell_id).filter((id) => id) as string[];

  if (cellIds.length === 0) {
    return NextResponse.json({ ok: true, units: [] });
  }

  // Get cells info via warehouse_cells_map
  const { data: cells, error: cellsError } = await supabase
    .from("warehouse_cells_map")
    .select("id, code, cell_type")
    .in("id", cellIds);

  if (cellsError) {
    console.error("Error loading cells:", cellsError);
    return NextResponse.json({ error: cellsError.message }, { status: 400 });
  }

  // Create a map of cell_id -> cell
  const cellsMap = new Map();
  cells?.forEach((cell) => {
    cellsMap.set(cell.id, cell);
  });

  // Get all picking tasks that are open or in_progress
  const { data: pickingTasks, error: tasksError } = await supabase
    .from("picking_tasks")
    .select("unit_id, id")
    .eq("warehouse_id", profile.warehouse_id)
    .in("status", ["open", "in_progress"]);

  if (tasksError) {
    console.error("Error loading picking tasks:", tasksError);
    return NextResponse.json({ error: tasksError.message }, { status: 400 });
  }

  // Get units from picking_task_units (new multi-unit schema)
  const taskIds = (pickingTasks || []).map((t) => t.id).filter(Boolean);
  let unitsFromMultiUnitTasks: string[] = [];
  
  if (taskIds.length > 0) {
    const { data: taskUnits, error: taskUnitsError } = await supabase
      .from("picking_task_units")
      .select("unit_id")
      .in("picking_task_id", taskIds);

    if (!taskUnitsError && taskUnits) {
      unitsFromMultiUnitTasks = taskUnits.map((tu) => tu.unit_id).filter(Boolean);
    }
  }

  // Create a set of unit IDs that are already in tasks (both old and new schema)
  const unitIdsInTasks = new Set([
    ...(pickingTasks || []).map((task) => task.unit_id).filter(Boolean),
    ...unitsFromMultiUnitTasks,
  ]);

  // Filter units that are in storage or shipping cells AND not in picking tasks
  const unitsInStorageOrShipping = units
    .map((unit) => {
      const cell = unit.cell_id ? cellsMap.get(unit.cell_id) : null;
      return {
        id: unit.id,
        barcode: unit.barcode,
        status: unit.status,
        cell_id: unit.cell_id,
        created_at: unit.created_at,
        cell: cell
          ? {
              id: cell.id,
              code: cell.code,
              cell_type: cell.cell_type,
            }
          : null,
      };
    })
    .filter((unit) => {
      // Must be in storage or shipping cell
      const isInStorageOrShipping = unit.cell && (unit.cell.cell_type === "storage" || unit.cell.cell_type === "shipping");
      // Must NOT be in picking tasks
      const isNotInTasks = !unitIdsInTasks.has(unit.id);
      return isInStorageOrShipping && isNotInTasks;
    });

  return NextResponse.json({
    ok: true,
    units: unitsInStorageOrShipping,
  });
}
