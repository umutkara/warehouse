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

  // Пустая задача (0 заказов в picking_task_units) — закрываем, чтобы не висела в списке
  if (totalUnits === 0) {
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

    await supabase.rpc("audit_log_event", {
      p_action: "picking_task_complete",
      p_entity_type: "picking_task",
      p_entity_id: taskId,
      p_summary: "Задание без заказов закрыто",
      p_meta: { task_id: taskId, unit_count: 0, empty_task: true },
    });

    return NextResponse.json({
      ok: true,
      taskCompleted: true,
      message: "Задание без заказов закрыто.",
    });
  }

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
  }

  // Recovery: if frontend sent fewer movedUnitIds (e.g. task skipped in batch), check DB — if all units are already in target picking cell, mark task done
  const targetCellId = task.target_picking_cell_id;
  if (!targetCellId || totalUnits === 0) {
    return NextResponse.json({
      ok: true,
      taskCompleted: false,
      message: `Перемещено ${movedUnitsCount}/${totalUnits} заказов. Задание остается в работе.`,
    });
  }

  const unitIdsInTask = (taskUnits || []).map((tu: any) => tu.unit_id).filter(Boolean);
  if (unitIdsInTask.length === 0) {
    return NextResponse.json({
      ok: true,
      taskCompleted: false,
      message: `В задаче нет заказов (${movedUnitsCount} передано).`,
    });
  }

  const { data: unitsNow } = await supabaseAdmin
    .from("units")
    .select("id, cell_id, status")
    .in("id", unitIdsInTask)
    .eq("warehouse_id", profile.warehouse_id);

  const allInPicking =
    (unitsNow?.length ?? 0) === unitIdsInTask.length &&
    (unitsNow || []).every(
      (u: any) => u.cell_id === targetCellId || u.status === "picking"
    );

  if (allInPicking) {
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

    await supabase.rpc("audit_log_event", {
      p_action: "picking_task_complete",
      p_entity_type: "picking_task",
      p_entity_id: taskId,
      p_summary: `Задание завершено (восстановление): все заказы уже в ячейке`,
      p_meta: {
        task_id: taskId,
        unit_count: totalUnits,
        moved_count: movedUnitsCount,
        target_picking_cell_id: targetCellId,
        recovery: true,
      },
    });

    return NextResponse.json({
      ok: true,
      taskCompleted: true,
      message: `Задание завершено: все ${totalUnits} заказов уже в picking-ячейке.`,
    });
  }

  // Task remains in_progress (partial completion)
  return NextResponse.json({
    ok: true,
    taskCompleted: false,
    message: `Перемещено ${movedUnitsCount}/${totalUnits} заказов. Задание остается в работе.`,
  });
}
