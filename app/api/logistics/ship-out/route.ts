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

  // Fetch picking task scenario for this unit (if exists)
  // Check both new format (picking_task_units) and legacy (unit_id)
  const { data: taskUnits } = await supabaseAdmin
    .from("picking_task_units")
    .select("picking_task_id")
    .eq("unit_id", unitId)
    .order("picking_task_id", { ascending: false })
    .limit(1);

  let scenario: string | null = null;
  if (taskUnits && taskUnits.length > 0) {
    const taskId = taskUnits[0].picking_task_id;
    const { data: task } = await supabaseAdmin
      .from("picking_tasks")
      .select("scenario")
      .eq("id", taskId)
      .single();

    scenario = task?.scenario || null;
  } else {
    // Check legacy format (unit_id directly in picking_tasks)
    const { data: legacyTask } = await supabaseAdmin
      .from("picking_tasks")
      .select("scenario")
      .eq("unit_id", unitId)
      .not("unit_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    scenario = legacyTask?.scenario || null;
  }

  // Audit log
  await supabase.rpc("audit_log_event", {
    p_action: "logistics.ship_out",
    p_entity_type: "unit",
    p_entity_id: unitId,
    p_summary: `Отправлен заказ ${parsedResult.unit_barcode} курьером ${courierName}${scenario ? ` (${scenario})` : ""}`,
    p_meta: {
      shipment_id: parsedResult.shipment_id,
      unit_barcode: parsedResult.unit_barcode,
      courier_name: courierName,
      ...(scenario ? { scenario } : {}),
    },
  });

  return NextResponse.json({
    ok: true,
    shipment: parsedResult,
  });
}
