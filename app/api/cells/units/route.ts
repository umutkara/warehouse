import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await supabaseServer();

  const url = new URL(req.url);
  const cellId = url.searchParams.get("cellId");
  if (!cellId) return NextResponse.json({ error: "Не указан cellId" }, { status: 400 });

  const { data, error } = await supabase
    .from("units")
    .select("id, barcode, created_at")
    .eq("cell_id", cellId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ units: data ?? [] });
}