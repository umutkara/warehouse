import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/surplus/list
 * Returns all units in SURPLUS cells
 */
export async function GET() {
  try {
    const supabase = await supabaseServer();

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    // Get all units in SURPLUS cells
    // Сначала получаем ID всех surplus ячеек
    const { data: surplusCells, error: cellsError } = await supabase
      .from("warehouse_cells_map")
      .select("id, code, cell_type")
      .eq("cell_type", "surplus")
      .eq("warehouse_id", profile.warehouse_id);

    console.log("DEBUG surplus cells:", { surplusCells, cellsError, warehouse_id: profile.warehouse_id });

    if (!surplusCells || surplusCells.length === 0) {
      console.log("No surplus cells found, returning empty");
      return NextResponse.json({
        units: [],
        total: 0,
      });
    }

    const cellIds = surplusCells.map(c => c.id);
    console.log("DEBUG cell IDs:", cellIds);

    // Получаем units в этих ячейках (без join - упрощенный запрос)
    const { data: units, error: unitsError } = await supabase
      .from("units")
      .select("id, barcode, product_name, received_at, created_at, cell_id")
      .in("cell_id", cellIds)
      .eq("warehouse_id", profile.warehouse_id)
      .order("created_at", { ascending: false });

    console.log("DEBUG units query:", { units, unitsError, cellIds });

    if (unitsError) {
      console.error("Units query error FULL:", {
        message: unitsError.message,
        details: unitsError.details,
        hint: unitsError.hint,
        code: unitsError.code,
      });
      return NextResponse.json({ 
        error: "Failed to fetch units",
        details: unitsError.message,
        code: unitsError.code,
      }, { status: 500 });
    }

    // Transform data
    const transformedUnits = (units || []).map((unit: any) => {
      // Находим соответствующую ячейку из surplusCells
      const cell = surplusCells.find(c => c.id === unit.cell_id);

      return {
        id: unit.id,
        barcode: unit.barcode,
        product_name: unit.product_name,
        received_at: unit.received_at || unit.created_at, // fallback to created_at
        cell_id: unit.cell_id,
        cell_code: cell?.code,
        warehouse_id: profile.warehouse_id,
      };
    });

    console.log("DEBUG transformed units:", transformedUnits);

    return NextResponse.json({
      units: transformedUnits,
      total: transformedUnits.length,
    });
  } catch (e: any) {
    console.error("Surplus list error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
