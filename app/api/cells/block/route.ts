import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const allowed = new Set(["manager", "head", "admin"]);

export async function POST(req: Request) {
  const supabase = await supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile?.role || !allowed.has(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const cellId = String(body?.cellId ?? "");
  const blocked = !!body?.blocked;

  if (!cellId) return NextResponse.json({ error: "Missing cellId" }, { status: 400 });

  // meta merge
  const { data: cell, error: cErr } = await supabase
    .from("warehouse_cells")
    .select("meta")
    .eq("id", cellId)
    .single();

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });

  const nextMeta = { ...(cell?.meta ?? {}), blocked };

  const { error } = await supabase
    .from("warehouse_cells")
    .update({ meta: nextMeta })
    .eq("id", cellId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}