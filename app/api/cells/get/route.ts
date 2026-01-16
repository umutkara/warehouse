import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await supabaseServer();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const cellId = url.searchParams.get("cellId");

  if (!cellId) {
    return NextResponse.json({ error: "Missing cellId" }, { status: 400 });
  }

  // Get warehouse_id from profile
  const { data: profile, error: profError } = await supabase
    .from("profiles")
    .select("warehouse_id")
    .eq("id", userData.user.id)
    .single();

  if (profError || !profile?.warehouse_id) {
    return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("warehouse_cells_map")
    .select("id, code, cell_type, units_count, calc_status, warehouse_id")
    .eq("id", cellId)
    .eq("warehouse_id", profile.warehouse_id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data) {
    return NextResponse.json({ error: "Cell not found" }, { status: 404 });
  }

  // Check if cell belongs to different warehouse (should not happen after filter, but double check)
  if (data.warehouse_id !== profile.warehouse_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ cell: data });
}
