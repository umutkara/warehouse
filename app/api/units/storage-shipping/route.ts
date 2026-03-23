import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasAnyRole } from "@/app/api/_shared/role-access";

/**
 * GET /api/units/storage-shipping
 * Returns all units that are currently in storage or shipping cells
 * EXCLUDING units that are already in picking_tasks with status 'open' or 'in_progress'
 */
export async function GET(req: Request) {
  try {
    return await getStorageShippingUnits(req);
  } catch (err: any) {
    console.error("GET /api/units/storage-shipping error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal server error", details: String(err) },
      { status: 500 }
    );
  }
}

async function getStorageShippingUnits(_req: Request) {
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
  if (!hasAnyRole(profile.role, ["ops", "logistics", "admin", "head", "manager"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Optimization: fetch cell IDs for storage/shipping/rejected first, then filter units in DB.
  // warehouse_cells_map is per-warehouse; filter by warehouse_id to get correct cells for this warehouse.
  // Paginate cells fetch — Supabase returns max 1000 per request.
  const cellsPageSize = 1000;
  const cellsMaxPages = 20;
  const storageShippingCells: { id: string; code: string; cell_type: string }[] = [];
  for (let page = 0; page < cellsMaxPages; page++) {
    const from = page * cellsPageSize;
    const to = from + cellsPageSize - 1;
    const { data: pageCells, error: cellsError } = await supabaseAdmin
      .from("warehouse_cells_map")
      .select("id, code, cell_type")
      .eq("warehouse_id", profile.warehouse_id)
      .in("cell_type", ["storage", "shipping", "rejected"])
      .order("id")
      .range(from, to);

    if (cellsError) {
      console.error("Error loading storage/shipping cells:", cellsError);
      return NextResponse.json({ error: cellsError.message }, { status: 400 });
    }
    if (!pageCells?.length) break;
    storageShippingCells.push(...pageCells);
    if (pageCells.length < cellsPageSize) break;
  }

  const allowedCellIds = storageShippingCells.map((c: any) => c.id).filter(Boolean);
  const cellsMap = new Map<string, { id: string; code: string; cell_type: string }>();
  storageShippingCells.forEach((c: any) => {
    if (c?.id) cellsMap.set(c.id, { id: c.id, code: c.code, cell_type: c.cell_type });
  });

  if (allowedCellIds.length === 0) {
    return NextResponse.json({ ok: true, units: [] });
  }

  // Fetch only units in storage/shipping/rejected cells (filtered in DB by cell_id).
  // Supabase returns max 1000 per request — paginate so we don't miss units beyond the first page.
  const unitsPageSize = 1000;
  const unitsMaxPages = 50;
  let units: { id: string; barcode: string; status: string; cell_id: string | null; created_at: string; meta: any }[] = [];
  const cellIdChunkSize = 200;
  for (let ci = 0; ci < allowedCellIds.length; ci += cellIdChunkSize) {
    const cellChunk = allowedCellIds.slice(ci, ci + cellIdChunkSize);
    for (let page = 0; page < unitsMaxPages; page++) {
      const from = page * unitsPageSize;
      const to = from + unitsPageSize - 1;
      const { data: pageUnits, error: unitsError } = await supabaseAdmin
        .from("units")
        .select("id, barcode, status, cell_id, created_at, meta")
        .eq("warehouse_id", profile.warehouse_id)
        .in("cell_id", cellChunk)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (unitsError) {
        console.error("Error loading units:", unitsError);
        return NextResponse.json({ error: unitsError.message }, { status: 400 });
      }
      if (!pageUnits?.length) break;
      units.push(...pageUnits);
      if (pageUnits.length < unitsPageSize) break;
    }
  }

  if (units.length === 0) {
    return NextResponse.json({ ok: true, units: [] });
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

  // stay_start: last time unit entered warehouse (resets after return). If never returned = created_at.
  const unitIds = units.map((u: any) => u.id);
  const lastReturnedAtByUnitId = new Map<string, string>();
  const batchSize = 100;
  for (let i = 0; i < unitIds.length; i += batchSize) {
    const batch = unitIds.slice(i, i + batchSize);
    const { data: returnedRows } = await supabaseAdmin
      .from("outbound_shipments")
      .select("unit_id, returned_at")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("status", "returned")
      .in("unit_id", batch)
      .not("returned_at", "is", null)
      .order("returned_at", { ascending: false });
    if (returnedRows?.length) {
      returnedRows.forEach((r: { unit_id: string; returned_at: string }) => {
        if (r.unit_id && r.returned_at && !lastReturnedAtByUnitId.has(r.unit_id)) {
          lastReturnedAtByUnitId.set(r.unit_id, r.returned_at);
        }
      });
    }
  }

  // Filter units that are in storage, shipping, or rejected cells AND not in picking tasks.
  // Cell from warehouse_cells_map (with warehouse_id) = actual cell for this warehouse.
  const now = new Date();
  const mappedUnits = units.map((unit) => {
    const cell = unit.cell_id ? cellsMap.get(unit.cell_id) : null;
    const stayStart = lastReturnedAtByUnitId.get(unit.id) || unit.created_at;
    const stayStartTime = new Date(stayStart).getTime();
    const ageHours = Math.floor((now.getTime() - stayStartTime) / (1000 * 60 * 60));
    return {
      id: unit.id,
      barcode: unit.barcode,
      status: unit.status,
      cell_id: unit.cell_id,
      created_at: unit.created_at,
      age_hours: ageHours,
      ops_status: unit.meta?.ops_status ?? null,
      cell: cell ? { id: cell.id, code: cell.code, cell_type: cell.cell_type } : null,
    };
  });

  const unitsInStorageOrShipping = mappedUnits.filter((unit) => {
    const isInStorageOrShipping =
      unit.cell &&
      (unit.cell.cell_type === "storage" ||
        unit.cell.cell_type === "shipping" ||
        unit.cell.cell_type === "rejected");
    const isNotInTasks = !unitIdsInTasks.has(unit.id);
    return isInStorageOrShipping && isNotInTasks;
  });

  return NextResponse.json({
    ok: true,
    units: unitsInStorageOrShipping,
  });
}
