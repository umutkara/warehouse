import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasAnyRole } from "@/app/api/_shared/role-access";

/**
 * GET /api/logistics/couriers
 * Returns couriers in current user's warehouse.
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

  const { data: couriers, error: couriersError } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, role")
    .eq("warehouse_id", profile.warehouse_id)
    .eq("role", "courier")
    .order("full_name", { ascending: true });

  if (couriersError) {
    return NextResponse.json({ error: couriersError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    couriers: (couriers || []).map((courier) => ({
      id: courier.id,
      full_name: courier.full_name || "Без имени",
      role: courier.role,
    })),
  });
}
