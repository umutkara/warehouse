import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/logistics/picking-units
 * Returns all units currently in picking cells for logistics role
 */
export async function GET(req: Request) {
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

  // Only logistics, admin, head can access
  if (!["logistics", "admin", "head"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'picking-units/route.ts:33',message:'Before units query',data:{warehouseId:profile.warehouse_id,role:profile.role},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'FIX'})}).catch(()=>{});
  // #endregion

  // Get all units in picking cells (use admin to bypass RLS)
  const { data: units, error: unitsError } = await supabaseAdmin
    .from("units")
    .select(`
      id,
      barcode,
      status,
      cell_id,
      created_at
    `)
    .eq("warehouse_id", profile.warehouse_id)
    .eq("status", "picking")
    .order("created_at", { ascending: false });

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'picking-units/route.ts:50',message:'After units query',data:{hasError:!!unitsError,errorMsg:unitsError?.message,unitsCount:units?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'FIX'})}).catch(()=>{});
  // #endregion

  if (unitsError) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'picking-units/route.ts:55',message:'Units query error',data:{error:unitsError.message,code:unitsError.code},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'FIX'})}).catch(()=>{});
    // #endregion
    return NextResponse.json({ error: unitsError.message }, { status: 400 });
  }

  // Get cell info for each unit
  const cellIds = [...new Set(units?.map(u => u.cell_id).filter(Boolean))];
  const { data: cells } = await supabaseAdmin
    .from("warehouse_cells_map")
    .select("id, code, cell_type")
    .in("id", cellIds);

  const cellsMap = new Map(cells?.map(c => [c.id, c]) || []);

  // Get picking_tasks info to show scenario (read-only for logistics)
  const unitIds = units?.map(u => u.id) || [];
  const { data: tasks } = await supabaseAdmin
    .from("picking_tasks")
    .select("unit_id, scenario")
    .in("unit_id", unitIds)
    .eq("status", "done"); // Only show completed tasks (unit already in picking)

  const tasksMap = new Map(tasks?.map(t => [t.unit_id, t]) || []);

  // Enrich units with cell and scenario info
  const enrichedUnits = (units || []).map(u => ({
    ...u,
    cell: cellsMap.get(u.cell_id) || null,
    scenario: tasksMap.get(u.id)?.scenario || null,
  }));

  return NextResponse.json({
    ok: true,
    units: enrichedUnits,
  });
}
