import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const HUB_PICKING_CELL_CODE = "shirvanhub-1";
const HUB_WAREHOUSE_ID = "b48c495b-62db-42f5-8968-07e4fab80a82";

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

  // Only logistics, admin, head, hub worker can ship
  if (!["logistics", "admin", "head", "hub_worker"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { unitId, courierName, transferToWarehouseId } = body ?? {};

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
  let targetPickingCellId: string | null = null;
  
  // Try new format first (picking_task_units)
  if (taskUnits && taskUnits.length > 0) {
    const taskId = taskUnits[0].picking_task_id;
    const { data: task, error: taskError } = await supabaseAdmin
      .from("picking_tasks")
      .select("scenario, warehouse_id, target_picking_cell_id")
      .eq("id", taskId)
      .single();

    // Only use scenario if warehouse matches and scenario exists (not null/empty)
    if (task && task.warehouse_id === profile.warehouse_id) {
      if (task.scenario && task.scenario.trim().length > 0) {
        scenario = task.scenario.trim();
      }
      if (task.target_picking_cell_id) {
        targetPickingCellId = task.target_picking_cell_id;
      }
    }
  }
  
  // If scenario or target cell not found via new format, try legacy format
  if (!scenario || !targetPickingCellId) {
    const { data: legacyTask, error: legacyTaskError } = await supabaseAdmin
      .from("picking_tasks")
      .select("scenario, warehouse_id, target_picking_cell_id")
      .eq("unit_id", unitId)
      .not("unit_id", "is", null)
      .eq("warehouse_id", profile.warehouse_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (legacyTask?.scenario && legacyTask.scenario.trim().length > 0) {
      scenario = legacyTask.scenario.trim();
    }
    if (legacyTask?.target_picking_cell_id) {
      targetPickingCellId = legacyTask.target_picking_cell_id;
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

  let parsedResult = typeof result === "string" ? JSON.parse(result) : result;

  if (!parsedResult?.ok) {
    const forbidden = typeof parsedResult?.error === "string" && parsedResult.error.includes("Forbidden");
    if (forbidden && profile.role === "hub_worker") {
      const { data: adminResult, error: adminError } = await supabaseAdmin.rpc("ship_unit_out", {
        p_unit_id: unitId,
        p_courier_name: courierName.trim(),
      });

      if (adminError) {
        return NextResponse.json({ error: adminError.message }, { status: 500 });
      }

      const parsedAdminResult = typeof adminResult === "string" ? JSON.parse(adminResult) : adminResult;
      if (!parsedAdminResult?.ok) {
        return NextResponse.json(
          { error: parsedAdminResult?.error || "Failed to ship unit" },
          { status: 400 }
        );
      }

      // Use admin result for subsequent flow
      parsedResult = parsedAdminResult;
    } else {
      return NextResponse.json(
        { error: parsedResult?.error || "Failed to ship unit" },
        { status: 400 }
      );
    }
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

  // If shipped from hub picking cell, create transfer record for hub buffer
  try {
    if (targetPickingCellId) {
      const { data: targetCell } = await supabaseAdmin
        .from("warehouse_cells")
        .select("id, code, warehouse_id")
        .eq("id", targetPickingCellId)
        .maybeSingle();

      const codeMatches =
        targetCell?.code?.toLowerCase?.() === HUB_PICKING_CELL_CODE.toLowerCase();

      if (targetCell && targetCell.warehouse_id === profile.warehouse_id && codeMatches) {
        const { data: existingTransfer } = await supabaseAdmin
          .from("transfers")
          .select("id")
          .eq("unit_id", unitId)
          .eq("status", "in_transit")
          .maybeSingle();

        if (!existingTransfer) {
          const transferMeta = {
            source: "logistics.ship_out",
            picking_cell_code: HUB_PICKING_CELL_CODE,
            scenario: scenario ?? null,
          };

          const { error: hubTransferError } = await supabaseAdmin
            .from("transfers")
            .insert({
              unit_id: unitId,
              from_warehouse_id: profile.warehouse_id,
              to_warehouse_id: HUB_WAREHOUSE_ID,
              status: "in_transit",
              meta: transferMeta,
            });

        }
      }
    }
  } catch (e) {
    console.error("Transfer creation failed (non-blocking):", e);
  }

  // Optional: create transfer when destination warehouse is explicitly provided
  try {
    if (transferToWarehouseId && transferToWarehouseId !== profile.warehouse_id) {
      const { data: existingTransfer } = await supabaseAdmin
        .from("transfers")
        .select("id")
        .eq("unit_id", unitId)
        .eq("status", "in_transit")
        .maybeSingle();

      if (!existingTransfer) {
        const transferMeta = {
          source: "logistics.ship_out",
          scenario: scenario ?? null,
          note: "explicit_transfer",
        };

        const { error: explicitTransferError } = await supabaseAdmin
          .from("transfers")
          .insert({
            unit_id: unitId,
            from_warehouse_id: profile.warehouse_id,
            to_warehouse_id: transferToWarehouseId,
            status: "in_transit",
            meta: transferMeta,
          });

      }
    }
  } catch (e) {
    console.error("Explicit transfer creation failed (non-blocking):", e);
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
