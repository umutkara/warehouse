import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { ACTIVE_TASK_STATUSES, COURIER_ALLOWED_ROLES, WAREHOUSE_CONTROL_ROLES } from "@/app/api/courier/_shared/state";
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

  const { data: activeTasks, error: activeError } = await supabaseAdmin
    .from("courier_tasks")
    .select("id, status")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("courier_user_id", shift.courier_user_id)
    .eq("shift_id", shift.id)
    .in("status", [...ACTIVE_TASK_STATUSES]);

  if (activeError) {
    return NextResponse.json({ error: activeError.message }, { status: 500 });
  }
  if ((activeTasks?.length || 0) > 0 && !(force && canForce)) {
    return NextResponse.json(
      {
        error: "Active tasks remain. Resolve tasks or use force close with warehouse role.",
        active_task_count: activeTasks?.length || 0,
      },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
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
    },
  });

  return NextResponse.json({
    ok: true,
    shift_id: shift.id,
    closed_at: now,
    active_task_count: activeTasks?.length || 0,
  });
}
