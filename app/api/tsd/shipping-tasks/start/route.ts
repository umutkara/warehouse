import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/tsd/shipping-tasks/start
 * Starts a picking task (changes status from 'open' to 'in_progress')
 * This locks the task for the current user and prevents conflicts
 * Body: { taskId: string }
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

  // Check role: worker + ops + admin/head/manager can start tasks
  if (!["worker", "ops", "admin", "head", "manager"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const taskId = body.taskId;

  if (!taskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  // Get task (use admin to bypass RLS)
  const { data: task, error: taskError } = await supabaseAdmin
    .from("picking_tasks")
    .select("id, warehouse_id, status, picked_by")
    .eq("id", taskId)
    .eq("warehouse_id", profile.warehouse_id)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Check if task is already in progress by someone else
  if (task.status === "in_progress" && task.picked_by !== userData.user.id) {
    return NextResponse.json(
      { error: "Task is already in progress by another user" },
      { status: 409 }
    );
  }

  // Check if task is already in progress by current user (idempotent)
  if (task.status === "in_progress" && task.picked_by === userData.user.id) {
    return NextResponse.json({
      ok: true,
      message: "Task already started by you",
    });
  }

  // Check if task is not open
  if (task.status !== "open") {
    return NextResponse.json(
      { error: `Task status is ${task.status}, cannot start` },
      { status: 400 }
    );
  }

  // Update task status to in_progress
  const { error: updateError } = await supabaseAdmin
    .from("picking_tasks")
    .update({
      status: "in_progress",
      picked_by: userData.user.id,
      picked_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Audit log
  await supabase.rpc("audit_log_event", {
    p_action: "picking_task_start",
    p_entity_type: "picking_task",
    p_entity_id: taskId,
    p_summary: "Задание взято в работу",
    p_meta: {
      task_id: taskId,
    },
  });

  return NextResponse.json({
    ok: true,
    message: "Task started successfully",
  });
}
