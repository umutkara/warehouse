import { NextResponse } from "next/server";
import { hasAnyRole } from "@/app/api/_shared/role-access";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { WAREHOUSE_CONTROL_ROLES } from "@/app/api/courier/_shared/state";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const auth = await requireCourierAuth(req, { allowedRoles: [...WAREHOUSE_CONTROL_ROLES] });
  if (!auth.ok) return auth.response;
  if (!hasAnyRole(auth.profile.role, [...WAREHOUSE_CONTROL_ROLES])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(Number(url.searchParams.get("days") || "3"), 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: events, error } = await supabaseAdmin
    .from("courier_task_events")
    .select("id, task_id, unit_id, courier_user_id, event_type, lat, lng, happened_at, note, proof_meta")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("event_type", "dropped")
    .gte("happened_at", since)
    .order("happened_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const unitIds = [...new Set((events || []).map((event) => event.unit_id))];
  const courierIds = [...new Set((events || []).map((event) => event.courier_user_id))];
  const [{ data: units }, { data: couriers }] = await Promise.all([
    unitIds.length ? supabaseAdmin.from("units").select("id, barcode").in("id", unitIds) : Promise.resolve({ data: [] as any[] }),
    courierIds.length
      ? supabaseAdmin.from("profiles").select("id, full_name").in("id", courierIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const unitMap = new Map((units || []).map((unit) => [unit.id, unit]));
  const courierMap = new Map((couriers || []).map((courier) => [courier.id, courier]));

  return NextResponse.json({
    ok: true,
    drops: (events || []).map((event) => ({
      ...event,
      unit: unitMap.get(event.unit_id) || { id: event.unit_id },
      courier: courierMap.get(event.courier_user_id) || { id: event.courier_user_id },
    })),
  });
}
