import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/units/partner-rejected-missing
 * Returns list of units with OPS status "partner_rejected_return" that are NOT on warehouse
 * (cell_id IS NULL or status not in warehouse statuses)
 */
export async function GET(req: Request) {
  const supabase = await supabaseServer();

  try {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("warehouse_id")
      .eq("id", userData.user.id)
      .single();

    if (!profile?.warehouse_id) {
      return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
    }

    // Get units with OPS status "partner_rejected_return"
    // That are NOT on warehouse (cell_id IS NULL OR status not in warehouse statuses)
    // First, get all units with the OPS status, then filter in code
    const { data: allUnits, error: allUnitsError } = await supabaseAdmin
      .from("units")
      .select(`
        id,
        barcode,
        status,
        product_name,
        partner_name,
        price,
        cell_id,
        created_at,
        meta
      `)
      .eq("warehouse_id", profile.warehouse_id)
      .order("created_at", { ascending: false });

    if (allUnitsError) {
      console.error("Partner rejected missing units error:", allUnitsError);
      return NextResponse.json(
        { error: "Failed to load units" },
        { status: 500 }
      );
    }

    // Filter: OPS status = "partner_rejected_return" AND (cell_id IS NULL OR status not in warehouse statuses)
    const warehouseStatuses = ["stored", "bin", "picking", "shipping"];
    const units = (allUnits || []).filter((unit: any) => {
      const opsStatus = unit.meta?.ops_status;
      if (opsStatus !== "partner_rejected_return") return false;
      
      // Not on warehouse if: cell_id is null OR status is not in warehouse statuses
      const notOnWarehouse = !unit.cell_id || !warehouseStatuses.includes(unit.status);
      return notOnWarehouse;
    });

    // Calculate age for each unit
    const now = new Date();
    const unitsWithInfo = (units || []).map((unit: any) => {
      const createdAt = new Date(unit.created_at);
      const ageHours = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
      const ageDays = Math.floor(ageHours / 24);
      
      return {
        id: unit.id,
        barcode: unit.barcode,
        status: unit.status,
        product_name: unit.product_name,
        partner_name: unit.partner_name,
        price: unit.price,
        cell_id: unit.cell_id,
        created_at: unit.created_at,
        age_hours: ageHours,
        age_days: ageDays,
        ops_status: unit.meta?.ops_status || null,
        ops_status_comment: unit.meta?.ops_status_comment || null,
        meta: unit.meta,
      };
    });

    return NextResponse.json({
      ok: true,
      units: unitsWithInfo,
      total: unitsWithInfo.length,
    });
  } catch (e: any) {
    console.error("Partner rejected missing units error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
