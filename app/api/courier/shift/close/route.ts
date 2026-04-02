import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import {
  ACTIVE_TASK_STATUSES,
  COURIER_ALLOWED_ROLES,
  courierTaskVisibleInCourierApp,
  WAREHOUSE_CONTROL_ROLES,
} from "@/app/api/courier/_shared/state";
import { hasAnyRole } from "@/app/api/_shared/role-access";

export async function POST(req: Request) {
  const auth = await requireCourierAuth(req, { allowedRoles: [...COURIER_ALLOWED_ROLES] });
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const force = Boolean(body?.force);
  const note = body?.note?.toString() || null;
  const shiftId = body?.shiftId?.toString() || null;
  const canForce = hasAnyRole(auth.profile.role, [...WAREHOUSE_CONTROL_ROLES]);

  let shiftQuery = supabaseAdmin
    .from("courier_shifts")
    .select("id, warehouse_id, courier_user_id, status")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .in("status", ["open", "closing"]);
  shiftQuery = shiftId ? shiftQuery.eq("id", shiftId) : shiftQuery.eq("courier_user_id", auth.user.id);

  const { data: shift, error: shiftError } = await shiftQuery.order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (shiftError || !shift) {
    return NextResponse.json({ error: "Open shift not found" }, { status: 404 });
  }

  if (shift.courier_user_id !== auth.user.id && !canForce) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Same "on hands" scope as GET /api/courier/tasks/my — do not filter by shift_id,
  // otherwise tasks with null/other shift_id never reach warehouse_handover_items.
  const { data: activeTasks, error: activeError } = await supabaseAdmin
    .from("courier_tasks")
    .select("id, status")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("courier_user_id", shift.courier_user_id)
    .in("status", [...ACTIVE_TASK_STATUSES]);

  if (activeError) {
    console.error("[shift/close] active tasks fetch error:", activeError);
    return NextResponse.json({ error: activeError.message }, { status: 500 });
  }

  const activeCount = activeTasks?.length || 0;
  const now = new Date().toISOString();

  console.log("[shift/close] Closing shift", {
    shiftId: shift.id,
    courierUserId: shift.courier_user_id,
    activeTaskCount: activeCount,
  });

  // Allow close even with active tasks — all orders are queued for warehouse receiving.
  const { error: closeError } = await supabaseAdmin
    .from("courier_shifts")
    .update({
      status: "closed",
      closed_at: now,
      closed_by: auth.user.id,
      close_note: note,
      updated_at: now,
      meta: { source: "api.courier.shift.close", force: force && canForce },
    })
    .eq("id", shift.id);

  if (closeError) {
    return NextResponse.json({ error: closeError.message }, { status: 500 });
  }

  // Ensure warehouse receiving queue exists for dropped point returns.
  const { data: existingHandover } = await supabaseAdmin
    .from("warehouse_handover_sessions")
    .select("id")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("shift_id", shift.id)
    .maybeSingle();
  let ensuredHandoverId = existingHandover?.id || null;
  if (!ensuredHandoverId) {
    const { data: insertedHandover, error: insertHandoverErr } = await supabaseAdmin
      .from("warehouse_handover_sessions")
      .insert({
        warehouse_id: auth.profile.warehouse_id,
        shift_id: shift.id,
        courier_user_id: shift.courier_user_id,
        status: "draft",
        started_at: now,
        note: note || null,
        meta: { source: "api.courier.shift.close", auto_created: true },
      })
      .select("id")
      .single();
    if (insertHandoverErr) {
      console.error("[shift/close] handover session insert error:", insertHandoverErr);
      return NextResponse.json({ error: "Failed to create handover session: " + insertHandoverErr.message }, { status: 500 });
    }
    ensuredHandoverId = insertedHandover?.id || null;
  }

  if (ensuredHandoverId) {
    const { data: shiftTasks, error: shiftTasksErr } = await supabaseAdmin
      .from("courier_tasks")
      .select("id, unit_id, meta")
      .eq("warehouse_id", auth.profile.warehouse_id)
      .eq("courier_user_id", shift.courier_user_id)
      .in("status", [...ACTIVE_TASK_STATUSES]);

    if (shiftTasksErr) {
      console.error("[shift/close] shiftTasks fetch error:", shiftTasksErr);
    }
    const allOnHandTasks = (shiftTasks || []).filter(
      (task) => task.unit_id && courierTaskVisibleInCourierApp(task.meta),
    );
    if (allOnHandTasks.length > 0) {
      const { data: existingItems } = await supabaseAdmin
        .from("warehouse_handover_items")
        .select("unit_id")
        .eq("handover_session_id", ensuredHandoverId);
      const existingUnitIds = new Set((existingItems || []).map((row) => row.unit_id).filter(Boolean));
      const seenUnitIds = new Set<string>();
      const itemsToInsert = allOnHandTasks
        .filter((task) => {
          if (existingUnitIds.has(task.unit_id) || seenUnitIds.has(task.unit_id)) return false;
          seenUnitIds.add(task.unit_id);
          return true;
        })
        .map((task) => ({
          handover_session_id: ensuredHandoverId,
          unit_id: task.unit_id,
          task_id: task.id,
          condition_status: "ok",
          meta: {
            source: "api.courier.shift.close",
            queue_source: "all_on_hand",
            source_kind: "expected",
            receiving_status: "pending",
          },
        }));
      if (itemsToInsert.length > 0) {
        const { error: insertErr } = await supabaseAdmin.from("warehouse_handover_items").insert(itemsToInsert);
        if (insertErr) {
          console.error("[shift/close] handover items insert error:", insertErr);
        } else {
          console.log("[shift/close] Queued units for warehouse receiving", {
            handoverId: ensuredHandoverId,
            itemCount: itemsToInsert.length,
          });
        }
      }
    }
  }

  await supabaseAdmin.rpc("audit_log_event", {
    p_action: "courier.shift_close",
    p_entity_type: "courier_shift",
    p_entity_id: shift.id,
    p_summary: "Courier shift closed",
    p_meta: {
      closed_by: auth.user.id,
      courier_user_id: shift.courier_user_id,
      forced: force && canForce,
      note,
      active_task_count: activeCount,
    },
  });

  return NextResponse.json({
    ok: true,
    shift_id: shift.id,
    closed_at: now,
    active_task_count: activeTasks?.length || 0,
  });
}
