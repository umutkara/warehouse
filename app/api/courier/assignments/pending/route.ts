import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCourierAuth } from "@/app/api/courier/_shared/auth";
import { COURIER_ALLOWED_ROLES } from "@/app/api/courier/_shared/state";

export async function GET(req: Request) {
  const auth = await requireCourierAuth(req, { allowedRoles: [...COURIER_ALLOWED_ROLES] });
  if (!auth.ok) return auth.response;

  const { data: shipments, error } = await supabaseAdmin
    .from("outbound_shipments")
    .select("id, unit_id, courier_name, out_at, status, meta")
    .eq("warehouse_id", auth.profile.warehouse_id)
    .eq("courier_user_id", auth.user.id)
    .eq("status", "out")
    .order("out_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pendingShipments = (shipments || []).filter((shipment) => {
    const meta = shipment.meta as Record<string, any> | null;
    const confirmedAt = meta?.courier_pickup_confirmed_at;
    const rejectedAt = meta?.courier_pickup_rejected_at;
    return !confirmedAt && !rejectedAt;
  });

  const unitIds = pendingShipments.map((row) => row.unit_id).filter(Boolean);
  let unitsMap = new Map<string, any>();
  if (unitIds.length > 0) {
    const { data: units } = await supabaseAdmin
      .from("units")
      .select("id, barcode, status, product_name, partner_name")
      .in("id", unitIds);
    unitsMap = new Map((units || []).map((unit) => [unit.id, unit]));
  }

  return NextResponse.json({
    ok: true,
    assignments: pendingShipments.map((shipment) => ({
      id: shipment.id,
      unit_id: shipment.unit_id,
      courier_name: shipment.courier_name,
      out_at: shipment.out_at,
      status: shipment.status,
      unit: unitsMap.get(shipment.unit_id) || null,
      meta: shipment.meta || {},
    })),
  });
}
