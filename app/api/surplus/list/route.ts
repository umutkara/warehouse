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
    const { data: units, error: unitsError } = await supabase
      .from("units")
      .select(`
        id,
        barcode,
        product_name,
        received_at,
        cell_id,
        warehouse_cells_map!inner (
          id,
          code,
          cell_type,
          warehouse_id
        )
      `)
      .eq("warehouse_cells_map.cell_type", "surplus")
      .eq("warehouse_cells_map.warehouse_id", profile.warehouse_id)
      .order("received_at", { ascending: false });

    if (unitsError) {
      console.error("Units query error:", unitsError);
      return NextResponse.json({ error: "Failed to fetch units" }, { status: 500 });
    }

    // Transform data
    const transformedUnits = (units || []).map((unit: any) => {
      const cell = Array.isArray(unit.warehouse_cells_map) 
        ? unit.warehouse_cells_map[0]
        : unit.warehouse_cells_map;

      return {
        id: unit.id,
        barcode: unit.barcode,
        product_name: unit.product_name,
        received_at: unit.received_at,
        cell_id: unit.cell_id,
        cell_code: cell?.code,
        warehouse_id: profile.warehouse_id,
      };
    });

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
