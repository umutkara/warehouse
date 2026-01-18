import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/units/[unitId]
 * Returns unit details with all fields
 */
export async function GET(
  req: Request,
  { params }: { params: { unitId: string } }
) {
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

    // Get unit with all fields
    const { data: unit, error: unitError } = await supabase
      .from("units")
      .select(`
        id,
        barcode,
        status,
        product_name,
        partner_name,
        price,
        photos,
        meta,
        cell_id,
        created_at,
        updated_at
      `)
      .eq("id", params.unitId)
      .eq("warehouse_id", profile.warehouse_id)
      .single();

    if (unitError || !unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      unit,
    });
  } catch (e: any) {
    console.error("Get unit error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
