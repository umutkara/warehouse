import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { COURIER_ALLOWED_ROLES } from "@/app/api/courier/_shared/state";

/**
 * POST /api/courier/tasks/[taskId]/remove-from-hands
 * Убирает задачу из «на руках» курьера — скрывает отображение, unit не удаляется.
 * Логируется в audit.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  const auth = await requireCourierAuth(req, { allowedRoles: [...COURIER_ALLOWED_ROLES] });
  if (!auth.ok) return auth.response;

  const { taskId } = await context.params;
  if (!taskId) return NextResponse.json({ error: "taskId is required" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const reason = body?.reason?.toString().trim() || null;

  const { data: task, error: taskError } = await supabaseAdmin
    .from("courier_tasks")
    .select("id, unit_id, courier_user_id, meta")
    .eq("id", taskId)
    .eq("warehouse_id", auth.profile.warehouse_id)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.courier_user_id !== auth.user.id) {
    return NextResponse.json({ error: "Task belongs to another courier" }, { status: 403 });
  }

  const currentMeta = (task.meta && typeof task.meta === "object") ? (task.meta as Record<string, unknown>) : {};
  const updatedMeta = {
    ...currentMeta,
    hidden_from_courier: true,
    hidden_from_courier_at: new Date().toISOString(),
    hidden_from_courier_by: auth.user.id,
    hidden_from_courier_reason: reason,
  };

  const { error: updateError } = await supabaseAdmin
    .from("courier_tasks")
    .update({ meta: updatedMeta, updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("warehouse_id", auth.profile.warehouse_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { data: unit } = await supabaseAdmin
    .from("units")
    .select("barcode")
    .eq("id", task.unit_id)
    .single();

  await supabaseAdmin.rpc("audit_log_event", {
    p_action: "courier.remove_from_hands",
    p_entity_type: "courier_task",
    p_entity_id: taskId,
    p_summary: `Курьер убрал заказ с рук: ${unit?.barcode ?? task.unit_id}`,
    p_meta: {
      task_id: taskId,
      unit_id: task.unit_id,
      unit_barcode: unit?.barcode,
      courier_user_id: auth.user.id,
      reason,
    },
  });

  return NextResponse.json({ ok: true });
}
