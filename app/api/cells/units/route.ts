import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await supabaseServer();

  const url = new URL(req.url);
  const cellId = url.searchParams.get("cellId");
  if (!cellId) return NextResponse.json({ error: "Не указан cellId" }, { status: 400 });

  // Get user and warehouse
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profError } = await supabase
    .from("profiles")
    .select("warehouse_id")
    .eq("id", userData.user.id)
    .single();

  if (profError || !profile?.warehouse_id) {
    return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
  }

  // Get units from units table (actual units in cell)
  const { data, error } = await supabase
    .from("units")
    .select("id, barcode, status, created_at, warehouse_id, cell_id")
    .eq("cell_id", cellId)
    .eq("warehouse_id", profile.warehouse_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  
  return NextResponse.json({ units: data ?? [] });
}