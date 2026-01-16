import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await supabaseServer();

  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("warehouse_id")
    .eq("id", authData.user.id)
    .single();

  if (!profile?.warehouse_id) {
    return NextResponse.json({ ok: false, error: "profile_not_ready" }, { status: 403 });
  }

  const { data: units, error } = await supabase
    .from("units")
    .select("id, barcode, status, created_at")
    .eq("warehouse_id", profile.warehouse_id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, units });
}