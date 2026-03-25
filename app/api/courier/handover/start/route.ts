import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { COURIER_ALLOWED_ROLES } from "@/app/api/courier/_shared/state";

export async function POST(req: Request) {
  const auth = await requireCourierAuth(req, { allowedRoles: [...COURIER_ALLOWED_ROLES] });
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const shiftId = body?.shiftId?.toString();
  const note = body?.note?.toString() || null;

  let shiftQuery = supabaseAdmin
    .from("courier_shifts")
    .select("id, courier_user_id, warehouse_id, status")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("courier_user_id", auth.user.id)
    .in("status", ["open", "closing", "closed"]);

  if (shiftId) shiftQuery = shiftQuery.eq("id", shiftId);

  const { data: shift, error: shiftError } = await shiftQuery.order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (shiftError || !shift) {
    return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  }

  const { data: existingSession } = await supabaseAdmin
    .from("warehouse_handover_sessions")
    .select("id, status, started_at")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("shift_id", shift.id)
    .maybeSingle();

  if (existingSession) {
    return NextResponse.json({ ok: true, handover: existingSession, already_exists: true });
  }

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("warehouse_handover_sessions")
    .insert({
      warehouse_id: auth.profile.warehouse_id,
      shift_id: shift.id,
      courier_user_id: shift.courier_user_id,
      status: "draft",
      note,
      meta: { source: "api.courier.handover.start" },
    })
    .select("id, status, started_at")
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: sessionError?.message || "Failed to create handover session" }, { status: 500 });
  }

  const { data: taskUnits } = await supabaseAdmin
    .from("courier_tasks")
    .select("id, unit_id")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("courier_user_id", shift.courier_user_id)
    .in("status", ["claimed", "in_route", "arrived", "dropped", "failed", "returned"]);

  const allOnHandUnits = (taskUnits || []).filter((row) => row.unit_id);
  if (allOnHandUnits.length > 0) {
    await supabaseAdmin.from("warehouse_handover_items").insert(
      allOnHandUnits.map((row) => ({
        handover_session_id: session.id,
        unit_id: row.unit_id,
        task_id: row.id,
        condition_status: "ok",
        meta: {
          source: "api.courier.handover.start",
          queue_source: "all_on_hand",
          source_kind: "expected",
          receiving_status: "pending",
        },
      })),
    );
  }

  return NextResponse.json({
    ok: true,
    handover: session,
    prefilled_items: allOnHandUnits.length,
  });
}
