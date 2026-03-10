import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasAnyRole } from "@/app/api/_shared/role-access";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { COURIER_ALLOWED_ROLES, WAREHOUSE_CONTROL_ROLES } from "@/app/api/courier/_shared/state";

export async function POST(req: Request) {
  const auth = await requireCourierAuth(req, { allowedRoles: [...COURIER_ALLOWED_ROLES] });
  if (!auth.ok) return auth.response;
  if (!hasAnyRole(auth.profile.role, [...WAREHOUSE_CONTROL_ROLES])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const handoverId = body?.handoverId?.toString();
  const note = body?.note?.toString() || null;
  if (!handoverId) {
    return NextResponse.json({ error: "handoverId is required" }, { status: 400 });
  }

  const { data: handover, error: handoverError } = await supabaseAdmin
    .from("warehouse_handover_sessions")
    .select("id, shift_id, courier_user_id, warehouse_id, status")
    .eq("id", handoverId)
    .eq("warehouse_id", auth.profile.warehouse_id)
    .maybeSingle();

  if (handoverError || !handover) {
    return NextResponse.json({ error: "Handover session not found" }, { status: 404 });
  }
  if (handover.status === "confirmed") {
    return NextResponse.json({ ok: true, already_confirmed: true });
  }

  const now = new Date().toISOString();
  const { error: confirmError } = await supabaseAdmin
    .from("warehouse_handover_sessions")
    .update({
      status: "confirmed",
      receiver_user_id: auth.user.id,
      confirmed_at: now,
      note,
      updated_at: now,
      meta: { source: "api.courier.handover.confirm" },
    })
    .eq("id", handover.id);

  if (confirmError) {
    return NextResponse.json({ error: confirmError.message }, { status: 500 });
  }

  await supabaseAdmin
    .from("courier_shifts")
    .update({
      status: "closed",
      closed_at: now,
      close_approved_by: auth.user.id,
      updated_at: now,
      meta: { source: "api.courier.handover.confirm", handover_id: handover.id },
    })
    .eq("id", handover.shift_id)
    .neq("status", "closed");

  await supabaseAdmin.rpc("audit_log_event", {
    p_action: "courier.handover_confirm",
    p_entity_type: "courier_handover",
    p_entity_id: handover.id,
    p_summary: "Warehouse handover confirmed",
    p_meta: {
      handover_id: handover.id,
      shift_id: handover.shift_id,
      courier_user_id: handover.courier_user_id,
      receiver_user_id: auth.user.id,
      note,
    },
  });

  return NextResponse.json({
    ok: true,
    handover_id: handover.id,
    confirmed_at: now,
  });
}
