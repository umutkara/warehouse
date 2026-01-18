import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function normalizeCellCode(v: any): string {
  return String(v ?? "").trim().toUpperCase();
}

function normalizeBarcode(v: any): string {
  return String(v ?? "").replace(/\D/g, "");
}

/**
 * POST /api/tsd/shipping-tasks/complete
 * Completes a picking task by moving unit to picking cell
 * Body: { taskId: string, fromCellCode: string, toCellCode: string, unitBarcode: string }
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

  // Check role: worker + ops + admin/head/manager can complete
  if (!["worker", "ops", "admin", "head", "manager"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const taskId = body.taskId;
  const fromCellCode = normalizeCellCode(body.fromCellCode);
  const toCellCode = normalizeCellCode(body.toCellCode);
  const unitBarcode = normalizeBarcode(body.unitBarcode);

  if (!taskId || !fromCellCode || !toCellCode || !unitBarcode) {
    return NextResponse.json(
      { error: "taskId, fromCellCode, toCellCode, and unitBarcode are required" },
      { status: 400 }
    );
  }

  // Get task with unit (use admin to bypass RLS)
  const { data: task, error: taskError } = await supabaseAdmin
    .from("picking_tasks")
    .select(`
      id,
      status,
      warehouse_id,
      unit_id,
      target_picking_cell_id,
      units!inner (
        id,
        barcode,
        cell_id,
        warehouse_id
      )
    `)
    .eq("id", taskId)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Verify task belongs to warehouse
  if (task.warehouse_id !== profile.warehouse_id) {
    return NextResponse.json({ error: "Task belongs to different warehouse" }, { status: 403 });
  }

  // Verify task is not already done
  if (task.status === "done") {
    return NextResponse.json({ error: "Задача уже выполнена" }, { status: 400 });
  }

  if (task.status === "canceled") {
    return NextResponse.json({ error: "Задача отменена" }, { status: 400 });
  }

  // Update task to in_progress if it was open (use admin to bypass RLS)
  const updateToInProgress = task.status === "open";
  if (updateToInProgress) {
    const { error: inProgressError } = await supabaseAdmin
      .from("picking_tasks")
      .update({
        status: "in_progress",
        picked_by: userData.user.id,
        picked_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    if (inProgressError) {
      console.error("Failed to update task to in_progress:", inProgressError);
      // Continue anyway - task update is not critical at this point
    }
  }

  // Handle units - can be array or object depending on Supabase type inference
  const unit = Array.isArray(task.units) ? task.units[0] : task.units;
  if (!unit || !unit.barcode) {
    return NextResponse.json({ error: "Unit not found in task" }, { status: 404 });
  }

  // Verify unit barcode matches
  if (unit.barcode !== unitBarcode) {
    return NextResponse.json(
      { error: `Unit barcode mismatch. Expected: ${unit.barcode}, got: ${unitBarcode}` },
      { status: 400 }
    );
  }

  // Get target picking cell separately (use admin to bypass RLS)
  const { data: targetCell, error: targetCellError } = await supabaseAdmin
    .from("warehouse_cells_map")
    .select("id, code, cell_type, warehouse_id")
    .eq("id", task.target_picking_cell_id)
    .single();

  if (targetCellError || !targetCell) {
    return NextResponse.json({ error: "Target picking cell not found" }, { status: 404 });
  }

  // Verify toCellCode matches target picking cell
  if (targetCell.code !== toCellCode) {
    return NextResponse.json(
      { error: `Target cell mismatch. Expected: ${targetCell.code}, got: ${toCellCode}` },
      { status: 400 }
    );
  }

  // Get from cell (use admin to bypass RLS)
  const { data: fromCell, error: fromCellError } = await supabaseAdmin
    .from("warehouse_cells_map")
    .select("id, code, cell_type, warehouse_id")
    .eq("warehouse_id", profile.warehouse_id)
    .eq("code", fromCellCode)
    .single();

  if (fromCellError || !fromCell) {
    return NextResponse.json({ error: `FROM cell "${fromCellCode}" not found` }, { status: 404 });
  }

  // Verify unit is in FROM cell
  if (unit.cell_id !== fromCell.id) {
    return NextResponse.json(
      { error: `Unit is not in cell "${fromCellCode}". Current cell does not match.` },
      { status: 400 }
    );
  }

  // Verify allowed move: storage/shipping -> picking OK, bin -> picking forbidden
  const allowedMoves: Record<string, string[]> = {
    storage: ["picking"],
    shipping: ["picking"],
  };

  if (!allowedMoves[fromCell.cell_type]?.includes("picking")) {
    return NextResponse.json(
      { error: `Move from "${fromCell.cell_type}" to "picking" is not allowed. Only storage/shipping -> picking allowed.` },
      { status: 400 }
    );
  }

  // Move unit to picking cell using RPC
  const { data: rpcResult, error: rpcError } = await supabase.rpc("move_unit_to_cell", {
    p_unit_id: unit.id,
    p_to_cell_id: targetCell.id,
    p_to_status: "picking",
  });

  if (rpcError) {
    // Check for inventory active
    if (rpcError.message && rpcError.message.includes("INVENTORY_ACTIVE")) {
      // Task was updated to in_progress, but move failed - rollback status if needed
      if (updateToInProgress) {
        await supabaseAdmin
          .from("picking_tasks")
          .update({
            status: "open",
            picked_by: null,
            picked_at: null,
          })
          .eq("id", taskId);
      }
      return NextResponse.json(
        { error: "Инвентаризация активна. Перемещения заблокированы." },
        { status: 423 }
      );
    }
    // Rollback in_progress status if move failed
    if (updateToInProgress) {
      await supabaseAdmin
        .from("picking_tasks")
        .update({
          status: "open",
          picked_by: null,
          picked_at: null,
        })
        .eq("id", taskId);
    }
    return NextResponse.json({ error: rpcError.message || "Перемещение не удалось" }, { status: 500 });
  }

  const result = typeof rpcResult === "string" ? JSON.parse(rpcResult) : rpcResult;
  
  if (!result?.ok) {
    // Rollback in_progress status if move failed
    if (updateToInProgress) {
      await supabaseAdmin
        .from("picking_tasks")
        .update({
          status: "open",
          picked_by: null,
          picked_at: null,
        })
        .eq("id", taskId);
    }
    return NextResponse.json({ error: result?.error || "Перемещение не удалось" }, { status: 400 });
  }

  // Update task to done (use admin to bypass RLS)
  const { error: updateError } = await supabaseAdmin
    .from("picking_tasks")
    .update({
      status: "done",
      completed_by: userData.user.id,
      completed_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  if (updateError) {
    // Unit moved but task update failed - log but return success
    console.error("Task update failed after successful move:", updateError);
    return NextResponse.json({
      ok: true,
      warning: "Unit moved successfully but task status update failed",
      unit: { id: unit.id, barcode: unit.barcode },
      targetCell: { id: targetCell.id, code: targetCell.code },
    });
  }

  // Audit logging: archive task completion
  const { error: auditError } = await supabase.rpc("audit_log_event", {
    p_action: "picking_task_complete",
    p_entity_type: "picking_task",
    p_entity_id: taskId,
    p_summary: `Завершена задача отгрузки: ${unit.barcode} → ${targetCell.code}`,
    p_meta: {
      task_id: taskId,
      unit_id: unit.id,
      unit_barcode: unit.barcode,
      from_cell_code: fromCellCode,
      from_cell_type: fromCell.cell_type,
      to_cell_code: targetCell.code,
      to_cell_type: targetCell.cell_type,
      to_status: "picking",
    },
  });

  if (auditError) {
    console.error("Audit log error:", auditError);
    // Don't fail the request if audit logging fails
  }

  return NextResponse.json({
    ok: true,
    task: {
      id: taskId,
      status: "done",
    },
    unit: {
      id: unit.id,
      barcode: unit.barcode,
      cell_id: targetCell.id,
      status: "picking",
    },
    targetCell: {
      id: targetCell.id,
      code: targetCell.code,
      cell_type: targetCell.cell_type,
    },
  });
}
