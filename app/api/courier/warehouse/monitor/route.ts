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

  const { data: openShifts, error: shiftsError } = await supabaseAdmin
    .from("courier_shifts")
    .select("id, courier_user_id, status, started_at")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .in("status", ["open", "closing"])
    .order("started_at", { ascending: false });

  if (shiftsError) {
    return NextResponse.json({ error: shiftsError.message }, { status: 500 });
  }

  const courierIds = [...new Set((openShifts || []).map((shift) => shift.courier_user_id))];
  let profilesMap = new Map<string, any>();
  let lastLocationsMap = new Map<string, any>();
  if (courierIds.length) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, role")
      .in("id", courierIds);
    profilesMap = new Map((profiles || []).map((profile) => [profile.id, profile]));

    const { data: latestLocations } = await supabaseAdmin
      .from("courier_locations")
      .select("courier_user_id, lat, lng, recorded_at, accuracy_m")
      .eq("warehouse_id", auth.profile.warehouse_id)
      .in("courier_user_id", courierIds)
      .order("recorded_at", { ascending: false });

    for (const location of latestLocations || []) {
      if (!lastLocationsMap.has(location.courier_user_id)) {
        lastLocationsMap.set(location.courier_user_id, location);
      }
    }
  }

  const { data: activeTaskRows } = await supabaseAdmin
    .from("courier_tasks")
    .select("courier_user_id, status")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .in("status", ["claimed", "in_route", "arrived", "dropped"]);

  const activeByCourier = new Map<string, number>();
  for (const row of activeTaskRows || []) {
    activeByCourier.set(row.courier_user_id, (activeByCourier.get(row.courier_user_id) || 0) + 1);
  }

  return NextResponse.json({
    ok: true,
    couriers: (openShifts || []).map((shift) => ({
      shift_id: shift.id,
      status: shift.status,
      started_at: shift.started_at,
      courier: profilesMap.get(shift.courier_user_id) || { id: shift.courier_user_id },
      active_tasks: activeByCourier.get(shift.courier_user_id) || 0,
      last_location: lastLocationsMap.get(shift.courier_user_id) || null,
    })),
  });
}
