import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const supabase = await supabaseServer();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profError } = await supabase
    .from("profiles")
    .select("warehouse_id")
    .eq("id", userData.user.id)
    .single();

  if (profError || !profile?.warehouse_id) {
    return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const unitId = String(body?.unitId ?? "");
  const cellCode = String(body?.cellCode ?? "");

  if (!unitId || !cellCode) {
    return NextResponse.json(
      { error: "unitId and cellCode are required" },
      { status: 400 }
    );
  }

  // Transfer must exist for this hub and be in transit
  const { data: transfer, error: transferError } = await supabaseAdmin
    .from("transfers")
    .select("id, unit_id, from_warehouse_id, to_warehouse_id, status")
    .eq("unit_id", unitId)
    .eq("to_warehouse_id", profile.warehouse_id)
    .eq("status", "in_transit")
    .maybeSingle();

  if (transferError) {
    return NextResponse.json({ error: transferError.message }, { status: 400 });
  }

  if (!transfer) {
    return NextResponse.json(
      { error: "Transfer not found or already received" },
      { status: 404 }
    );
  }

  // Load target cell within hub warehouse
  const { data: targetCell, error: cellError } = await supabaseAdmin
    .from("warehouse_cells_map")
    .select("id, warehouse_id, cell_type, is_active")
    .eq("warehouse_id", profile.warehouse_id)
    .eq("code", cellCode)
    .maybeSingle();

  if (cellError || !targetCell) {
    return NextResponse.json({ error: "Target cell not found" }, { status: 404 });
  }

  if (!targetCell.is_active) {
    return NextResponse.json({ error: "Target cell is inactive" }, { status: 400 });
  }

  if (!["bin", "rejected"].includes(targetCell.cell_type)) {
    return NextResponse.json(
      { error: "Hub receiving allowed only to BIN or REJECTED cells" },
      { status: 400 }
    );
  }

  // Load unit to capture previous cell for history
  const { data: unit, error: unitError } = await supabaseAdmin
    .from("units")
    .select("id, warehouse_id, cell_id, status")
    .eq("id", unitId)
    .maybeSingle();

  if (unitError || !unit) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  const newStatus = targetCell.cell_type === "rejected" ? "rejected" : "bin";

  // Move unit ownership to hub and place into target cell
  const { error: unitUpdateError } = await supabaseAdmin
    .from("units")
    .update({
      warehouse_id: profile.warehouse_id,
      cell_id: targetCell.id,
      status: newStatus,
    })
    .eq("id", unitId);

  if (unitUpdateError) {
    return NextResponse.json({ error: unitUpdateError.message }, { status: 400 });
  }

  // Record move history (best-effort)
  try {
    await supabaseAdmin
      .from("unit_moves")
      .insert({
        warehouse_id: profile.warehouse_id,
        unit_id: unitId,
        from_cell_id: unit.cell_id,
        to_cell_id: targetCell.id,
        moved_by: userData.user.id,
        source: "transfer.receive",
        created_at: new Date().toISOString(),
      });
  } catch (e) {
    console.error("Failed to insert unit_moves (non-blocking):", e);
  }

  // Close transfer
  const { error: transferUpdateError } = await supabaseAdmin
    .from("transfers")
    .update({ status: "received", received_at: new Date().toISOString() })
    .eq("id", transfer.id);

  if (transferUpdateError) {
    console.error("Failed to update transfer status:", transferUpdateError);
    return NextResponse.json(
      { error: "Transfer received but status update failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
