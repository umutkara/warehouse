import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const allowed = new Set(["worker", "manager", "head", "admin", "hub_worker"]);

function normalizeCellCode(v: any): string {
  // Убрать "CELL:" если есть, trim, upper
  let code = String(v ?? "").trim();
  if (code.toUpperCase().startsWith("CELL:")) {
    code = code.substring(5).trim();
  }
  return code.toUpperCase();
}

function normalizeUnitBarcode(v: any): string {
  // Только цифры, trim
  return String(v ?? "").replace(/\D/g, "").trim();
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();

  try {
    // Auth check
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized", ok: false }, { status: 401 });
    }

    // Profile check
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, warehouse_id")
      .eq("id", user.id)
      .single();

    if (!profile?.role || !allowed.has(profile.role)) {
      return NextResponse.json({ error: "Forbidden", ok: false }, { status: 403 });
    }

    if (!profile.warehouse_id) {
      return NextResponse.json(
        { error: "Не найден warehouse_id у профиля", ok: false },
        { status: 400 }
      );
    }

    // Parse body
    const body = await req.json().catch(() => null);
    const cellCode = normalizeCellCode(body?.cellCode);
    const digits = normalizeUnitBarcode(body?.unitBarcode);

    // Validation
    if (!digits) {
      return NextResponse.json({ error: "unitBarcode is required", ok: false }, { status: 400 });
    }

    if (!cellCode) {
      return NextResponse.json({ error: "cellCode is required", ok: false }, { status: 400 });
    }

    // Load cell через view (обходит проблему "stack depth limit exceeded" при запросе к warehouse_cells)
    const { data: targetCell, error: cellError } = await supabase
      .from("warehouse_cells_map")
      .select("id, code, cell_type, is_active, meta")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("code", cellCode)
      .single();

    if (cellError || !targetCell) {
      return NextResponse.json({ error: "Ячейка не найдена", ok: false }, { status: 404 });
    }

    // Check cell_type === 'bin' or 'rejected'
    if (!["bin", "rejected"].includes(targetCell.cell_type)) {
      return NextResponse.json(
        { error: "Приемка разрешена только в BIN или REJECTED ячейки", ok: false },
        { status: 400 }
      );
    }

    // Check is_active === true
    if (!targetCell.is_active) {
      return NextResponse.json(
        { error: `Ячейка "${cellCode}" не активна`, ok: false },
        { status: 400 }
      );
    }

    // Check meta.blocked !== true
    if (targetCell.meta?.blocked === true) {
      return NextResponse.json(
        { error: `Ячейка "${cellCode}" заблокирована`, ok: false },
        { status: 400 }
      );
    }

    // Auto-accept transfer if unit is in transit to this warehouse
    const { data: anyUnit, error: anyUnitError } = await supabaseAdmin
      .from("units")
      .select("id, barcode, cell_id, warehouse_id, status")
      .eq("barcode", digits)
      .maybeSingle();

    if (anyUnitError && anyUnitError.code !== "PGRST116") {
      console.error("Error loading unit for transfer check:", anyUnitError);
      return NextResponse.json({ error: "Ошибка проверки transfer", ok: false }, { status: 500 });
    }

    if (anyUnit) {
      const { data: transfer } = await supabaseAdmin
        .from("transfers")
        .select("id, unit_id, status, to_warehouse_id")
        .eq("unit_id", anyUnit.id)
        .eq("to_warehouse_id", profile.warehouse_id)
        .eq("status", "in_transit")
        .maybeSingle();

      if (transfer) {
        const newStatus = targetCell.cell_type === "rejected" ? "rejected" : "bin";

        const { error: unitUpdateError } = await supabaseAdmin
          .from("units")
          .update({
            warehouse_id: profile.warehouse_id,
            cell_id: targetCell.id,
            status: newStatus,
          })
          .eq("id", anyUnit.id);

        if (unitUpdateError) {
          return NextResponse.json({ error: unitUpdateError.message, ok: false }, { status: 400 });
        }

        try {
          await supabaseAdmin
            .from("unit_moves")
            .insert({
              warehouse_id: profile.warehouse_id,
              unit_id: anyUnit.id,
              from_cell_id: anyUnit.cell_id,
              to_cell_id: targetCell.id,
              moved_by: userData.user.id,
              source: "transfer.receive",
              created_at: new Date().toISOString(),
            });
        } catch (e) {
          console.error("Failed to insert unit_moves (non-blocking):", e);
        }

        const { error: transferUpdateError } = await supabaseAdmin
          .from("transfers")
          .update({ status: "received", received_at: new Date().toISOString() })
          .eq("id", transfer.id);

        if (transferUpdateError) {
          console.error("Failed to update transfer status:", transferUpdateError);
        }

        return NextResponse.json({
          ok: true,
          unitId: anyUnit.id,
          barcode: digits,
          cell: { id: targetCell.id, code: targetCell.code, cell_type: targetCell.cell_type },
          status: newStatus,
          message: `Принято по transfer в ${targetCell.code}`,
        });
      }
    }

    // Check if unit exists
    const { data: existingUnit, error: unitCheckError } = await supabase
      .from("units")
      .select("id, barcode, cell_id, status")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("barcode", digits)
      .maybeSingle();

    if (unitCheckError && unitCheckError.code !== "PGRST116") {
      // PGRST116 = not found, это нормально
      console.error("Error checking unit:", unitCheckError);
      return NextResponse.json(
        { error: "Ошибка проверки unit", ok: false },
        { status: 500 }
      );
    }

    // SCENARIO B: unit найден и уже в этой ячейке
    if (existingUnit && existingUnit.cell_id === targetCell.id) {
      return NextResponse.json({
        ok: true,
        unitId: existingUnit.id,
        barcode: digits,
        cell: { id: targetCell.id, code: targetCell.code, cell_type: targetCell.cell_type },
        status: existingUnit.status,
        message: `Уже в этой ячейке (${targetCell.code})`,
      });
    }

    // SCENARIO C: unit найден и уже размещён в другой ячейке
    if (existingUnit && existingUnit.cell_id !== null && existingUnit.cell_id !== targetCell.id) {
      return NextResponse.json(
        {
          error:
            "Unit уже размещен в другой ячейке. Для перемещения используйте режим Перемещение.",
          ok: false,
        },
        { status: 400 }
      );
    }

    let unitId: string;

    // SCENARIO A: unit НЕ найден - создаём новый
    const targetStatus = targetCell.cell_type === "rejected" ? "rejected" : "receiving";
    if (!existingUnit) {
      // Создаём unit через admin client (обходит проблему "stack depth limit exceeded" при прямом insert из-за RLS)
      // Admin client использует service role key и обходит RLS политики
      const { data: createdUnit, error: createError } = await supabaseAdmin
        .from("units")
        .insert({
          barcode: digits,
          warehouse_id: profile.warehouse_id,
          status: targetStatus,
        })
        .select("id, barcode, created_at, warehouse_id")
        .single();

      if (createError || !createdUnit) {
        console.error("Database error creating unit via admin:", createError);
        return NextResponse.json({ error: createError?.message || "Ошибка создания unit", ok: false }, { status: 400 });
      }

      // Audit logging for unit creation via RPC (works with regular client)
      const { error: auditError } = await supabase.rpc("audit_log_event", {
        p_action: "unit.create",
        p_entity_type: "unit",
        p_entity_id: createdUnit.id,
        p_summary: `Создание unit ${createdUnit.barcode} при приемке`,
        p_meta: {
          barcode: createdUnit.barcode,
          status: targetStatus,
          cell_code: targetCell.code,
          source: "receiving_scan",
        },
      });

      if (auditError) {
        console.error("Audit log error for unit creation:", auditError);
        // Don't fail the request if audit logging fails
      }

      unitId = createdUnit.id;
    } else {
      // SCENARIO D: unit найден, но cell_id == null
      unitId = existingUnit.id;
    }

    // Check if unit has active OUT shipment BEFORE moving (to set correct note)
    // Also check for recently returned shipments (status = "returned") to handle cases
    // where shipment was already marked as returned but merchant_rejections weren't created
    const { data: activeShipment, error: shipmentCheckError } = await supabaseAdmin
      .from("outbound_shipments")
      .select("id, status, courier_name, out_at, returned_at, return_reason")
      .eq("unit_id", unitId)
      .in("status", ["out", "returned"])
      .order("out_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (shipmentCheckError) {
      console.error("Error checking outbound_shipments:", shipmentCheckError);
      // Don't fail the request, just log the error
    }
    
    // If shipment is already "returned" but doesn't have merchant_rejections set,
    // we should still check for picking_task and create merchant_rejections if needed
    const shouldProcessReturn =
      activeShipment &&
      (activeShipment.status === "out" ||
        (activeShipment.status === "returned" &&
          (activeShipment.return_reason === "Автоматический возврат при приемке в bin" ||
            activeShipment.return_reason === "Автоматический возврат при приемке в rejected")));

    // Prepare move note and meta
    const targetCellLabel = targetCell.cell_type === "rejected" ? "REJECTED" : "BIN";
    let moveNote = `Принято в ${targetCellLabel}`;
    let moveMeta: any = { source: "tsd" };
    let returnReason = "";
    let returnAction = "";
    let returnIcon = "";
    let returnCount = 0;
    let pickingTask: any = null;

    // If active shipment exists, prepare return info
    // Also process returns that were already marked as returned but merchant_rejections weren't created
    if (shouldProcessReturn) {
      // Check if unit had a scenario from OPS (picking task)
      // After migration, units are linked via picking_task_units junction table
      // First, try new format (via picking_task_units)
      const { data: taskUnit } = await supabaseAdmin
        .from("picking_task_units")
        .select("picking_task_id")
        .eq("unit_id", unitId)
        .limit(1)
        .maybeSingle();

      let task: any = null;
      
      if (taskUnit?.picking_task_id) {
        // Get task via picking_task_units (new format)
        const { data: taskData } = await supabaseAdmin
          .from("picking_tasks")
          .select("id, scenario, created_at")
          .eq("id", taskUnit.picking_task_id)
          .not("scenario", "is", null)
          .maybeSingle();
        
        task = taskData;
      }
      
      // Also check legacy format (old tasks with direct unit_id)
      if (!task) {
        const { data: legacyTask } = await supabaseAdmin
          .from("picking_tasks")
          .select("id, scenario, created_at")
          .eq("unit_id", unitId)
          .not("scenario", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        task = legacyTask;
      }

      pickingTask = task;

      // Determine return type based on scenario keywords
      const scenarioLower = pickingTask?.scenario?.toLowerCase() || "";

      const isServiceCenterReturn =
        !!pickingTask?.scenario &&
        (scenarioLower.includes("сервис") ||
          scenarioLower.includes("ремонт") ||
          scenarioLower.includes("service"));
      
      // Fix: Only check for merchant keywords, not "not service"
      const isMerchantRejection =
        !!pickingTask?.scenario &&
        !isServiceCenterReturn &&
        (scenarioLower.includes("мерчант") ||
          scenarioLower.includes("магазин") ||
          scenarioLower.includes("merchant"));

      returnReason = `Автоматический возврат при приемке в ${targetCellLabel.toLowerCase()}`;
      returnAction = "logistics.auto_return_from_out";
      returnIcon = "↩️";

      if (isServiceCenterReturn) {
        returnReason = `Вернулся с сервисного центра (${pickingTask.scenario})`;
        returnAction = "logistics.service_center_return";
        returnIcon = "🔧";
      } else if (isMerchantRejection) {
        returnReason = `Мерчант не принял (${pickingTask.scenario})`;
        returnAction = "logistics.merchant_rejection";
        returnIcon = "🚫";
      }

      // Get current unit meta to append to existing returns
      const { data: currentUnit } = await supabaseAdmin
        .from("units")
        .select("meta")
        .eq("id", unitId)
        .single();

      const currentMeta = (currentUnit?.meta as any) || {};

      // Save to unit.meta based on return type (append to array)
      if (isServiceCenterReturn) {
        const serviceCenterReturns = currentMeta.service_center_returns || [];
        returnCount = serviceCenterReturns.length + 1;

        serviceCenterReturns.push({
          returned_at: new Date().toISOString(),
          reason: "Вернулся с сервисного центра",
          scenario: pickingTask.scenario,
          shipment_id: activeShipment.id,
          courier_name: activeShipment.courier_name,
          picking_task_id: pickingTask.id,
          return_number: returnCount,
        });

        const { error: updateMetaError } = await supabaseAdmin
          .from("units")
          .update({
            meta: {
              ...currentMeta,
              service_center_returns: serviceCenterReturns,
              service_center_return_count: returnCount,
            },
          })
          .eq("id", unitId);

        if (updateMetaError) {
          console.error("Error updating unit meta for service center return:", updateMetaError);
        }
      } else if (isMerchantRejection) {
        const merchantRejections = currentMeta.merchant_rejections || [];
        returnCount = merchantRejections.length + 1;

        merchantRejections.push({
          rejected_at: new Date().toISOString(),
          reason: "Мерчант не принял",
          scenario: pickingTask.scenario,
          shipment_id: activeShipment.id,
          courier_name: activeShipment.courier_name,
          picking_task_id: pickingTask.id,
          return_number: returnCount,
        });

        const { error: updateMetaError } = await supabaseAdmin
          .from("units")
          .update({
            meta: {
              ...currentMeta,
              merchant_rejections: merchantRejections,
              merchant_rejection_count: returnCount,
            },
          })
          .eq("id", unitId);

        if (updateMetaError) {
          console.error("Error updating unit meta for merchant rejection:", updateMetaError);
        }
      }

      // Update shipment status to 'returned' and record return info
      const { error: closeShipmentError } = await supabaseAdmin
        .from("outbound_shipments")
        .update({
          status: "returned",
          returned_by: user.id,
          returned_at: new Date().toISOString(),
          return_reason: returnReason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", activeShipment.id);

      if (closeShipmentError) {
        console.error("Error closing outbound_shipments:", closeShipmentError);
        // Don't fail the request, just log the error
      }

      // Prepare audit log summary
      let summaryText = `Автовозврат из OUT: ${digits} принят в ${targetCell.code}`;
      if (isServiceCenterReturn) {
        summaryText = `${returnIcon} Вернулся с сервисного центра (${returnCount}): ${digits} (${pickingTask.scenario})`;
        moveNote = `Возврат из OUT: Вернулся с сервисного центра (${returnCount})`;
      } else if (isMerchantRejection) {
        summaryText = `${returnIcon} Мерчант не принял (${returnCount}): ${digits} (${pickingTask.scenario})`;
        moveNote = `Возврат из OUT: Мерчант не принял (${returnCount})`;
      } else {
        moveNote = `Возврат из OUT: Автоматический возврат`;
      }

      moveMeta = {
        return_from_out: true,
        shipment_id: activeShipment.id,
        return_type: isMerchantRejection
          ? "merchant_rejection"
          : isServiceCenterReturn
          ? "service_center_return"
          : "auto_return",
        return_count: returnCount || 0,
      };

      const { error: auditError } = await supabase.rpc("audit_log_event", {
        p_action: returnAction,
        p_entity_type: "unit",
        p_entity_id: unitId,
        p_summary: summaryText,
        p_meta: {
          shipment_id: activeShipment.id,
          unit_barcode: digits,
          courier_name: activeShipment.courier_name,
          out_at: activeShipment.out_at,
          returned_to_cell: targetCell.code,
          return_reason: returnReason,
          merchant_rejection: isMerchantRejection,
          service_center_return: isServiceCenterReturn,
          scenario: pickingTask?.scenario || null,
          picking_task_id: pickingTask?.id || null,
          return_count: returnCount,
        },
      });

      if (auditError) {
        console.error("Audit log error for auto return:", auditError);
        // Don't fail the request if audit logging fails
      }
    }

    // Move unit to target cell (with appropriate note based on return status)
    const { data: rpcResult, error: rpcError } = await supabase.rpc("move_unit_to_cell", {
      p_unit_id: unitId,
      p_to_cell_id: targetCell.id,
      p_to_status: targetStatus,
      p_note: moveNote,
      p_source: "tsd",
      p_meta: moveMeta,
    });

    if (rpcError) {
      console.error("move_unit_to_cell RPC error:", rpcError);
      return NextResponse.json(
        { error: rpcError.message || "Ошибка размещения", ok: false },
        { status: 500 }
      );
    }

    const result = typeof rpcResult === "string" ? JSON.parse(rpcResult) : rpcResult;
    if (!result?.ok) {
      return NextResponse.json(
        { error: result?.error || "Ошибка размещения", ok: false },
        { status: 400 }
      );
    }

    // Success response
    return NextResponse.json({
      ok: true,
      unitId,
      barcode: digits,
      cell: { id: targetCell.id, code: targetCell.code, cell_type: targetCell.cell_type },
      status: targetStatus,
      message: `Принято в ${targetCellLabel}`,
    });
  } catch (e: any) {
    console.error("Unexpected error in receiving/scan:", e);
    return NextResponse.json({ error: "Internal server error", ok: false }, { status: 500 });
  }
}
