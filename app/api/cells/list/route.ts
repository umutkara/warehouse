import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await supabaseServer();

  const { data: userData, error: authError } = await supabase.auth.getUser();
  
  if (!userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = userData.user;

  // Получаем склад пользователя
  const { data: profile, error: profError } = await supabase
    .from("profiles")
    .select("warehouse_id")
    .eq("id", user.id)
    .single();

  if (profError || !profile?.warehouse_id) {
    return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("warehouse_cells_map")
    .select("id,warehouse_id,code,cell_type,x,y,w,h,is_active,meta,units_count,calc_status")
    .eq("warehouse_id", profile.warehouse_id)
    .eq("is_active", true)
    .order("code");

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const cells = data ?? [];
  const taskTargetCountByCellId = new Map<string, number>();

  let taskSourceError = false;

  try {
    const { data: activeTasks, error: activeTasksError } = await supabaseAdmin
      .from("picking_tasks")
      .select("id, target_picking_cell_id, created_at")
      .eq("warehouse_id", profile.warehouse_id)
      .in("status", ["open", "in_progress"])
      .not("target_picking_cell_id", "is", null);

    if (activeTasksError) {
      taskSourceError = true;
    } else {
      const tasks = activeTasks || [];
      const taskMap = new Map<string, any>(tasks.map((t: any) => [t.id, t]));
      const taskIds = tasks.map((t: any) => t.id);
      let taskUnits: any[] = [];

      if (taskIds.length > 0) {
        const chunkSize = 200;
        for (let i = 0; i < taskIds.length; i += chunkSize) {
          const chunk = taskIds.slice(i, i + chunkSize);
          const { data: chunkRows, error: chunkErr } = await supabaseAdmin
            .from("picking_task_units")
            .select("unit_id, picking_task_id")
            .in("picking_task_id", chunk);
          if (chunkErr) {
            taskSourceError = true;
            break;
          }
          if (chunkRows?.length) taskUnits.push(...chunkRows);
        }
      }

      if (!taskSourceError) {
        const latestTaskByUnitId = new Map<string, any>();
        (taskUnits || []).forEach((tu: any) => {
          if (!tu?.unit_id || !tu?.picking_task_id) return;
          const candidateTask = taskMap.get(tu.picking_task_id);
          if (!candidateTask) return;
          const current = latestTaskByUnitId.get(tu.unit_id);
          if (!current) {
            latestTaskByUnitId.set(tu.unit_id, candidateTask);
            return;
          }
          const currentTs = new Date(current.created_at || 0).getTime();
          const candidateTs = new Date(candidateTask.created_at || 0).getTime();
          if (candidateTs >= currentTs) latestTaskByUnitId.set(tu.unit_id, candidateTask);
        });

        const unitIds = [...latestTaskByUnitId.keys()];

        const shippedSet = new Set<string>();
        if (unitIds.length > 0) {
          const { data: shippedRows, error: shippedErr } = await supabaseAdmin
            .from("outbound_shipments")
            .select("unit_id")
            .in("unit_id", unitIds)
            .eq("status", "out");
          if (shippedErr) {
            taskSourceError = true;
          } else {
            (shippedRows || []).forEach((row: any) => {
              if (row.unit_id) shippedSet.add(row.unit_id);
            });
          }
        }

        if (!taskSourceError) {
          for (const unitId of unitIds) {
            if (shippedSet.has(unitId)) continue;
            const task = latestTaskByUnitId.get(unitId);
            const cellId = task?.target_picking_cell_id;
            if (!cellId) continue;
            taskTargetCountByCellId.set(cellId, (taskTargetCountByCellId.get(cellId) || 0) + 1);
          }
        }
      }
    }
  } catch (_) {
    taskSourceError = true;
  }

  const responseCells = cells.map((cell: any) => {
    if (cell.cell_type !== "picking") return cell;
    const taskCount = taskTargetCountByCellId.get(cell.id);
    if (typeof taskCount !== "number") return cell;
    return {
      ...cell,
      units_count: taskCount,
    };
  });

  return NextResponse.json({ cells: responseCells });
}