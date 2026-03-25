import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { hasAnyRole } from "@/app/api/_shared/role-access";
import { getOperationalPickingUnitsForWarehouse } from "@/lib/logistics/operational-picking-units";

/**
 * GET /api/logistics/picking-units
 * Units «в picking» по операционной модели (см. lib/logistics/operational-picking-units).
 */
export async function GET() {
  const supabase = await supabaseServer();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profError } = await supabase
    .from("profiles")
    .select("warehouse_id, role")
    .eq("id", userData.user.id)
    .single();

  if (profError || !profile?.warehouse_id) {
    return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
  }

  if (!hasAnyRole(profile.role, ["logistics", "admin", "head", "hub_worker"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await getOperationalPickingUnitsForWarehouse(profile.warehouse_id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    units: result.units,
  });
}
