import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const supabase = await supabaseServer();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = userData.user;

  // Get user profile and role
  const { data: profile, error: profError } = await supabase
    .from("profiles")
    .select("warehouse_id, role")
    .eq("id", user.id)
    .single();

  if (profError || !profile?.warehouse_id) {
    return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
  }

  // Role check: only admin, head can delete cells
  if (!["admin", "head"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden: only admin and head can delete cells" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { cellId } = body ?? {};

  if (!cellId) {
    return NextResponse.json({ error: "cellId is required" }, { status: 400 });
  }

  // Get cell info (use admin to bypass RLS)
  const { data: cell, error: cellError } = await supabaseAdmin
    .from("warehouse_cells")
    .select("id, code, cell_type, warehouse_id")
    .eq("id", cellId)
    .single();

  if (cellError || !cell) {
    return NextResponse.json({ error: "Cell not found" }, { status: 404 });
  }

  // Verify cell belongs to user's warehouse
  if (cell.warehouse_id !== profile.warehouse_id) {
    return NextResponse.json({ error: "Cell belongs to different warehouse" }, { status: 403 });
  }

  // Check if cell has units (prevent deletion if not empty)
  const { data: units, error: unitsError } = await supabaseAdmin
    .from("units")
    .select("id")
    .eq("cell_id", cellId)
    .limit(1);

  if (unitsError) {
    return NextResponse.json({ error: "Failed to check cell units" }, { status: 500 });
  }

  if (units && units.length > 0) {
    return NextResponse.json({ error: "Cannot delete cell: cell contains units. Please move or remove all units first." }, { status: 400 });
  }

  // Soft delete: set is_active = false (use admin to bypass RLS)
  const { error: deleteError } = await supabaseAdmin
    .from("warehouse_cells")
    .update({ is_active: false })
    .eq("id", cellId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  // Audit log
  await supabase.rpc("audit_log_event", {
    p_action: "cell.delete",
    p_entity_type: "cell",
    p_entity_id: cellId,
    p_summary: `Удалена ячейка: ${cell.code} (${cell.cell_type})`,
    p_meta: {
      code: cell.code,
      cell_type: cell.cell_type,
    },
  });

  return NextResponse.json({ ok: true });
}
