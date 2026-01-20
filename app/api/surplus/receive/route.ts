import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/surplus/receive
 * Receives surplus units (creates unit if doesn't exist and places in surplus cell)
 * Body: { unitBarcode: string, cellCode: string }
 */
export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's warehouse
    const { data: profile } = await supabase
      .from("profiles")
      .select("warehouse_id, role")
      .eq("id", authData.user.id)
      .single();

    if (!profile?.warehouse_id) {
      return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
    }

    const body = await req.json();
    const { unitBarcode, cellCode } = body;

    if (!unitBarcode || !cellCode) {
      return NextResponse.json({ error: "unitBarcode and cellCode are required" }, { status: 400 });
    }

    // Get cell
    const { data: cell } = await supabase
      .from("warehouse_cells_map")
      .select("id, code, cell_type, warehouse_id")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("code", cellCode.trim().toUpperCase())
      .single();

    if (!cell) {
      return NextResponse.json({ error: "Cell not found" }, { status: 404 });
    }

    if (cell.cell_type !== "surplus") {
      return NextResponse.json({ error: "Cell must be of type surplus" }, { status: 400 });
    }

    const normalizedBarcode = unitBarcode.trim();

    // Check if unit already exists
    const { data: existingUnit } = await supabase
      .from("units")
      .select("id, barcode, cell_id")
      .eq("barcode", normalizedBarcode)
      .single();

    let unitId: string;

    if (existingUnit) {
      // Unit exists
      if (existingUnit.cell_id) {
        return NextResponse.json(
          { error: `Unit ${normalizedBarcode} is already placed in a cell` },
          { status: 400 }
        );
      }
      unitId = existingUnit.id;
    } else {
      // Unit doesn't exist - create new unit (SURPLUS без ТТНК)
      const { data: newUnit, error: createError } = await supabaseAdmin
        .from("units")
        .insert({
          barcode: normalizedBarcode,
          warehouse_id: profile.warehouse_id,
          status: "received",
          received_at: new Date().toISOString(),
          cell_id: null, // Will be set by move_unit_to_cell
        })
        .select("id")
        .single();

      if (createError || !newUnit) {
        console.error("Create unit error:", createError);
        return NextResponse.json({ error: "Failed to create unit" }, { status: 500 });
      }

      unitId = newUnit.id;
    }

    // Move unit to surplus cell
    const { data: moveResult, error: moveError } = await supabase.rpc("move_unit_to_cell", {
      p_unit_id: unitId,
      p_to_cell_id: cell.id,
      p_to_status: "stored", // surplus units are stored
    });

    if (moveError) {
      // Check for inventory block
      if (moveError.message && moveError.message.includes('INVENTORY_ACTIVE')) {
        return NextResponse.json(
          { error: "Инвентаризация активна. Перемещения заблокированы." },
          { status: 423 }
        );
      }
      console.error("Move error:", moveError);
      return NextResponse.json({ error: moveError.message }, { status: 400 });
    }

    // Audit log
    await supabase.rpc("audit_log_event", {
      p_action: "surplus.receive",
      p_entity_type: "unit",
      p_entity_id: unitId,
      p_summary: `Принят излишек ${normalizedBarcode} в ${cellCode}`,
      p_meta: {
        barcode: normalizedBarcode,
        cell_code: cellCode,
        created: !existingUnit,
      },
    });

    return NextResponse.json({
      ok: true,
      unitId,
      barcode: normalizedBarcode,
      cellCode: cellCode,
      created: !existingUnit,
    });
  } catch (e: any) {
    console.error("Surplus receive error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
