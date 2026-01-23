import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

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

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/logistics/ship-out/route.ts:34',message:'Before fetching scenario (BEFORE ship_unit_out)',data:{unitId,courierName,warehouseId:profile.warehouse_id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  // Fetch picking task scenario for this unit BEFORE shipping (to ensure task still exists)
  // Check both new format (picking_task_units) and legacy (unit_id)
  const { data: taskUnits, error: taskUnitsError } = await supabaseAdmin
    .from("picking_task_units")
    .select("picking_task_id")
    .eq("unit_id", unitId)
    .order("picking_task_id", { ascending: false })
    .limit(1);

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/logistics/ship-out/route.ts:42',message:'After querying picking_task_units',data:{hasError:!!taskUnitsError,error:taskUnitsError?.message,foundCount:taskUnits?.length||0,taskIds:taskUnits?.map(tu=>tu.picking_task_id)||[]},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  let scenario: string | null = null;
  
  // Try new format first (picking_task_units)
  if (taskUnits && taskUnits.length > 0) {
    const taskId = taskUnits[0].picking_task_id;
    const { data: task, error: taskError } = await supabaseAdmin
      .from("picking_tasks")
      .select("scenario, warehouse_id")
      .eq("id", taskId)
      .single();

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/logistics/ship-out/route.ts:63',message:'After fetching picking task (new format)',data:{taskId,hasError:!!taskError,error:taskError?.message,foundTask:!!task,taskWarehouseId:task?.warehouse_id,userWarehouseId:profile.warehouse_id,warehouseMatch:task?.warehouse_id===profile.warehouse_id,scenario:task?.scenario||null,hasScenario:!!task?.scenario},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    // Only use scenario if warehouse matches and scenario exists (not null/empty)
    if (task && task.warehouse_id === profile.warehouse_id && task.scenario && task.scenario.trim().length > 0) {
      scenario = task.scenario.trim();
    }
  }
  
  // If scenario not found via new format, try legacy format
  if (!scenario) {
    const { data: legacyTask, error: legacyTaskError } = await supabaseAdmin
      .from("picking_tasks")
      .select("scenario, warehouse_id")
      .eq("unit_id", unitId)
      .not("unit_id", "is", null)
      .eq("warehouse_id", profile.warehouse_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/logistics/ship-out/route.ts:79',message:'After checking legacy picking_tasks',data:{hasError:!!legacyTaskError,error:legacyTaskError?.message,foundLegacyTask:!!legacyTask,scenario:legacyTask?.scenario||null,hasScenario:!!legacyTask?.scenario},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

    if (legacyTask?.scenario && legacyTask.scenario.trim().length > 0) {
      scenario = legacyTask.scenario.trim();
    }
  }

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/logistics/ship-out/route.ts:73',message:'Final scenario before ship_unit_out',data:{unitId,scenario,hasScenario:!!scenario},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
  // #endregion

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

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/logistics/ship-out/route.ts:95',message:'Before audit log',data:{unitId,unitBarcode:parsedResult.unit_barcode,courierName,scenario,hasScenario:!!scenario,willIncludeInMeta:!!scenario},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
  // #endregion

  // Audit log
  const auditMeta = {
    shipment_id: parsedResult.shipment_id,
    unit_barcode: parsedResult.unit_barcode,
    courier_name: courierName,
    ...(scenario ? { scenario } : {}),
  };

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/logistics/ship-out/route.ts:103',message:'Audit meta before RPC call',data:{auditMeta,hasScenarioInMeta:!!auditMeta.scenario},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
  // #endregion

  const { error: auditError } = await supabase.rpc("audit_log_event", {
    p_action: "logistics.ship_out",
    p_entity_type: "unit",
    p_entity_id: unitId,
    p_summary: `Отправлен заказ ${parsedResult.unit_barcode} курьером ${courierName}${scenario ? ` (${scenario})` : ""}`,
    p_meta: auditMeta,
  });

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/logistics/ship-out/route.ts:115',message:'After audit log RPC',data:{hasError:!!auditError,error:auditError?.message,scenarioLogged:!!scenario},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
  // #endregion

  return NextResponse.json({
    ok: true,
    shipment: parsedResult,
  });
}
