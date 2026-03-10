import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { COURIER_ALLOWED_ROLES, WAREHOUSE_CONTROL_ROLES } from "@/app/api/courier/_shared/state";
import { hasAnyRole } from "@/app/api/_shared/role-access";

export async function POST(req: Request) {
  const auth = await requireCourierAuth(req, { allowedRoles: [...COURIER_ALLOWED_ROLES] });
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const requestedCourierUserId = body?.courierUserId?.toString();
  const canStartForAnotherCourier = hasAnyRole(auth.profile.role, [...WAREHOUSE_CONTROL_ROLES]);
  const courierUserId =
    requestedCourierUserId && canStartForAnotherCourier ? requestedCourierUserId : auth.user.id;
  const note = body?.note?.toString() || null;

  const { data: existingShift } = await supabaseAdmin
    .from("courier_shifts")
    .select("id, status, started_at")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("courier_user_id", courierUserId)
    .in("status", ["open", "closing"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingShift) {
    return NextResponse.json({
      ok: true,
      shift: existingShift,
      already_open: true,
    });
  }

  const now = new Date().toISOString();
  const { data: shift, error: shiftError } = await supabaseAdmin
    .from("courier_shifts")
    .insert({
      warehouse_id: auth.profile.warehouse_id,
      courier_user_id: courierUserId,
      status: "open",
      started_at: now,
      started_by: auth.user.id,
      start_note: note,
      meta: { source: "api.courier.shift.start" },
    })
    .select("id, warehouse_id, courier_user_id, status, started_at")
    .single();

  if (shiftError || !shift) {
    return NextResponse.json({ error: shiftError?.message || "Failed to start shift" }, { status: 500 });
  }

  await supabaseAdmin.rpc("audit_log_event", {
    p_action: "courier.shift_start",
    p_entity_type: "courier_shift",
    p_entity_id: shift.id,
    p_summary: "Courier shift started",
    p_meta: {
      courier_user_id: courierUserId,
      started_by: auth.user.id,
      note,
    },
  });

  return NextResponse.json({
    ok: true,
    shift,
  });
}
