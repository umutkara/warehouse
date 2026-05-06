import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { executeCourierShiftClose } from "@/app/api/courier/_shared/execute-courier-shift-close";
import {
  COURIER_ALLOWED_ROLES,
  WAREHOUSE_CONTROL_ROLES,
} from "@/app/api/courier/_shared/state";
import { hasAnyRole } from "@/app/api/_shared/role-access";

export async function POST(req: Request) {
  const auth = await requireCourierAuth(req, {
    allowedRoles: [...COURIER_ALLOWED_ROLES],
  });
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
  shiftQuery = shiftId
    ? shiftQuery.eq("id", shiftId)
    : shiftQuery.eq("courier_user_id", auth.user.id);

  const { data: shift, error: shiftError } = await shiftQuery
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (shiftError || !shift) {
    return NextResponse.json({ error: "Open shift not found" }, { status: 404 });
  }

  if (shift.courier_user_id !== auth.user.id && !canForce) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { now, activeCount } = await executeCourierShiftClose({
      warehouseId: auth.profile.warehouse_id,
      shift,
      closedByUserId: auth.user.id,
      note,
      shiftMeta: { source: "api.courier.shift.close", force: force && canForce },
      auditExtra: { forced: force && canForce },
    });

    return NextResponse.json({
      ok: true,
      shift_id: shift.id,
      closed_at: now,
      active_task_count: activeCount,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Close failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
