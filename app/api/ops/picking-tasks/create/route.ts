import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function normalizeBarcode(v: any): string {
  return String(v ?? "").replace(/\D/g, "");
}

/**
 * POST /api/ops/picking-tasks/create
 * Creates picking tasks for units to be moved to picking cells
 * Body: { unitIds?: string[], barcodes?: string[], targetPickingCellId: string, scenario?: string }
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

  // Check role: only admin/head/manager/ops can create tasks
  if (!["admin", "head", "manager", "ops"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden: Only admin/head/manager/ops can create tasks" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const unitIds = Array.isArray(body.unitIds) ? body.unitIds.filter((id: any) => id) : [];
  const barcodes = Array.isArray(body.barcodes) 
    ? body.barcodes.map(normalizeBarcode).filter((b: string) => b.length > 0)
    : [];
  const targetPickingCellId = body.targetPickingCellId;
  const scenario = body.scenario || null;

  // Need at least unitIds or barcodes
  if (unitIds.length === 0 && barcodes.length === 0) {
    return NextResponse.json({ error: "Need at least unitIds or barcodes" }, { status: 400 });
  }

  if (!targetPickingCellId) {
    return NextResponse.json({ error: "targetPickingCellId is required" }, { status: 400 });
  }

  // Verify target picking cell exists and is of type 'picking'
  const { data: targetCell, error: cellError } = await supabase
    .from("warehouse_cells_map")
    .select("id, code, cell_type, warehouse_id, is_active")
    .eq("id", targetPickingCellId)
    .single();

  if (cellError || !targetCell) {
    return NextResponse.json({ error: "Target picking cell not found" }, { status: 404 });
  }

  if (targetCell.warehouse_id !== profile.warehouse_id) {
    return NextResponse.json({ error: "Target cell belongs to different warehouse" }, { status: 403 });
  }

  if (targetCell.cell_type !== "picking") {
    return NextResponse.json(
      {
        error: "Целевая ячейка должна быть типа 'picking'",
        details: `Нет picking ячеек. Добавьте на карте склада ячейки с cell_type='picking'`,
      },
      { status: 400 }
    );
  }

  if (!targetCell.is_active) {
    return NextResponse.json({ error: "Target cell is inactive" }, { status: 400 });
  }

  // Collect all unit IDs
  const allUnitIds = new Set<string>();

  // Add unitIds directly
  unitIds.forEach((id: string) => allUnitIds.add(id));

  // Find units by barcodes
  if (barcodes.length > 0) {
    const { data: unitsByBarcode, error: unitsError } = await supabase
      .from("units")
      .select("id, barcode, warehouse_id")
      .eq("warehouse_id", profile.warehouse_id)
      .in("barcode", barcodes);

    if (unitsError) {
      return NextResponse.json({ error: unitsError.message }, { status: 400 });
    }

    unitsByBarcode?.forEach((u) => {
      if (u.warehouse_id === profile.warehouse_id) {
        allUnitIds.add(u.id);
      }
    });
  }

  if (allUnitIds.size === 0) {
    return NextResponse.json({ error: "No valid units found" }, { status: 400 });
  }

  // Verify all units belong to warehouse and get their current cells
  const { data: allUnits, error: allUnitsError } = await supabase
    .from("units")
    .select("id, barcode, cell_id, warehouse_id")
    .in("id", Array.from(allUnitIds))
    .eq("warehouse_id", profile.warehouse_id);

  if (allUnitsError) {
    return NextResponse.json({ error: allUnitsError.message }, { status: 400 });
  }

  if (!allUnits || allUnits.length !== allUnitIds.size) {
    return NextResponse.json({ error: "Some units not found or belong to different warehouse" }, { status: 400 });
  }

  // Get cell types for units to validate they are in storage or shipping
  const unitCellIds = allUnits
    .map((u) => u.cell_id)
    .filter((id): id is string => id !== null);

  let cellTypesMap = new Map<string, string>();
  if (unitCellIds.length > 0) {
    const { data: cells, error: cellsError } = await supabase
      .from("warehouse_cells_map")
      .select("id, cell_type")
      .in("id", unitCellIds)
      .eq("warehouse_id", profile.warehouse_id);

    if (cellsError) {
      return NextResponse.json({ error: cellsError.message }, { status: 400 });
    }

    cells?.forEach((cell) => {
      cellTypesMap.set(cell.id, cell.cell_type);
    });
  }

  // Validate: units must be in storage or shipping cells ONLY
  const invalidUnits: string[] = [];
  allUnits.forEach((unit) => {
    if (!unit.cell_id) {
      invalidUnits.push(unit.barcode + " (не размещен)");
    } else {
      const cellType = cellTypesMap.get(unit.cell_id);
      if (!cellType || (cellType !== "storage" && cellType !== "shipping")) {
        invalidUnits.push(
          unit.barcode + (cellType ? ` (находится в ${cellType}, должен быть в storage/shipping)` : " (ячейка не найдена)")
        );
      }
    }
  });

  if (invalidUnits.length > 0) {
    return NextResponse.json(
      {
        error: "Нельзя создать задачу для заказов вне storage/shipping",
        invalidUnits,
      },
      { status: 400 }
    );
  }

  // Create tasks (one per unit)
  const tasksToInsert = allUnits.map((unit) => ({
    warehouse_id: profile.warehouse_id,
    unit_id: unit.id,
    from_cell_id: unit.cell_id, // Snapshot current cell
    target_picking_cell_id: targetPickingCellId,
    scenario,
    status: "open",
    created_by: userData.user.id,
  }));

  const { data: insertedTasks, error: insertError } = await supabase
    .from("picking_tasks")
    .insert(tasksToInsert)
    .select();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Audit logging: log task creation with details
  const taskBarcodes = allUnits.map((u) => u.barcode);
  const { error: auditError } = await supabase.rpc("audit_log_event", {
    p_action: "picking_task_create",
    p_entity_type: "picking_task",
    p_entity_id: null, // Multiple tasks created
    p_summary: `Создано ${insertedTasks?.length || 0} заданий для ${taskBarcodes.length} units`,
    p_meta: {
      task_count: insertedTasks?.length || 0,
      unit_count: allUnits.length,
      unit_barcodes: taskBarcodes,
      target_picking_cell_id: targetPickingCellId,
      target_picking_cell_code: targetCell.code,
      scenario,
    },
  });

  if (auditError) {
    console.error("Audit log error:", auditError);
    // Don't fail the request if audit logging fails
  }

  return NextResponse.json({
    ok: true,
    tasks: insertedTasks || [],
    count: insertedTasks?.length || 0,
  });
}
