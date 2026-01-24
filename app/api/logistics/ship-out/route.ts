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

  // Fetch picking task scenario for this unit BEFORE shipping (to ensure task still exists)
  // Check both new format (picking_task_units) and legacy (unit_id)
  const { data: taskUnits, error: taskUnitsError } = await supabaseAdmin
    .from("picking_task_units")
    .select("picking_task_id")
    .eq("unit_id", unitId)
    .order("picking_task_id", { ascending: false })
    .limit(1);

  let scenario: string | null = null;
  
  // Try new format first (picking_task_units)
  if (taskUnits && taskUnits.length > 0) {
    const taskId = taskUnits[0].picking_task_id;
    const { data: task, error: taskError } = await supabaseAdmin
      .from("picking_tasks")
      .select("scenario, warehouse_id")
      .eq("id", taskId)
      .single();

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

    if (legacyTask?.scenario && legacyTask.scenario.trim().length > 0) {
      scenario = legacyTask.scenario.trim();
    }
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

  // Auto-set OPS status to "in_progress" only if not set yet
  const { data: currentUnit } = await supabaseAdmin
    .from("units")
    .select("id, barcode, meta")
    .eq("id", unitId)
    .eq("warehouse_id", profile.warehouse_id)
    .single();

  if (currentUnit && !currentUnit.meta?.ops_status) {
    const comment = `Авто: отправлен в OUT, курьер ${courierName}`;
    const updatedMeta = {
      ...(currentUnit.meta || {}),
      ops_status: "in_progress",
      ops_status_comment: comment,
    };

    const { error: updateOpsError } = await supabaseAdmin
      .from("units")
      .update({ meta: updatedMeta })
      .eq("id", unitId)
      .eq("warehouse_id", profile.warehouse_id);

    if (!updateOpsError) {
      await supabase.rpc("audit_log_event", {
        p_action: "ops.unit_status_update",
        p_entity_type: "unit",
        p_entity_id: unitId,
        p_summary: `OPS статус изменён: не назначен → В работе | Комментарий: ${comment}`,
        p_meta: {
          old_status: null,
          new_status: "in_progress",
          old_status_text: "не назначен",
          new_status_text: "В работе",
          comment,
          old_comment: null,
          actor_role: profile.role,
          unit_barcode: currentUnit.barcode,
          source: "logistics.ship_out",
        },
      });
    }
  }

  // Audit log
  const auditMeta = {
    shipment_id: parsedResult.shipment_id,
    unit_barcode: parsedResult.unit_barcode,
    courier_name: courierName,
    ...(scenario ? { scenario } : {}),
  };

  const { error: auditError } = await supabase.rpc("audit_log_event", {
    p_action: "logistics.ship_out",
    p_entity_type: "unit",
    p_entity_id: unitId,
    p_summary: `Отправлен заказ ${parsedResult.unit_barcode} курьером ${courierName}${scenario ? ` (${scenario})` : ""}`,
    p_meta: auditMeta,
  });

  return NextResponse.json({
    ok: true,
    shipment: parsedResult,
  });
}
