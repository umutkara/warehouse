import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function normalizeBarcode(value: any) {
  return String(value ?? "").replace(/\D/g, "");
}

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
    const unitBarcode = normalizeBarcode(body?.barcode);
    const note = String(body?.note || "").trim();

    if (!unitBarcode) {
      return NextResponse.json({ error: "barcode is required" }, { status: 400 });
    }

    const { data: unit, error: unitError } = await supabaseAdmin
      .from("units")
      .select("id, barcode, cell_id, status, warehouse_id")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("barcode", unitBarcode)
      .single();

    if (unitError || !unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    const { error: updateError } = await supabaseAdmin
      .from("units")
      .update({ cell_id: null, status: "receiving" })
      .eq("id", unit.id)
      .eq("warehouse_id", profile.warehouse_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    await supabaseAdmin.from("unit_moves").insert({
      unit_id: unit.id,
      from_cell_id: unit.cell_id,
      to_cell_id: null,
      note: note || "admin clear cell",
      source: "admin.panel",
      moved_by: userData.user.id,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}
