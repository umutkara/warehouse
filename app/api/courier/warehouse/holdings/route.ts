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

  const { data: rows, error } = await supabaseAdmin
    .from("courier_tasks")
    .select("id, unit_id, courier_user_id, status, claimed_at, zone_id")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .in("status", ["claimed", "in_route", "arrived", "dropped"])
    .order("claimed_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const unitIds = [...new Set((rows || []).map((row) => row.unit_id))];
  const courierIds = [...new Set((rows || []).map((row) => row.courier_user_id))];

  const [{ data: units }, { data: couriers }] = await Promise.all([
    unitIds.length
      ? supabaseAdmin.from("units").select("id, barcode, status, product_name, partner_name").in("id", unitIds)
      : Promise.resolve({ data: [] as any[] }),
    courierIds.length
      ? supabaseAdmin.from("profiles").select("id, full_name, role").in("id", courierIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const unitsMap = new Map((units || []).map((unit) => [unit.id, unit]));
  const courierMap = new Map((couriers || []).map((courier) => [courier.id, courier]));

  return NextResponse.json({
    ok: true,
    holdings: (rows || []).map((row) => ({
      task_id: row.id,
      status: row.status,
      claimed_at: row.claimed_at,
      zone_id: row.zone_id,
      unit: unitsMap.get(row.unit_id) || { id: row.unit_id },
      courier: courierMap.get(row.courier_user_id) || { id: row.courier_user_id },
    })),
  });
}
