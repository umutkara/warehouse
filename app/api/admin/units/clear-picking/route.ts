import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const supabase = await supabaseServer();

  try {
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

    if (profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const note = String(body?.note || "").trim() || "admin clear picking";

    const { data: pickingCells, error: cellsError } = await supabaseAdmin
      .from("warehouse_cells_map")
      .select("id")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("cell_type", "picking");

    if (cellsError) {
      return NextResponse.json({ error: cellsError.message }, { status: 400 });
    }

    const pickingCellIds = (pickingCells || []).map((c) => c.id).filter(Boolean);
    if (pickingCellIds.length === 0) {
      return NextResponse.json({ ok: true, cleared: 0 });
    }

    const { data: units, error: unitsError } = await supabaseAdmin
      .from("units")
      .select("id, cell_id")
      .eq("warehouse_id", profile.warehouse_id)
      .in("cell_id", pickingCellIds);

    if (unitsError) {
      return NextResponse.json({ error: unitsError.message }, { status: 400 });
    }

    if (!units || units.length === 0) {
      return NextResponse.json({ ok: true, cleared: 0 });
    }

    const { error: updateError } = await supabaseAdmin
      .from("units")
      .update({ cell_id: null, status: "receiving" })
      .eq("warehouse_id", profile.warehouse_id)
      .in("id", units.map((u) => u.id));

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    const moves = units.map((unit) => ({
      unit_id: unit.id,
      from_cell_id: unit.cell_id,
      to_cell_id: null,
      note,
      source: "admin.panel",
      moved_by: userData.user.id,
    }));

    if (moves.length > 0) {
      await supabaseAdmin.from("unit_moves").insert(moves);
    }

    return NextResponse.json({ ok: true, cleared: units.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}
