import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/units/storage-shipping
 * Returns all units that are currently in storage or shipping cells
 * EXCLUDING units that are already in picking_tasks with status 'open' or 'in_progress'
 */
export async function GET(req: Request) {
  const supabase = await supabaseServer();
  // Use supabaseAdmin to bypass RLS and avoid recursive policy checks

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

  // Check role: ops, logistics, admin, head, manager can view
  if (!["ops", "logistics", "admin", "head", "manager"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get all units for the warehouse (cell_id = where unit actually lies)
  const { data: units, error: unitsError } = await supabaseAdmin
    .from("units")
    .select("id, barcode, status, cell_id, created_at, meta")
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

  // Cell info from warehouse_cells_map WITH warehouse_id — same as by-barcode and cells/get:
  // view is per-warehouse, so we must filter by warehouse_id to get the correct cell code for this warehouse.
  const cellIds = [...new Set(units.map((u: any) => u.cell_id).filter(Boolean))] as string[];
  const cellsMap = new Map<string, { id: string; code: string; cell_type: string }>();
  if (cellIds.length > 0) {
    const { data: cells, error: cellsError } = await supabaseAdmin
      .from("warehouse_cells_map")
      .select("id, code, cell_type")
      .eq("warehouse_id", profile.warehouse_id)
      .in("id", cellIds);

    if (!cellsError && cells) {
      cells.forEach((c: any) => {
        if (c?.id) cellsMap.set(c.id, { id: c.id, code: c.code, cell_type: c.cell_type });
      });
    }
  }

  // Get all picking tasks that are open or in_progress. Supabase returns max 1000 per request — fetch in pages so we don't miss units from tasks beyond the first 1000.
  const pageSize = 1000;
  const maxPages = 5;
  let pickingTasks: { unit_id: string | null; id: string }[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data: pageTasks, error: pageError } = await supabaseAdmin
      .from("picking_tasks")
      .select("unit_id, id")
      .eq("warehouse_id", profile.warehouse_id)
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false })
      .range(from, to);

    if (pageError) {
      console.error("Error loading picking tasks:", pageError);
      return NextResponse.json({ error: pageError.message }, { status: 400 });
    }
    if (!pageTasks?.length) break;
    pickingTasks.push(...pageTasks);
    if (pageTasks.length < pageSize) break;
  }

  // Get units from picking_task_units (new multi-unit schema).
  // Chunk by 100: Supabase/Postgres limit on IN() size, so 835+ task IDs would return no rows.
  const taskIds = pickingTasks.map((t) => t.id).filter(Boolean);
  const unitsFromMultiUnitTasks: string[] = [];
  const chunkSize = 100;
  for (let i = 0; i < taskIds.length; i += chunkSize) {
    const chunk = taskIds.slice(i, i + chunkSize);
    const { data: taskUnits, error: taskUnitsError } = await supabaseAdmin
      .from("picking_task_units")
      .select("unit_id")
      .in("picking_task_id", chunk);

    if (!taskUnitsError && taskUnits?.length) {
      unitsFromMultiUnitTasks.push(...taskUnits.map((tu: { unit_id: string }) => tu.unit_id).filter(Boolean));
    }
  }

  // Create a set of unit IDs that are already in tasks (both old and new schema)
  const unitIdsInTasks = new Set([
    ...pickingTasks.map((task) => task.unit_id).filter(Boolean),
    ...unitsFromMultiUnitTasks,
  ]);

  // Filter units that are in storage or shipping cells AND not in picking tasks.
  // Cell from warehouse_cells_map (with warehouse_id) = actual cell for this warehouse.
  const unitsInStorageOrShipping = units
    .map((unit) => {
      const cell = unit.cell_id ? cellsMap.get(unit.cell_id) : null;
      return {
        id: unit.id,
        barcode: unit.barcode,
        status: unit.status,
        cell_id: unit.cell_id,
        created_at: unit.created_at,
        ops_status: unit.meta?.ops_status ?? null,
        cell: cell ? { id: cell.id, code: cell.code, cell_type: cell.cell_type } : null,
      };
    })
    .filter((unit) => {
      const isInStorageOrShipping = unit.cell && (unit.cell.cell_type === "storage" || unit.cell.cell_type === "shipping");
      const isNotInTasks = !unitIdsInTasks.has(unit.id);
      return isInStorageOrShipping && isNotInTasks;
    });

  return NextResponse.json({
    ok: true,
    units: unitsInStorageOrShipping,
  });
}
