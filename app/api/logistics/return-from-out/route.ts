import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * POST /api/logistics/return-from-out
 * Returns a unit from OUT status back to warehouse
 * Body: { shipmentId: string, targetCellCode: string, returnReason?: string }
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

  // Only logistics, admin, head can return
  if (!["logistics", "admin", "head"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { shipmentId, targetCellCode, returnReason } = body ?? {};

  if (!shipmentId || !targetCellCode) {
    return NextResponse.json(
      { error: "shipmentId and targetCellCode are required" },
      { status: 400 }
    );
  }

  // Call RPC function to return unit
  const { data: result, error: rpcError } = await supabase.rpc("return_unit_from_out", {
    p_shipment_id: shipmentId,
    p_target_cell_code: targetCellCode.trim(),
    p_return_reason: returnReason?.trim() || null,
  });

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  const parsedResult = typeof result === "string" ? JSON.parse(result) : result;

  if (!parsedResult?.ok) {
    return NextResponse.json(
      { error: parsedResult?.error || "Failed to return unit" },
      { status: 400 }
    );
  }

  // Audit log
  await supabase.rpc("audit_log_event", {
    p_action: "logistics.return_from_out",
    p_entity_type: "unit",
    p_entity_id: parsedResult.unit_id,
    p_summary: `Возврат заказа ${parsedResult.unit_barcode} из OUT в ${parsedResult.target_cell_code}`,
    p_meta: {
      shipment_id: shipmentId,
      unit_barcode: parsedResult.unit_barcode,
      target_cell_code: parsedResult.target_cell_code,
      target_cell_type: parsedResult.target_cell_type,
      return_reason: returnReason || null,
    },
  });

  return NextResponse.json({
    ok: true,
    result: parsedResult,
  });
}
