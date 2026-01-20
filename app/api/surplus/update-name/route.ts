import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/surplus/update-name
 * Updates product_name for a unit
 * Body: { unitId: string, productName: string }
 */
export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { unitId, productName } = body;

    if (!unitId || typeof productName !== "string") {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    // Get user's warehouse
    const { data: profile } = await supabase
      .from("profiles")
      .select("warehouse_id")
      .eq("id", authData.user.id)
      .single();

    if (!profile?.warehouse_id) {
      return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
    }

    // Verify unit belongs to user's warehouse and is in surplus
    const { data: unit } = await supabase
      .from("units")
      .select(`
        id,
        barcode,
        warehouse_id,
        warehouse_cells_map!inner (
          cell_type
        )
      `)
      .eq("id", unitId)
      .single();

    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    if (unit.warehouse_id !== profile.warehouse_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const cell = Array.isArray(unit.warehouse_cells_map) 
      ? unit.warehouse_cells_map[0]
      : unit.warehouse_cells_map;

    if (cell?.cell_type !== "surplus") {
      return NextResponse.json(
        { error: "Unit is not in SURPLUS cell" },
        { status: 400 }
      );
    }

    // Update product_name
    const { error: updateError } = await supabaseAdmin
      .from("units")
      .update({
        product_name: productName.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", unitId);

    if (updateError) {
      console.error("Update error:", updateError);
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    // Audit log
    await supabase.rpc("audit_log_event", {
      p_action: "surplus.update_name",
      p_entity_type: "unit",
      p_entity_id: unitId,
      p_summary: `Обновлено название товара: ${productName.trim()}`,
      p_meta: { barcode: unit.barcode, product_name: productName.trim() },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Update name error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
