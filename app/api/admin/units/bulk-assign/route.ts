import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function normalizeBarcode(value: any) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeCellCode(value: any) {
  return String(value ?? "").trim().toUpperCase();
}

function statusByCellType(cellType: string) {
  switch (cellType) {
    case "bin":
      return "bin";
    case "storage":
      return "stored";
    case "shipping":
      return "shipping";
    case "picking":
      return "picking";
    case "rejected":
      return "rejected";
    default:
      return null;
  }
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
    const cellCode = normalizeCellCode(body?.cellCode);
    const barcodes = Array.isArray(body?.barcodes) ? body.barcodes.map(normalizeBarcode).filter(Boolean) : [];

    if (!cellCode || barcodes.length === 0) {
      return NextResponse.json({ error: "cellCode and barcodes are required" }, { status: 400 });
    }

    const { data: cell, error: cellError } = await supabaseAdmin
      .from("warehouse_cells_map")
      .select("id, code, cell_type, warehouse_id, is_active")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("code", cellCode)
      .single();

    if (cellError || !cell) {
      return NextResponse.json({ error: "Target cell not found" }, { status: 404 });
    }

    if (!cell.is_active) {
      return NextResponse.json({ error: "Target cell is inactive" }, { status: 400 });
    }

    const { data: units, error: unitsError } = await supabaseAdmin
      .from("units")
      .select("id, barcode, cell_id, status, warehouse_id")
      .eq("warehouse_id", profile.warehouse_id)
      .in("barcode", barcodes);

    if (unitsError) {
      return NextResponse.json({ error: unitsError.message }, { status: 400 });
    }

    const unitsMap = new Map((units || []).map((u) => [u.barcode, u]));
    const toStatus = statusByCellType(cell.cell_type);
    let updated = 0;
    const errors: Array<{ barcode: string; message: string }> = [];

    for (const barcode of barcodes) {
      const unit = unitsMap.get(barcode);
      if (!unit) {
        errors.push({ barcode, message: "Unit not found" });
        continue;
      }

      const { error: updateError } = await supabaseAdmin
        .from("units")
        .update({ cell_id: cell.id, status: toStatus || unit.status || null })
        .eq("id", unit.id)
        .eq("warehouse_id", profile.warehouse_id);

      if (updateError) {
        errors.push({ barcode, message: updateError.message });
        continue;
      }

      await supabaseAdmin.from("unit_moves").insert({
        unit_id: unit.id,
        from_cell_id: unit.cell_id,
        to_cell_id: cell.id,
        note: "admin bulk assign",
        source: "admin.panel",
        moved_by: userData.user.id,
      });

      updated += 1;
    }

    return NextResponse.json({ ok: true, updated, errors });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}
