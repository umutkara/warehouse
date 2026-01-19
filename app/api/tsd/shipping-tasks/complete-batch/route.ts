import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/tsd/shipping-tasks/complete-batch
 * Completes a picking task after multiple units have been moved
 * Body: { taskId: string, movedUnitIds: string[] }
 */
export async function POST(req: Request) {
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

  // Check role: worker + ops + admin/head/manager can complete
  if (!["worker", "ops", "admin", "head", "manager"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const taskId = body.taskId;
  const movedUnitIds = Array.isArray(body.movedUnitIds) ? body.movedUnitIds : [];

  if (!taskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  // Get task (use admin to bypass RLS)
  const { data: task, error: taskError } = await supabaseAdmin
    .from("picking_tasks")
    .select("id, warehouse_id, status, target_picking_cell_id, created_at")
    .eq("id", taskId)
    .eq("warehouse_id", profile.warehouse_id)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Check if task is already done
  if (task.status === "done") {
    return NextResponse.json({ error: "Task already completed" }, { status: 400 });
  }

  // Check if task is canceled
  if (task.status === "canceled") {
    return NextResponse.json({ error: "Task is canceled" }, { status: 400 });
  }

  // Get all units in this task
  const { data: taskUnits, error: taskUnitsError } = await supabaseAdmin
    .from("picking_task_units")
    .select("unit_id")
    .eq("picking_task_id", taskId);

  if (taskUnitsError) {
    return NextResponse.json({ error: taskUnitsError.message }, { status: 400 });
  }

  const totalUnits = taskUnits?.length || 0;
  const movedUnitsCount = movedUnitIds.length;

  // Optional: Check if all units have been moved
  // For now, we allow partial completion (task will remain open/in_progress)
  const allUnitsMoved = totalUnits > 0 && movedUnitsCount >= totalUnits;

  if (allUnitsMoved) {
    // Mark task as done
    const { error: updateError } = await supabaseAdmin
      .from("picking_tasks")
      .update({
        status: "done",
        completed_by: userData.user.id,
        completed_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Audit log
    await supabase.rpc("audit_log_event", {
      p_action: "picking_task_complete",
      p_entity_type: "picking_task",
      p_entity_id: taskId,
      p_summary: `Задание завершено: перемещено ${movedUnitsCount} заказов`,
      p_meta: {
        task_id: taskId,
        unit_count: totalUnits,
        moved_count: movedUnitsCount,
        target_picking_cell_id: task.target_picking_cell_id,
      },
    });

    return NextResponse.json({
      ok: true,
      taskCompleted: true,
      message: `Задание завершено: ${movedUnitsCount}/${totalUnits} заказов перемещено`,
    });
  } else {
    // Task remains in_progress (partial completion)
    // Note: Task should already be in_progress (set when FROM cell was scanned)
    return NextResponse.json({
      ok: true,
      taskCompleted: false,
      message: `Перемещено ${movedUnitsCount}/${totalUnits} заказов. Задание остается в работе.`,
    });
  }
}
