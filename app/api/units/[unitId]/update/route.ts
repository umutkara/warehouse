import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * PATCH /api/units/[unitId]/update
 * Updates unit information (product_name, partner_name, price)
 */
export async function PATCH(
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
      .select("warehouse_id, role")
      .eq("id", userData.user.id)
      .single();

    if (!profile?.warehouse_id) {
      return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
    }

    // Only certain roles can update unit info
    const allowedRoles = ["admin", "head", "manager", "ops"];
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get unit to verify ownership
    const { data: unit, error: unitError } = await supabase
      .from("units")
      .select("id, barcode, warehouse_id, product_name, partner_name, price")
      .eq("id", params.unitId)
      .single();

    if (unitError || !unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    if (unit.warehouse_id !== profile.warehouse_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse body
    const body = await req.json().catch(() => ({}));
    const { product_name, partner_name, price } = body;

    // Build update object
    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (product_name !== undefined) {
      updates.product_name = product_name?.trim() || null;
    }

    if (partner_name !== undefined) {
      updates.partner_name = partner_name?.trim() || null;
    }

    if (price !== undefined) {
      const numPrice = parseFloat(price);
      if (isNaN(numPrice) || numPrice < 0) {
        return NextResponse.json({ error: "Invalid price" }, { status: 400 });
      }
      updates.price = numPrice;
    }

    // Update unit
    const { data: updatedUnit, error: updateError } = await supabaseAdmin
      .from("units")
      .update(updates)
      .eq("id", params.unitId)
      .select("id, barcode, product_name, partner_name, price, photos, status, created_at")
      .single();

    if (updateError) {
      console.error("Update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update unit" },
        { status: 500 }
      );
    }

    // Audit log
    await supabase.rpc("audit_log_event", {
      p_action: "unit.update",
      p_entity_type: "unit",
      p_entity_id: params.unitId,
      p_summary: `Обновлена информация о ${unit.barcode}`,
      p_meta: updates,
    });

    return NextResponse.json({
      ok: true,
      unit: updatedUnit,
    });
  } catch (e: any) {
    console.error("Update unit error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
