import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasAnyRole } from "@/app/api/_shared/role-access";

const HUB_PICKING_CELL_CODE = "shirvanhub-1";
const HUB_WAREHOUSE_ID = "b48c495b-62db-42f5-8968-07e4fab80a82";

/**
 * POST /api/logistics/ship-out
 * Ships a unit from picking to OUT status
 * Body: { unitId: string, courierUserId?: string, courierName?: string }
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
  if (!hasAnyRole(profile.role, ["logistics", "admin", "head", "hub_worker"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { unitId, courierUserId, courierName, transferToWarehouseId } = body ?? {};

  if (!unitId || (!courierUserId && !courierName)) {
    return NextResponse.json(
      { error: "unitId and courierName are required" },
      { status: 400 }
    );
  }

  let selectedCourierUserId: string | null = null;
  let selectedCourierName = (courierName || "").toString().trim();

  if (courierUserId) {
    const requestedCourierUserId = courierUserId.toString().trim();
    const { data: courierProfile, error: courierError } = await supabaseAdmin
      .from("profiles")
      .select("id, warehouse_id, role, full_name")
      .eq("id", requestedCourierUserId)
      .single();

    if (courierError || !courierProfile) {
      return NextResponse.json({ error: "Courier not found" }, { status: 404 });
    }
    if (courierProfile.warehouse_id !== profile.warehouse_id) {
      return NextResponse.json({ error: "Courier is not in this warehouse" }, { status: 400 });
    }
    if (!hasAnyRole(courierProfile.role, ["courier"])) {
      return NextResponse.json({ error: "Selected user is not a courier" }, { status: 400 });
    }

    selectedCourierUserId = courierProfile.id;
    selectedCourierName = (courierProfile.full_name || "").trim() || selectedCourierName;
  }

  if (!selectedCourierName) {
    return NextResponse.json({ error: "Courier name is required" }, { status: 400 });
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
    p_courier_name: selectedCourierName,
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
        p_courier_name: selectedCourierName,
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

  if (parsedResult?.shipment_id) {
    const { data: updatedShipment, error: shipmentUpdateError } = await supabaseAdmin
      .from("outbound_shipments")
      .update({
        courier_user_id: selectedCourierUserId,
        courier_name: selectedCourierName,
      })
      .eq("id", parsedResult.shipment_id)
      .eq("warehouse_id", profile.warehouse_id)
      .select("id, unit_id, zone_id")
      .maybeSingle();
    if (shipmentUpdateError) {
      console.error("[ship-out] update outbound shipment courier failed:", shipmentUpdateError);
    }

    const { data: poolRows } = await supabaseAdmin
      .from("courier_task_pool")
      .select("id, unit_id, zone_id, status, meta")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("source_shipment_id", parsedResult.shipment_id)
      .eq("status", "available");

    for (const row of poolRows || []) {
      const baseMeta = row.meta && typeof row.meta === "object" ? row.meta : {};
      const mergedMeta = {
        ...baseMeta,
        assigned_courier_user_id: selectedCourierUserId,
        assigned_courier_name: selectedCourierName,
        assigned_by: userData.user.id,
        assigned_via: "logistics",
      };
      await supabaseAdmin
        .from("courier_task_pool")
        .update({
          meta: mergedMeta,
          ...(selectedCourierUserId
            ? { status: "claimed", claim_note: "Assigned by logistics" }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }

    if (selectedCourierUserId) {
      const now = new Date().toISOString();
      const { data: openShift } = await supabaseAdmin
        .from("courier_shifts")
        .select("id")
        .eq("warehouse_id", profile.warehouse_id)
        .eq("courier_user_id", selectedCourierUserId)
        .in("status", ["open", "closing"])
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const poolRow = (poolRows || [])[0];
      const shipmentUnitId = updatedShipment?.unit_id || unitId;
      const shipmentZoneId = updatedShipment?.zone_id || poolRow?.zone_id || null;

      const { data: existingTask } = await supabaseAdmin
        .from("courier_tasks")
        .select("id, courier_user_id, status")
        .eq("warehouse_id", profile.warehouse_id)
        .eq("unit_id", shipmentUnitId)
        .not("status", "in", "(delivered,failed,returned,canceled)")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let ensuredTaskId: string | null = null;
      if (existingTask) {
        ensuredTaskId = existingTask.id;
        const { error: updateTaskError } = await supabaseAdmin
          .from("courier_tasks")
          .update({
            courier_user_id: selectedCourierUserId,
            shift_id: openShift?.id ?? null,
            status: "claimed",
            claimed_at: now,
            last_event_at: now,
            updated_at: now,
            meta: {
              source: "api.logistics.ship_out",
              assigned_by: userData.user.id,
              assigned_via: "logistics",
              assigned_courier_name: selectedCourierName,
            },
          })
          .eq("id", existingTask.id);
        if (updateTaskError) {
          console.error("[ship-out] update courier task failed:", updateTaskError);
        }
      } else {
        const { data: insertedTask, error: insertTaskError } = await supabaseAdmin
          .from("courier_tasks")
          .insert({
            warehouse_id: profile.warehouse_id,
            pool_id: poolRow?.id ?? null,
            shift_id: openShift?.id ?? null,
            unit_id: shipmentUnitId,
            courier_user_id: selectedCourierUserId,
            zone_id: shipmentZoneId,
            status: "claimed",
            claimed_at: now,
            last_event_at: now,
            meta: {
              source: "api.logistics.ship_out",
              assigned_by: userData.user.id,
              assigned_via: "logistics",
              assigned_courier_name: selectedCourierName,
            },
          })
          .select("id")
          .single();
        if (insertTaskError) {
          console.error("[ship-out] create courier task failed:", insertTaskError);
        } else {
          ensuredTaskId = insertedTask.id;
        }
      }

      if (ensuredTaskId) {
        await supabaseAdmin.from("courier_task_events").insert({
          warehouse_id: profile.warehouse_id,
          task_id: ensuredTaskId,
          unit_id: shipmentUnitId,
          courier_user_id: selectedCourierUserId,
          shift_id: openShift?.id ?? null,
          event_id: `assigned-${ensuredTaskId}-${Date.now()}`,
          event_type: "claimed",
          happened_at: now,
          note: "Assigned by logistics",
          proof_meta: {},
          meta: { source: "api.logistics.ship_out" },
        });
      }
    }
  }

  // Автозавершение задачи на отгрузку при ship-out: задача не остаётся in_progress и не падает в ТСД после возврата заказа
  try {
    const { data: unitsInTasks } = await supabaseAdmin
      .from("picking_task_units")
      .select("picking_task_id")
      .eq("unit_id", unitId);
    let taskIdsToComplete = (unitsInTasks ?? []).map((r: { picking_task_id: string }) => r.picking_task_id).filter(Boolean);
    // Legacy: задачи с unit_id на picking_tasks (без строки в picking_task_units)
    const { data: legacyTasks } = await supabaseAdmin
      .from("picking_tasks")
      .select("id")
      .eq("unit_id", unitId)
      .eq("warehouse_id", profile.warehouse_id)
      .in("status", ["open", "in_progress"]);
    const legacyIds = (legacyTasks ?? []).map((t: { id: string }) => t.id).filter(Boolean);
    taskIdsToComplete = [...new Set([...taskIdsToComplete, ...legacyIds])];
    if (taskIdsToComplete.length > 0) {
      const { data: tasksToComplete, error: tasksErr } = await supabaseAdmin
        .from("picking_tasks")
        .select("id, status, warehouse_id")
        .in("id", taskIdsToComplete)
        .eq("warehouse_id", profile.warehouse_id)
        .in("status", ["open", "in_progress"]);
      for (const t of tasksToComplete ?? []) {
        const { error: updateErr } = await supabaseAdmin
          .from("picking_tasks")
          .update({
            status: "done",
            completed_at: new Date().toISOString(),
            completed_by: userData.user.id,
          })
          .eq("id", t.id);
        if (updateErr) {
          console.error("[ship-out] auto-complete task failed:", t.id, updateErr);
          continue;
        }
        await supabase.rpc("audit_log_event", {
          p_action: "picking_task_complete",
          p_entity_type: "picking_task",
          p_entity_id: t.id,
          p_summary: `Задача завершена при отгрузке (ship out): заказ ${parsedResult?.unit_barcode ?? unitId} отправлен курьером ${selectedCourierName}`,
          p_meta: {
            source: "logistics.ship_out",
            unit_id: unitId,
            courier_name: selectedCourierName,
            courier_user_id: selectedCourierUserId,
          },
        });
      }
    }
  } catch (e) {
    console.error("[ship-out] auto-complete picking tasks (non-blocking):", e);
  }

  // Auto-set OPS status to "in_progress" on every ship-out
  const { data: currentUnit } = await supabaseAdmin
    .from("units")
    .select("id, barcode, meta")
    .eq("id", unitId)
    .eq("warehouse_id", profile.warehouse_id)
    .single();

  if (currentUnit) {
    const comment = `Авто: отправлен в OUT, курьер ${selectedCourierName}`;
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
          old_status: currentUnit.meta?.ops_status ?? null,
          new_status: "in_progress",
          old_status_text: currentUnit.meta?.ops_status ?? "не назначен",
          new_status_text: "В работе",
          comment,
          old_comment: currentUnit.meta?.ops_status_comment ?? null,
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
    courier_name: selectedCourierName,
    ...(selectedCourierUserId ? { courier_user_id: selectedCourierUserId } : {}),
    ...(scenario ? { scenario } : {}),
  };

  const { error: auditError } = await supabase.rpc("audit_log_event", {
    p_action: "logistics.ship_out",
    p_entity_type: "unit",
    p_entity_id: unitId,
    p_summary: `Отправлен заказ ${parsedResult.unit_barcode} курьером ${selectedCourierName}${scenario ? ` (${scenario})` : ""}`,
    p_meta: auditMeta,
  });

  return NextResponse.json({
    ok: true,
    shipment: parsedResult,
  });
}
