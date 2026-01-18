import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * POST /api/logistics/ship-out
 * Ships a unit from picking to OUT status
 * Body: { unitId: string, courierName: string }
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();

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

  // Only logistics, admin, head can ship
  if (!["logistics", "admin", "head"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { unitId, courierName } = body ?? {};

  if (!unitId || !courierName) {
    return NextResponse.json(
      { error: "unitId and courierName are required" },
      { status: 400 }
    );
  }

  // Call RPC function to ship unit
  const { data: result, error: rpcError } = await supabase.rpc("ship_unit_out", {
    p_unit_id: unitId,
    p_courier_name: courierName.trim(),
  });

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  const parsedResult = typeof result === "string" ? JSON.parse(result) : result;

  if (!parsedResult?.ok) {
    return NextResponse.json(
      { error: parsedResult?.error || "Failed to ship unit" },
      { status: 400 }
    );
  }

  // Audit log
  await supabase.rpc("audit_log_event", {
    p_action: "logistics.ship_out",
    p_entity_type: "unit",
    p_entity_id: unitId,
    p_summary: `Отправлен заказ ${parsedResult.unit_barcode} курьером ${courierName}`,
    p_meta: {
      shipment_id: parsedResult.shipment_id,
      unit_barcode: parsedResult.unit_barcode,
      courier_name: courierName,
    },
  });

  return NextResponse.json({
    ok: true,
    shipment: parsedResult,
  });
}
