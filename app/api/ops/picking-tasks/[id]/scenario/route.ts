import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireUserProfile } from "@/app/api/_shared/user-profile";

/**
 * PATCH /api/ops/picking-tasks/[id]/scenario
 * Updates scenario for an existing picking task.
 * Body: { scenario: string | null }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await supabaseServer();
  const { id: taskId } = await params;

  const auth = await requireUserProfile(supabase, {
    profileSelect: "warehouse_id, role, full_name",
    allowedRoles: ["admin", "head", "manager", "ops", "logistics"],
  });
  if (!auth.ok) {
    return auth.response;
  }
  const { user, profile } = auth;

  const body = await req.json().catch(() => null);
  if (!body || !Object.prototype.hasOwnProperty.call(body, "scenario")) {
    return NextResponse.json({ error: "scenario is required" }, { status: 400 });
  }

  const rawScenario = body.scenario;
  const scenario =
    typeof rawScenario === "string" ? rawScenario.trim() : rawScenario === null ? null : undefined;

  if (scenario === undefined) {
    return NextResponse.json({ error: "scenario must be string or null" }, { status: 400 });
  }

  if (typeof scenario === "string" && scenario.length > 500) {
    return NextResponse.json({ error: "scenario is too long (max 500 chars)" }, { status: 400 });
  }

  const { data: task, error: taskError } = await supabaseAdmin
    .from("picking_tasks")
    .select("id, scenario, status, warehouse_id")
    .eq("id", taskId)
    .eq("warehouse_id", profile.warehouse_id)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (!["open", "in_progress"].includes(task.status)) {
    return NextResponse.json(
      { error: "Можно редактировать сценарий только для задач open/in_progress" },
      { status: 400 }
    );
  }

  const { data: updatedTask, error: updateError } = await supabaseAdmin
    .from("picking_tasks")
    .update({ scenario })
    .eq("id", taskId)
    .eq("warehouse_id", profile.warehouse_id)
    .select("id, scenario, status, created_at")
    .single();

  if (updateError || !updatedTask) {
    return NextResponse.json({ error: updateError?.message || "Failed to update scenario" }, { status: 500 });
  }

  const actorName = profile.full_name || user.email || "Unknown";
  const oldScenario = (task.scenario || "").trim() || null;
  const newScenario = (scenario || "").trim() || null;

  await supabase.rpc("audit_log_event", {
    p_action: "picking_task_scenario_update",
    p_entity_type: "picking_task",
    p_entity_id: taskId,
    p_summary: `Обновлен сценарий задачи: ${oldScenario || "—"} → ${newScenario || "—"}`,
    p_meta: {
      task_id: taskId,
      old_scenario: oldScenario,
      new_scenario: newScenario,
      task_status: task.status,
      updated_by_name: actorName,
      updated_by_role: profile.role,
    },
  });

  return NextResponse.json({
    ok: true,
    task: updatedTask,
  });
}
