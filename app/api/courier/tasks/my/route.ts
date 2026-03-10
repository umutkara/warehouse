import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { COURIER_ALLOWED_ROLES } from "@/app/api/courier/_shared/state";

export async function GET(req: Request) {
  const auth = await requireCourierAuth(req, { allowedRoles: [...COURIER_ALLOWED_ROLES] });
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const includeCompleted = url.searchParams.get("includeCompleted") === "true";

  let query = supabaseAdmin
    .from("courier_tasks")
    .select(
      `
        id,
        pool_id,
        shift_id,
        unit_id,
        status,
        claimed_at,
        accepted_at,
        delivered_at,
        failed_at,
        returned_at,
        fail_reason,
        fail_comment,
        current_lat,
        current_lng,
        meta
      `,
    )
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("courier_user_id", auth.user.id)
    .order("claimed_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  } else if (!includeCompleted) {
    query = query.not("status", "in", "(delivered,failed,returned,canceled)");
  }

  const { data: tasks, error: tasksError } = await query;
  if (tasksError) {
    return NextResponse.json({ error: tasksError.message }, { status: 500 });
  }

  const unitIds = (tasks || []).map((task) => task.unit_id).filter(Boolean);
  let unitsMap = new Map<string, any>();
  if (unitIds.length) {
    const { data: units } = await supabaseAdmin
      .from("units")
      .select("id, barcode, status, product_name, partner_name, meta")
      .in("id", unitIds);
    unitsMap = new Map((units || []).map((unit) => [unit.id, unit]));
  }

  return NextResponse.json({
    ok: true,
    tasks: (tasks || []).map((task) => ({
      ...task,
      unit: unitsMap.get(task.unit_id) || null,
    })),
  });
}
