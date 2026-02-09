import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function normalizeBarcode(value: any) {
  return String(value ?? "").replace(/\D/g, "");
}

function toInt(value: any, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();

  try {
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

    if (profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const unitBarcode = normalizeBarcode(body?.barcode);
    const olderThanDays = toInt(body?.olderThanDays, 2);
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();

    if (!unitBarcode) {
      return NextResponse.json({ error: "barcode is required" }, { status: 400 });
    }

    const { data: unit, error: unitError } = await supabaseAdmin
      .from("units")
      .select("id, barcode, cell_id")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("barcode", unitBarcode)
      .single();

    if (unitError || !unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    const { data: taskUnitRows } = await supabaseAdmin
      .from("picking_task_units")
      .select("picking_task_id")
      .eq("unit_id", unit.id);

    const { data: legacyTasks } = await supabaseAdmin
      .from("picking_tasks")
      .select("id")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("unit_id", unit.id);

    const taskIds = new Set<string>();
    (taskUnitRows || []).forEach((row: { picking_task_id: string }) => {
      if (row?.picking_task_id) taskIds.add(row.picking_task_id);
    });
    (legacyTasks || []).forEach((row: { id: string }) => {
      if (row?.id) taskIds.add(row.id);
    });

    const taskIdList = Array.from(taskIds);
    const { data: tasks } = await supabaseAdmin
      .from("picking_tasks")
      .select("id, status, created_at, picked_at, completed_at, target_picking_cell_id")
      .eq("warehouse_id", profile.warehouse_id)
      .in("id", taskIdList);

    const { data: cell, error: cellError } = unit.cell_id
      ? await supabaseAdmin
          .from("warehouse_cells_map")
          .select("id, cell_type, code")
          .eq("id", unit.cell_id)
          .single()
      : { data: null, error: null };

    const eligibleTaskIds = (tasks || [])
      .filter((t: any) => t?.status === "in_progress" && String(t?.created_at || "") <= cutoff)
      .map((t: any) => t.id);

    return NextResponse.json({
      ok: true,
      unit: { id: unit.id, barcode: unit.barcode, cell_id: unit.cell_id },
      cell: cell ? { id: cell.id, code: cell.code, cell_type: cell.cell_type } : null,
      tasks: tasks || [],
      eligibleToClose: {
        olderThanDays,
        cutoff,
        inProgressOlderTaskIds: eligibleTaskIds,
        hasPickingCell: cell?.cell_type === "picking",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}
