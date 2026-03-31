import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { hasAnyRole } from "@/app/api/_shared/role-access";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/logistics/picking-units
 * Physical picking view for logistics: only units that are currently in picking cells (by units.cell_id).
 */
export async function GET() {
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

  if (!hasAnyRole(profile.role, ["logistics", "admin", "head", "hub_worker"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: pickingCells, error: cellsError } = await supabaseAdmin
    .from("warehouse_cells_map")
    .select("id, code, cell_type, meta, is_active")
    .eq("warehouse_id", profile.warehouse_id)
    .eq("cell_type", "picking")
    .eq("is_active", true);
  if (cellsError) {
    return NextResponse.json({ error: cellsError.message }, { status: 400 });
  }
  const pickingCellRows = Array.isArray(pickingCells) ? pickingCells : [];
  const pickingCellIds = pickingCellRows.map((c: any) => c?.id).filter(Boolean);
  const cellById = new Map<string, any>(pickingCellRows.map((c: any) => [c.id, c]));

  let physicalUnits: any[] = [];
  if (pickingCellIds.length > 0) {
    const { data: rows, error: unitsError } = await supabaseAdmin
      .from("units")
      .select("id, barcode, status, cell_id, created_at")
      .eq("warehouse_id", profile.warehouse_id)
      .in("cell_id", pickingCellIds)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (unitsError) {
      return NextResponse.json({ error: unitsError.message }, { status: 400 });
    }
    physicalUnits = (rows || []).map((u: any) => ({
      id: u.id,
      barcode: u.barcode ?? "",
      status: u.status ?? "",
      cell_id: u.cell_id ?? null,
      created_at: u.created_at,
      scenario: null,
      cell: u.cell_id ? (() => {
        const c = cellById.get(u.cell_id);
        return c ? { id: c.id, code: c.code, cell_type: c.cell_type, meta: c.meta ?? null } : null;
      })() : null,
    }));
  }

  return NextResponse.json({
    ok: true,
    units: physicalUnits,
  });
}
