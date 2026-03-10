import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { ACTIVE_TASK_STATUSES, COURIER_ALLOWED_ROLES, WAREHOUSE_CONTROL_ROLES } from "@/app/api/courier/_shared/state";
import { hasAnyRole } from "@/app/api/_shared/role-access";

export async function GET(req: Request) {
  const auth = await requireCourierAuth(req, { allowedRoles: [...COURIER_ALLOWED_ROLES] });
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const requestedCourierUserId = url.searchParams.get("courierUserId");
  const canInspectAnyCourier = hasAnyRole(auth.profile.role, [...WAREHOUSE_CONTROL_ROLES]);
  const courierUserId =
    requestedCourierUserId && canInspectAnyCourier ? requestedCourierUserId : auth.user.id;

  const { data: shift, error: shiftError } = await supabaseAdmin
    .from("courier_shifts")
    .select("id, status, started_at, closed_at, warehouse_id, courier_user_id")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("courier_user_id", courierUserId)
    .in("status", ["open", "closing"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (shiftError) {
    return NextResponse.json({ error: shiftError.message }, { status: 500 });
  }

  if (!shift) {
    return NextResponse.json({ ok: true, shift: null, metrics: null, last_location: null });
  }

  const { data: activeTasks } = await supabaseAdmin
    .from("courier_tasks")
    .select("id, status, unit_id")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("courier_user_id", courierUserId)
    .eq("shift_id", shift.id)
    .order("claimed_at", { ascending: false });

  const { data: lastLocation } = await supabaseAdmin
    .from("courier_locations")
    .select("lat, lng, recorded_at, accuracy_m, speed_m_s")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("courier_user_id", courierUserId)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const allTasks = activeTasks || [];
  const active = allTasks.filter((task) => ACTIVE_TASK_STATUSES.includes(task.status as any)).length;
  const terminal = allTasks.length - active;

  return NextResponse.json({
    ok: true,
    shift,
    metrics: {
      total_tasks: allTasks.length,
      active_tasks: active,
      completed_or_terminal: terminal,
    },
    last_location: lastLocation || null,
  });
}
