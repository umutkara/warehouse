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
    const cellCode = String(body?.cellCode || "").trim().toUpperCase();

    if (!cellCode) {
      return NextResponse.json({ error: "cellCode is required" }, { status: 400 });
    }

    const { data: cell, error: cellError } = await supabaseAdmin
      .from("warehouse_cells")
      .select("id, code, cell_type, warehouse_id")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("code", cellCode)
      .single();

    if (cellError || !cell) {
      return NextResponse.json({ error: "Cell not found" }, { status: 404 });
    }

    const { data: units, error: unitsError } = await supabaseAdmin
      .from("units")
      .select("id")
      .eq("cell_id", cell.id)
      .limit(1);

    if (unitsError) {
      return NextResponse.json({ error: unitsError.message }, { status: 400 });
    }

    if (units && units.length > 0) {
      return NextResponse.json({ error: "Cell contains units. Remove units first." }, { status: 400 });
    }

    const { error: deleteError } = await supabaseAdmin
      .from("warehouse_cells")
      .delete()
      .eq("id", cell.id)
      .eq("warehouse_id", profile.warehouse_id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    await supabase.rpc("audit_log_event", {
      p_action: "cell.delete",
      p_entity_type: "cell",
      p_entity_id: cell.id,
      p_summary: `Удалена ячейка: ${cell.code} (${cell.cell_type})`,
      p_meta: {
        code: cell.code,
        cell_type: cell.cell_type,
        source: "admin.panel",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}
