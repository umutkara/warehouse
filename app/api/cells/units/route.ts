import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getDisplayCellIdsByUnitIds } from "@/lib/units/display-cell-id";

export async function GET(req: Request) {
  const supabase = await supabaseServer();

  const url = new URL(req.url);
  const cellId = url.searchParams.get("cellId");
  if (!cellId) return NextResponse.json({ error: "Не указан cellId" }, { status: 400 });

  // Get user and warehouse
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profError } = await supabase
    .from("profiles")
    .select("warehouse_id")
    .eq("id", userData.user.id)
    .single();

  if (profError || !profile?.warehouse_id) {
    return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
  }

  const { data: cell, error: cellError } = await supabaseAdmin
    .from("warehouse_cells")
    .select("id, code, cell_type")
    .eq("id", cellId)
    .eq("warehouse_id", profile.warehouse_id)
    .eq("is_active", true)
    .maybeSingle();

  if (cellError) return NextResponse.json({ error: cellError.message }, { status: 400 });
  if (!cell) return NextResponse.json({ units: [] });

  // Non-picking cells: show physical contents.
  if (cell.cell_type !== "picking") {
    const { data, error } = await supabase
      .from("units")
      .select("id, barcode, status, created_at, warehouse_id, cell_id")
      .eq("cell_id", cellId)
      .eq("warehouse_id", profile.warehouse_id)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ units: data ?? [] });
  }

  // Picking cells: как на карте после выравнивания — только юниты, у которых отображаемая ячейка
  // (последний move / cell_id / цель задачи) совпадает с этой picking-ячейкой.
  const { data: activeTasks, error: activeTasksError } = await supabaseAdmin
    .from("picking_tasks")
    .select("id, created_at, target_picking_cell_id")
    .eq("warehouse_id", profile.warehouse_id)
    .in("status", ["open", "in_progress"])
    .not("target_picking_cell_id", "is", null);

  if (activeTasksError) return NextResponse.json({ error: activeTasksError.message }, { status: 400 });

  const tasks = activeTasks || [];
  const taskIds = tasks.map((t: any) => t.id);
  const taskMap = new Map<string, any>(tasks.map((t: any) => [t.id, t]));
  let taskUnits: any[] = [];
  if (taskIds.length > 0) {
    const chunkSize = 200;
    for (let i = 0; i < taskIds.length; i += chunkSize) {
      const chunk = taskIds.slice(i, i + chunkSize);
      const { data: chunkRows, error: chunkErr } = await supabaseAdmin
        .from("picking_task_units")
        .select("unit_id, picking_task_id")
        .in("picking_task_id", chunk);
      if (chunkErr) return NextResponse.json({ error: chunkErr.message }, { status: 400 });
      if (chunkRows?.length) taskUnits.push(...chunkRows);
    }
  }

  const latestTaskByUnitId = new Map<string, any>();
  for (const tu of taskUnits || []) {
    if (!tu?.unit_id || !tu?.picking_task_id) continue;
    const candidateTask = taskMap.get(tu.picking_task_id);
    if (!candidateTask) continue;
    const current = latestTaskByUnitId.get(tu.unit_id);
    if (!current) {
      latestTaskByUnitId.set(tu.unit_id, candidateTask);
      continue;
    }
    const currentTs = new Date(current.created_at || 0).getTime();
    const candidateTs = new Date(candidateTask.created_at || 0).getTime();
    if (candidateTs >= currentTs) latestTaskByUnitId.set(tu.unit_id, candidateTask);
  }

  const unitIdsForCell = [...latestTaskByUnitId.entries()]
    .filter(([, t]) => t?.target_picking_cell_id === cellId)
    .map(([unitId]) => unitId);

  let units: any[] = [];
  if (unitIdsForCell.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < unitIdsForCell.length; i += chunkSize) {
      const chunk = unitIdsForCell.slice(i, i + chunkSize);
      const { data: chunkUnits, error: chunkErr } = await supabaseAdmin
        .from("units")
        .select("id, barcode, status, created_at, warehouse_id, cell_id")
        .eq("warehouse_id", profile.warehouse_id)
        .in("id", chunk);
      if (chunkErr) return NextResponse.json({ error: chunkErr.message }, { status: 400 });
      if (chunkUnits?.length) units.push(...chunkUnits);
    }
  }

  const shippedSet = new Set<string>();
  if (unitIdsForCell.length > 0) {
    const { data: shippedRows, error: shippedErr } = await supabaseAdmin
      .from("outbound_shipments")
      .select("unit_id")
      .in("unit_id", unitIdsForCell)
      .eq("status", "out");
    if (shippedErr) return NextResponse.json({ error: shippedErr.message }, { status: 400 });
    for (const row of shippedRows || []) {
      if (row.unit_id) shippedSet.add(row.unit_id);
    }
  }

  const resultUnits = units
    .filter((u) => !shippedSet.has(u.id))
    .sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
    );

  const displayByUnit = await getDisplayCellIdsByUnitIds(
    profile.warehouse_id,
    resultUnits.map((u) => ({ id: u.id, cell_id: u.cell_id, status: u.status })),
  );
  const alignedUnits = resultUnits.filter((u) => displayByUnit.get(u.id) === cellId);

  return NextResponse.json({ units: alignedUnits });
}