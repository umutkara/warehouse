import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const url = new URL(req.url);
  const unitId = url.searchParams.get("unitId");

  if (!unitId) return NextResponse.json({ error: "Не указан unitId" }, { status: 400 });

  const { data, error } = await supabase
    .from("unit_moves")
    .select("id, from_cell_id, to_cell_id, note, source, created_at, moved_by")
    .eq("unit_id", unitId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ moves: data ?? [] });
}