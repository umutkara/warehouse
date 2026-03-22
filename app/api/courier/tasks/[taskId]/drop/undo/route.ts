import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { COURIER_ALLOWED_ROLES } from "@/app/api/courier/_shared/state";

const UNDO_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

export async function POST(
  req: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  const auth = await requireCourierAuth(req, { allowedRoles: [...COURIER_ALLOWED_ROLES] });
  if (!auth.ok) return auth.response;

  const { taskId } = await context.params;
  if (!taskId) return NextResponse.json({ error: "taskId is required" }, { status: 400 });

  const { data: task, error: taskError } = await supabaseAdmin
    .from("courier_tasks")
    .select("id, warehouse_id, unit_id, courier_user_id, shift_id, status, meta")
    .eq("id", taskId)
    .eq("warehouse_id", auth.profile.warehouse_id)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.courier_user_id !== auth.user.id) {
    return NextResponse.json({ error: "Task belongs to another courier" }, { status: 403 });
  }

  if (task.status !== "dropped") {
    return NextResponse.json(
      { error: "Task is not dropped; nothing to undo", code: "TASK_NOT_DROPPED" },
      { status: 400 },
    );
  }

  const { data: latestDrop, error: eventError } = await supabaseAdmin
    .from("courier_task_events")
    .select("id, event_id, happened_at, proof_meta")
    .eq("task_id", taskId)
    .eq("event_type", "dropped")
    .order("happened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (eventError || !latestDrop) {
    return NextResponse.json(
      { error: "No dropped event found", code: "NO_DROP_EVENT" },
      { status: 404 },
    );
  }

  const happenedAt = new Date(latestDrop.happened_at).getTime();
  const now = Date.now();
  if (now - happenedAt > UNDO_WINDOW_MS) {
    return NextResponse.json(
      {
        error: "Drop can only be undone within 30 minutes",
        code: "UNDO_WINDOW_EXPIRED",
        happened_at: latestDrop.happened_at,
      },
      { status: 400 },
    );
  }

  const proofMeta =
    latestDrop.proof_meta && typeof latestDrop.proof_meta === "object"
      ? (latestDrop.proof_meta as Record<string, unknown>)
      : {};
  const oldOpsStatus = proofMeta.old_ops_status ?? null;
  const oldOpsStatusComment = proofMeta.old_ops_status_comment ?? null;

  const { data: unitRow, error: unitFetchError } = await supabaseAdmin
    .from("units")
    .select("id, barcode, meta")
    .eq("id", task.unit_id)
    .eq("warehouse_id", task.warehouse_id)
    .single();

  if (unitFetchError || !unitRow) {
    return NextResponse.json({ error: "Unit not found" }, { status: 500 });
  }

  const unitMeta = unitRow.meta && typeof unitRow.meta === "object" ? unitRow.meta : {};
  const currentOpsStatus = (unitMeta as Record<string, unknown>)?.ops_status ?? null;
  const updatedMeta = {
    ...(unitMeta as Record<string, unknown>),
    ops_status: oldOpsStatus,
    ops_status_comment: oldOpsStatusComment,
    ops_status_source: oldOpsStatus != null ? "courier_drop_undo" : undefined,
    ops_status_set_at: undefined,
    ops_status_set_by: undefined,
  };
  if (oldOpsStatus == null) {
    delete (updatedMeta as Record<string, unknown>).ops_status;
    delete (updatedMeta as Record<string, unknown>).ops_status_comment;
    delete (updatedMeta as Record<string, unknown>).ops_status_source;
    delete (updatedMeta as Record<string, unknown>).ops_status_set_at;
    delete (updatedMeta as Record<string, unknown>).ops_status_set_by;
  }

  const { error: unitUpdateError } = await supabaseAdmin
    .from("units")
    .update({ meta: updatedMeta })
    .eq("id", task.unit_id)
    .eq("warehouse_id", task.warehouse_id);

  if (unitUpdateError) {
    return NextResponse.json({ error: unitUpdateError.message }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const taskMeta = task.meta && typeof task.meta === "object" ? task.meta : {};
  const { error: taskUpdateError } = await supabaseAdmin
    .from("courier_tasks")
    .update({
      status: "claimed",
      last_event_at: nowIso,
      updated_at: nowIso,
      meta: {
        ...(taskMeta as Record<string, unknown>),
        source: "api.courier.tasks.drop.undo",
        last_undo_event_id: `drop-undo-${taskId}-${Date.now()}`,
      },
    })
    .eq("id", task.id);

  if (taskUpdateError) {
    return NextResponse.json({ error: taskUpdateError.message }, { status: 500 });
  }

  await supabaseAdmin
    .from("courier_task_events")
    .insert({
      warehouse_id: task.warehouse_id,
      task_id: task.id,
      unit_id: task.unit_id,
      courier_user_id: auth.user.id,
      shift_id: task.shift_id ?? null,
      event_id: `drop-undo-${taskId}-${Date.now()}`,
      event_type: "drop_undone",
      happened_at: nowIso,
      note: "Courier undid drop within 30 minutes",
      proof_meta: {
        undone_event_id: latestDrop.event_id,
        reverted_ops_status: currentOpsStatus,
        restored_ops_status: oldOpsStatus,
      },
      meta: { source: "api.courier.tasks.drop.undo" },
    });

  await supabaseAdmin.rpc("audit_log_event", {
    p_action: "courier.task.drop_undone",
    p_entity_type: "courier_task",
    p_entity_id: task.id,
    p_summary: `Курьер отменил дроп в течение 30 минут (task ${taskId})`,
    p_meta: {
      task_id: task.id,
      unit_id: task.unit_id,
      unit_barcode: unitRow.barcode,
      undone_event_id: latestDrop.event_id,
      reverted_ops_status: currentOpsStatus,
      restored_ops_status: oldOpsStatus,
      source: "api.courier.tasks.drop.undo",
    },
  });

  return NextResponse.json({
    ok: true,
    status: "claimed",
    message: "Drop undone",
  });
}
