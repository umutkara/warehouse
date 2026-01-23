import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/tsd/shipping-tasks/check-unit?unitBarcode=xxx&fromCellId=xxx
 * Проверяет, есть ли заказ в задачах для указанной from ячейки
 * Возвращает информацию о задаче и ожидаемой TO ячейке
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

  // Check role: worker + ops + admin/head/manager can view
  if (!["worker", "ops", "admin", "head", "manager"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const unitBarcode = url.searchParams.get("unitBarcode");
  const fromCellId = url.searchParams.get("fromCellId");

  if (!unitBarcode || !fromCellId) {
    return NextResponse.json(
      { error: "unitBarcode and fromCellId are required" },
      { status: 400 }
    );
  }

  try {
    // Находим unit по barcode
    const { data: unit, error: unitError } = await supabaseAdmin
      .from("units")
      .select("id, barcode, cell_id")
      .eq("barcode", unitBarcode)
      .eq("warehouse_id", profile.warehouse_id)
      .single();

    if (unitError || !unit) {
      return NextResponse.json(
        { error: "Unit not found", found: false },
        { status: 404 }
      );
    }

    // Проверяем, что unit находится в указанной from ячейке
    if (unit.cell_id !== fromCellId) {
      return NextResponse.json({
        found: false,
        error: `Заказ находится в другой ячейке (не в ${fromCellId})`,
        unit: {
          id: unit.id,
          barcode: unit.barcode,
          cell_id: unit.cell_id,
        },
      });
    }

    // Ищем задачи, где этот unit есть и from_cell_id совпадает
    const { data: taskUnits, error: taskUnitsError } = await supabaseAdmin
      .from("picking_task_units")
      .select(`
        picking_task_id,
        from_cell_id
      `)
      .eq("unit_id", unit.id)
      .eq("from_cell_id", fromCellId);

    if (taskUnitsError) {
      console.error("Error loading picking_task_units:", taskUnitsError);
      return NextResponse.json(
        { error: taskUnitsError.message },
        { status: 400 }
      );
    }

    if (!taskUnits || taskUnits.length === 0) {
      return NextResponse.json({
        found: false,
        error: `Заказ ${unitBarcode} не найден в задачах для ячейки`,
        unit: {
          id: unit.id,
          barcode: unit.barcode,
          cell_id: unit.cell_id,
        },
      });
    }

    // Получаем задачи по ID
    const taskIds = [...new Set(taskUnits.map((tu: any) => tu.picking_task_id))];
    const { data: tasks, error: tasksError } = await supabaseAdmin
      .from("picking_tasks")
      .select("id, status, target_picking_cell_id, scenario")
      .in("id", taskIds)
      .eq("warehouse_id", profile.warehouse_id)
      .in("status", ["open", "in_progress"]);

    if (tasksError) {
      console.error("Error loading picking_tasks:", tasksError);
      return NextResponse.json(
        { error: tasksError.message },
        { status: 400 }
      );
    }

    if (!tasks || tasks.length === 0) {
      return NextResponse.json({
        found: false,
        error: `Заказ найден в задаче, но задача не активна (завершена или отменена)`,
        unit: {
          id: unit.id,
          barcode: unit.barcode,
          cell_id: unit.cell_id,
        },
      });
    }

    // Берем первую активную задачу
    const task = tasks[0];

    // Получаем информацию о TO ячейке (target_picking_cell_id)
    if (!task.target_picking_cell_id) {
      return NextResponse.json({
        found: false,
        error: "В задаче не указана целевая picking ячейка",
        task: {
          id: task.id,
          status: task.status,
        },
      });
    }

    const { data: toCell, error: toCellError } = await supabaseAdmin
      .from("warehouse_cells_map")
      .select("id, code, cell_type, meta")
      .eq("id", task.target_picking_cell_id)
      .single();

    if (toCellError || !toCell) {
      return NextResponse.json({
        found: false,
        error: "Целевая picking ячейка не найдена",
        task: {
          id: task.id,
          target_picking_cell_id: task.target_picking_cell_id,
        },
      });
    }

    // Берем задачу в работу, если она еще open
    if (task.status === "open") {
      const { error: startError } = await supabaseAdmin
        .from("picking_tasks")
        .update({
          status: "in_progress",
          picked_at: new Date().toISOString(),
          picked_by: userData.user.id,
        })
        .eq("id", task.id);

      if (startError) {
        console.error("Failed to start task:", startError);
        // Не возвращаем ошибку, продолжаем
      }
    }

    return NextResponse.json({
      found: true,
      unit: {
        id: unit.id,
        barcode: unit.barcode,
        cell_id: unit.cell_id,
      },
      task: {
        id: task.id,
        status: task.status === "open" ? "in_progress" : task.status, // Обновленный статус
        scenario: task.scenario,
      },
      toCell: {
        id: toCell.id,
        code: toCell.code,
        cell_type: toCell.cell_type,
        description: toCell.meta?.description,
      },
    });
  } catch (e: any) {
    console.error("Error checking unit in tasks:", e);
    return NextResponse.json(
      { error: e.message || "Internal server error" },
      { status: 500 }
    );
  }
}
