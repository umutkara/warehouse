import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/logistics/out-shipments
 * Returns all active OUT shipments for logistics role
 */
export async function GET(req: Request) {
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

  // Only logistics, admin, head, manager, ops can view
  if (!["logistics", "admin", "head", "manager", "ops"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get filter from query params
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "out"; // default: active shipments

  // Get shipments (use admin to bypass RLS)
  const { data: shipments, error: shipmentsError } = await supabaseAdmin
    .from("outbound_shipments")
    .select(`
      id,
      unit_id,
      courier_name,
      out_by,
      out_at,
      returned_by,
      returned_at,
      return_reason,
      status,
      created_at
    `)
    .eq("warehouse_id", profile.warehouse_id)
    .eq("status", status)
    .order("out_at", { ascending: false });

  if (shipmentsError) {
    return NextResponse.json({ error: shipmentsError.message }, { status: 400 });
  }

  // Get unit info
  const unitIds = shipments?.map(s => s.unit_id) || [];
  const { data: units } = await supabaseAdmin
    .from("units")
    .select("id, barcode, meta")
    .in("id", unitIds);

  const unitsMap = new Map(units?.map(u => [u.id, u]) || []);

  // Get user names (out_by, returned_by)
  const userIds = [
    ...new Set([
      ...shipments?.map(s => s.out_by).filter(Boolean) || [],
      ...shipments?.map(s => s.returned_by).filter(Boolean) || [],
    ])
  ];

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, role")
    .in("id", userIds);

  const profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);

  // Enrich shipments
  const enrichedShipments = (shipments || []).map(s => ({
    ...s,
    unit: unitsMap.get(s.unit_id) || null,
    out_by_profile: profilesMap.get(s.out_by) || null,
    returned_by_profile: s.returned_by ? profilesMap.get(s.returned_by) : null,
  }));

  return NextResponse.json({
    ok: true,
    shipments: enrichedShipments,
  });
}
