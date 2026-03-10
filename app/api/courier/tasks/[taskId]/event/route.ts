import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { COURIER_ALLOWED_ROLES, mapEventToTaskStatus } from "@/app/api/courier/_shared/state";

export async function POST(
  req: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  const auth = await requireCourierAuth(req, { allowedRoles: [...COURIER_ALLOWED_ROLES] });
  if (!auth.ok) return auth.response;

  const { taskId } = await context.params;
  if (!taskId) return NextResponse.json({ error: "taskId is required" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const eventType = body?.eventType?.toString();
  const eventId = body?.eventId?.toString();
  const note = body?.note?.toString() || null;
  const lat = body?.lat ?? null;
  const lng = body?.lng ?? null;
  const proof = body?.proof ?? {};
  const happenedAt = body?.happenedAt?.toString() || new Date().toISOString();

  if (!eventType || !eventId) {
    return NextResponse.json({ error: "eventType and eventId are required" }, { status: 400 });
  }

  const { data: task, error: taskError } = await supabaseAdmin
    .from("courier_tasks")
    .select("id, warehouse_id, unit_id, courier_user_id, shift_id, status")
    .eq("id", taskId)
    .eq("warehouse_id", auth.profile.warehouse_id)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.courier_user_id !== auth.user.id) {
    return NextResponse.json({ error: "Task belongs to another courier" }, { status: 403 });
  }

  const { data: existingEvent } = await supabaseAdmin
    .from("courier_task_events")
    .select("id, event_type, happened_at")
    .eq("task_id", taskId)
    .eq("event_id", eventId)
    .limit(1)
    .maybeSingle();

  if (existingEvent) {
    return NextResponse.json({
      ok: true,
      duplicated: true,
      event: existingEvent,
    });
  }

  const { data: insertedEvent, error: insertError } = await supabaseAdmin
    .from("courier_task_events")
    .insert({
      warehouse_id: task.warehouse_id,
      task_id: task.id,
      unit_id: task.unit_id,
      courier_user_id: auth.user.id,
      shift_id: task.shift_id,
      event_id: eventId,
      event_type: eventType,
      lat,
      lng,
      happened_at: happenedAt,
      note,
      proof_meta: proof,
      meta: { source: "api.courier.tasks.event" },
    })
    .select("id, event_type, happened_at")
    .single();

  if (insertError || !insertedEvent) {
    return NextResponse.json({ error: insertError?.message || "Failed to insert event" }, { status: 500 });
  }

  const nextStatus = mapEventToTaskStatus(eventType);
  const now = new Date().toISOString();
  const patch: Record<string, any> = {
    status: nextStatus,
    last_event_at: happenedAt,
    updated_at: now,
    current_lat: lat,
    current_lng: lng,
    meta: { source: "api.courier.tasks.event", last_event_type: eventType },
  };
  if (eventType === "delivered") patch.delivered_at = happenedAt;
  if (eventType === "failed") patch.failed_at = happenedAt;
  if (eventType === "returned") patch.returned_at = happenedAt;
  if (eventType === "arrived") patch.accepted_at = happenedAt;
  if (eventType === "failed") {
    patch.fail_reason = body?.failReason?.toString() || "unspecified";
    patch.fail_comment = note;
  }

  const { error: updateError } = await supabaseAdmin
    .from("courier_tasks")
    .update(patch)
    .eq("id", task.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabaseAdmin.rpc("audit_log_event", {
    p_action: `courier.task.${eventType}`,
    p_entity_type: "courier_task",
    p_entity_id: task.id,
    p_summary: `Courier task event: ${eventType}`,
    p_meta: {
      task_id: task.id,
      unit_id: task.unit_id,
      event_id: eventId,
      lat,
      lng,
      note,
    },
  });

  return NextResponse.json({
    ok: true,
    event: insertedEvent,
    status: nextStatus,
  });
}
