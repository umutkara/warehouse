import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { COURIER_ALLOWED_ROLES } from "@/app/api/courier/_shared/state";

/**
 * POST /api/courier/tasks/remove-from-hands-batch
 * Массово убирает задачи из «на руках» курьера.
 * Body: { taskIds: string[], reason?: string }
 */
export async function POST(req: Request) {
  const auth = await requireCourierAuth(req, {
    allowedRoles: [...COURIER_ALLOWED_ROLES],
  });
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const rawIds = body?.taskIds;
  const taskIds = Array.isArray(rawIds)
    ? rawIds.map((id: unknown) => String(id)).filter(Boolean)
    : [];
  const reason = body?.reason?.toString().trim() || null;

  if (taskIds.length === 0) {
    return NextResponse.json(
      { error: "taskIds array is required and must not be empty" },
      { status: 400 }
    );
  }

  const { data: tasks, error: fetchError } = await supabaseAdmin
    .from("courier_tasks")
    .select("id, unit_id, courier_user_id, meta")
    .in("id", taskIds)
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("courier_user_id", auth.user.id);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const validTasks = tasks ?? [];
  if (validTasks.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const idsToUpdate = validTasks.map((t) => t.id);
  const now = new Date().toISOString();
  const updatedMeta = (task: (typeof validTasks)[number]) => {
    const current =
      task.meta && typeof task.meta === "object"
        ? (task.meta as Record<string, unknown>)
        : {};
    return {
      ...current,
      hidden_from_courier: true,
      hidden_from_courier_at: now,
      hidden_from_courier_by: auth.user.id,
      hidden_from_courier_reason: reason,
    };
  };

  for (const task of validTasks) {
    const { error: updateError } = await supabaseAdmin
      .from("courier_tasks")
      .update({ meta: updatedMeta(task), updated_at: now })
      .eq("id", task.id)
      .eq("warehouse_id", auth.profile.warehouse_id);

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to update task ${task.id}: ${updateError.message}` },
        { status: 500 }
      );
    }
  }

  const { data: units } = await supabaseAdmin
    .from("units")
    .select("id, barcode")
    .in("id", validTasks.map((t) => t.unit_id));

  const barcodeById = new Map(
    (units ?? []).map((u) => [u.id, u.barcode ?? u.id])
  );

  for (const task of validTasks) {
    const barcode = barcodeById.get(task.unit_id) ?? task.unit_id;
    await supabaseAdmin.rpc("audit_log_event", {
      p_action: "courier.remove_from_hands",
      p_entity_type: "courier_task",
      p_entity_id: task.id,
      p_summary: `Курьер убрал заказ с рук (пакетная передача): ${barcode}`,
      p_meta: {
        task_id: task.id,
        unit_id: task.unit_id,
        unit_barcode: barcode,
        courier_user_id: auth.user.id,
        reason,
        batch: true,
      },
    });
  }

  return NextResponse.json({ ok: true, processed: validTasks.length });
}
