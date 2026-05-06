import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  ACTIVE_TASK_STATUSES,
  courierTaskVisibleInCourierApp,
} from "@/app/api/courier/_shared/state";

export type CourierShiftCloseRow = {
  id: string;
  courier_user_id: string;
};

export type ExecuteCourierShiftCloseParams = {
  warehouseId: string;
  shift: CourierShiftCloseRow;
  closedByUserId: string;
  note: string | null;
  shiftMeta: Record<string, unknown>;
  auditExtra?: Record<string, unknown>;
};

/**
 * Shared implementation for POST /api/courier/shift/close and automatic day rollover.
 */
export async function executeCourierShiftClose(
  params: ExecuteCourierShiftCloseParams,
): Promise<{ now: string; activeCount: number }> {
  const { warehouseId, shift, closedByUserId, note, shiftMeta, auditExtra } =
    params;

  const { data: activeTasks, error: activeError } = await supabaseAdmin
    .from("courier_tasks")
    .select("id, status")
    .eq("warehouse_id", warehouseId)
    .eq("courier_user_id", shift.courier_user_id)
    .in("status", [...ACTIVE_TASK_STATUSES]);

  if (activeError) {
    console.error("[shift/close] active tasks fetch error:", activeError);
    throw new Error(activeError.message);
  }

  const activeCount = activeTasks?.length || 0;
  const now = new Date().toISOString();

  console.log("[shift/close] Closing shift", {
    shiftId: shift.id,
    courierUserId: shift.courier_user_id,
    activeTaskCount: activeCount,
  });

  const { error: closeError } = await supabaseAdmin
    .from("courier_shifts")
    .update({
      status: "closed",
      closed_at: now,
      closed_by: closedByUserId,
      close_note: note,
      updated_at: now,
      meta: shiftMeta,
    })
    .eq("id", shift.id);

  if (closeError) {
    throw new Error(closeError.message);
  }

  const { data: existingHandover } = await supabaseAdmin
    .from("warehouse_handover_sessions")
    .select("id")
    .eq("warehouse_id", warehouseId)
    .eq("shift_id", shift.id)
    .maybeSingle();
  let ensuredHandoverId = existingHandover?.id || null;
  if (!ensuredHandoverId) {
    const { data: insertedHandover, error: insertHandoverErr } =
      await supabaseAdmin
        .from("warehouse_handover_sessions")
        .insert({
          warehouse_id: warehouseId,
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
      console.error(
        "[shift/close] handover session insert error:",
        insertHandoverErr,
      );
      throw new Error(
        "Failed to create handover session: " + insertHandoverErr.message,
      );
    }
    ensuredHandoverId = insertedHandover?.id || null;
  }

  if (ensuredHandoverId) {
    const { data: shiftTasks, error: shiftTasksErr } = await supabaseAdmin
      .from("courier_tasks")
      .select("id, unit_id, meta")
      .eq("warehouse_id", warehouseId)
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
      const existingUnitIds = new Set(
        (existingItems || []).map((row) => row.unit_id).filter(Boolean),
      );
      const seenUnitIds = new Set<string>();
      const itemsToInsert = allOnHandTasks
        .filter((task) => {
          if (existingUnitIds.has(task.unit_id) || seenUnitIds.has(task.unit_id))
            return false;
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
        const { error: insertErr } = await supabaseAdmin
          .from("warehouse_handover_items")
          .insert(itemsToInsert);
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
      closed_by: closedByUserId,
      courier_user_id: shift.courier_user_id,
      note,
      active_task_count: activeCount,
      ...auditExtra,
    },
  });

  return { now, activeCount };
}
