import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await supabaseServer();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = userData.user;

  // Получаем склад пользователя
  const { data: profile, error: profError } = await supabase
    .from("profiles")
    .select("warehouse_id")
    .eq("id", user.id)
    .single();

  if (profError || !profile?.warehouse_id) {
    return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("warehouse_cells_map")
    .select("id,warehouse_id,code,cell_type,x,y,w,h,is_active,meta,units_count,calc_status")
    .eq("warehouse_id", profile.warehouse_id)
    .eq("is_active", true)
    .order("code");

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ cells: data ?? [] });
}