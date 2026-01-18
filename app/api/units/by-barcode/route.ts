import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await supabaseServer();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const barcode = (url.searchParams.get("barcode") ?? "").trim();

  if (!barcode) return NextResponse.json({ error: "Missing barcode" }, { status: 400 });

  // Get warehouse_id for filtering
  const { data: profile, error: profError } = await supabase
    .from("profiles")
    .select("warehouse_id")
    .eq("id", userData.user.id)
    .single();

  if (profError || !profile?.warehouse_id) {
    return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("units")
    .select("id, barcode, status, created_at, cell_id, warehouse_id")
    .eq("barcode", barcode)
    .eq("warehouse_id", profile.warehouse_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });

  // Get current cell info if unit is in a cell
  let cellInfo = null;
  if (data.cell_id) {
    const { data: cell } = await supabase
      .from("warehouse_cells_map")
      .select("id, code, cell_type")
      .eq("id", data.cell_id)
      .eq("warehouse_id", profile.warehouse_id)
      .maybeSingle();
    if (cell) {
      cellInfo = {
        id: cell.id,
        code: cell.code,
        cell_type: cell.cell_type,
      };
    }
  }

  return NextResponse.json({
    unit: {
      id: data.id,
      barcode: data.barcode,
      status: data.status,
      created_at: data.created_at,
      cell_id: data.cell_id,
    },
    cell: cellInfo,
  });
}