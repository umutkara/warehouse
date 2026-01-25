import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const url = new URL(req.url);
  const unitId = url.searchParams.get("unitId");

  if (!unitId) return NextResponse.json({ error: "Не указан unitId" }, { status: 400 });

  const { data: moves, error: movesError } = await supabaseAdmin
    .from("unit_moves")
    .select("id, from_cell_id, to_cell_id, note, source, created_at, moved_by")
    .eq("unit_id", unitId);

  if (movesError) return NextResponse.json({ error: movesError.message }, { status: 400 });

  const { data: events, error: eventsError } = await supabaseAdmin
    .from("audit_events")
    .select("id, created_at, action, summary")
    .eq("entity_type", "unit")
    .eq("entity_id", unitId);

  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 400 });

  const eventMoves = (events ?? []).map((e: any) => ({
    id: e.id,
    note: e.summary,
    source: e.action,
    created_at: e.created_at,
  }));

  const combined = [...(moves ?? []), ...eventMoves].sort((a: any, b: any) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return NextResponse.json({ moves: combined });
}