import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type ImportRow = {
  rowIndex?: number;
  order?: string;
  destination?: string;
  scenario?: string;
  picking_code?: string;
};

function normalizeDigits(value: any): string {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeForMatch(value: any): string {
  const digits = normalizeDigits(value);
  if (digits.startsWith("00") && digits.length >= 4) {
    return digits.slice(2, -2);
  }
  return digits;
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();

  try {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profError } = await supabase
      .from("profiles")
      .select("warehouse_id, role, full_name")
      .eq("id", userData.user.id)
      .single();

    if (profError || !profile?.warehouse_id) {
      return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
    }

    if (!["admin", "head", "manager", "ops", "logistics"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const rows: ImportRow[] = Array.isArray(body?.rows) ? body.rows : [];

    if (rows.length === 0) {
      return NextResponse.json({ error: "No rows provided" }, { status: 400 });
    }

    // Load available units (storage/shipping, not in tasks)
    const { data: units, error: unitsError } = await supabaseAdmin
      .from("units")
      .select("id, barcode, status, cell_id, created_at, meta")
      .eq("warehouse_id", profile.warehouse_id)
      .not("cell_id", "is", null)
      .order("created_at", { ascending: false });

    if (unitsError) {
      return NextResponse.json({ error: unitsError.message }, { status: 400 });
    }

    if (!units || units.length === 0) {
      return NextResponse.json({ ok: true, created: 0, errors: [] });
    }

    const cellIds = units.map((u) => u.cell_id).filter((id) => id) as string[];
    if (cellIds.length === 0) {
      return NextResponse.json({ ok: true, created: 0, errors: [] });
    }

    const { data: cells, error: cellsError } = await supabaseAdmin
      .from("warehouse_cells_map")
      .select("id, code, cell_type")
      .in("id", cellIds);

    if (cellsError) {
      return NextResponse.json({ error: cellsError.message }, { status: 400 });
    }

    const cellsMap = new Map<string, (typeof cells)[number]>();
    (cells || []).forEach((cell) => {
      if (cell?.id) {
        cellsMap.set(cell.id, cell);
      }
    });

    const { data: pickingTasks, error: tasksError } = await supabaseAdmin
      .from("picking_tasks")
      .select("unit_id, id")
      .eq("warehouse_id", profile.warehouse_id)
      .in("status", ["open", "in_progress"]);

    if (tasksError) {
      return NextResponse.json({ error: tasksError.message }, { status: 400 });
    }

    const taskIds = (pickingTasks || []).map((t) => t.id).filter(Boolean);
    let unitsFromMultiUnitTasks: string[] = [];
    if (taskIds.length > 0) {
      const { data: taskUnits } = await supabaseAdmin
        .from("picking_task_units")
        .select("unit_id")
        .in("picking_task_id", taskIds);
      if (taskUnits) {
        unitsFromMultiUnitTasks = taskUnits.map((tu) => tu.unit_id).filter(Boolean);
      }
    }

    const unitIdsInTasks = new Set([
      ...(pickingTasks || []).map((task) => task.unit_id).filter(Boolean),
      ...unitsFromMultiUnitTasks,
    ]);

    const availableUnits = units
      .map((unit) => {
        const cell = unit.cell_id ? cellsMap.get(unit.cell_id) : null;
        return {
          id: unit.id,
          barcode: unit.barcode,
          status: unit.status,
          cell_id: unit.cell_id,
          cell,
        };
      })
      .filter((unit) => {
        const isInStorageOrShipping =
          unit.cell && (unit.cell.cell_type === "storage" || unit.cell.cell_type === "shipping");
        const isNotInTasks = !unitIdsInTasks.has(unit.id);
        return isInStorageOrShipping && isNotInTasks;
      });

    // Map normalized barcode -> unit (detect duplicates)
    const normalizedMap = new Map<string, { id: string; barcode: string; cell_id: string }>();
    const normalizedDuplicates = new Set<string>();

    availableUnits.forEach((unit) => {
      const normalized = normalizeForMatch(unit.barcode);
      if (!normalized) return;
      if (normalizedMap.has(normalized)) {
        normalizedDuplicates.add(normalized);
      } else if (unit.cell_id) {
        normalizedMap.set(normalized, {
          id: unit.id,
          barcode: unit.barcode,
          cell_id: unit.cell_id,
        });
      }
    });

    // Map picking cells by code
    const { data: pickingCells, error: pickingCellsError } = await supabaseAdmin
      .from("warehouse_cells_map")
      .select("id, code, cell_type, warehouse_id, is_active")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("cell_type", "picking");

    if (pickingCellsError) {
      return NextResponse.json({ error: pickingCellsError.message }, { status: 400 });
    }

    const pickingMap = new Map<string, (typeof pickingCells)[number]>();
    (pickingCells || []).forEach((cell) => {
      if (cell?.code) {
        pickingMap.set(cell.code.trim().toUpperCase(), cell);
      }
    });

    const errors: Array<{ rowIndex: number; message: string }> = [];
    let created = 0;
    const usedUnitIds = new Set<string>();
    let matched = 0;
    let notFound = 0;

    const SCENARIO_FROM = "Склад Возвратов";

    for (const row of rows) {
      const rowIndex = row.rowIndex ?? 0;
      const orderValue = String(row.order ?? "").trim();
      const destination = String(row.destination ?? "").trim();
      const scenario = String(row.scenario ?? "").trim();
      const pickingCode = String(row.picking_code ?? "").trim();

      if (!orderValue) {
        errors.push({ rowIndex, message: "Не указан заказ" });
        continue;
      }
      if (!destination) {
        errors.push({ rowIndex, message: "Не указано поле 'куда'" });
        continue;
      }
      if (!pickingCode) {
        errors.push({ rowIndex, message: "Не указан код picking ячейки" });
        continue;
      }

      const normalizedOrder = normalizeForMatch(orderValue);
      if (!normalizedOrder) {
        errors.push({ rowIndex, message: "Некорректный номер заказа" });
        continue;
      }

      if (normalizedDuplicates.has(normalizedOrder)) {
        errors.push({ rowIndex, message: "Невозможно однозначно определить заказ (дубликат после нормализации)" });
        continue;
      }

      const matchedUnit = normalizedMap.get(normalizedOrder);
      if (!matchedUnit) {
        notFound += 1;
        errors.push({ rowIndex, message: "Заказ не найден среди доступных" });
        continue;
      }
      matched += 1;

      if (usedUnitIds.has(matchedUnit.id)) {
        errors.push({ rowIndex, message: "Заказ повторяется в файле" });
        continue;
      }

      const targetCell = pickingMap.get(pickingCode.toUpperCase());
      if (!targetCell) {
        errors.push({ rowIndex, message: "Picking ячейка не найдена" });
        continue;
      }
      if (!targetCell.is_active) {
        errors.push({ rowIndex, message: "Picking ячейка не активна" });
        continue;
      }

      const creatorName = profile.full_name || userData.user.email || "Unknown";
      let scenarioValue = scenario || destination;
      if (destination) {
        const hasArrow = scenarioValue.includes("→");
        if (!hasArrow) {
          scenarioValue = scenario
            ? `${SCENARIO_FROM} → ${destination} → ${scenario}`
            : `${SCENARIO_FROM} → ${destination}`;
        }
      }

      const taskToInsert = {
        warehouse_id: profile.warehouse_id,
        unit_id: null,
        from_cell_id: null,
        target_picking_cell_id: targetCell.id,
        scenario: scenarioValue,
        status: "open",
        created_by: userData.user.id,
        created_by_name: creatorName,
      };

      const { data: insertedTasks, error: insertError } = await supabaseAdmin
        .from("picking_tasks")
        .insert([taskToInsert])
        .select();

      if (insertError || !insertedTasks?.[0]?.id) {
        errors.push({ rowIndex, message: insertError?.message || "Не удалось создать задачу" });
        continue;
      }

      const taskId = insertedTasks[0].id;

      const { error: unitsInsertError } = await supabaseAdmin
        .from("picking_task_units")
        .insert([
          {
            picking_task_id: taskId,
            unit_id: matchedUnit.id,
            from_cell_id: matchedUnit.cell_id,
          },
        ]);

      if (unitsInsertError) {
        await supabaseAdmin.from("picking_tasks").delete().eq("id", taskId);
        errors.push({ rowIndex, message: unitsInsertError.message });
        continue;
      }

      // Audit log for task
      await supabase.rpc("audit_log_event", {
        p_action: "picking_task_create",
        p_entity_type: "picking_task",
        p_entity_id: taskId,
        p_summary: `Создано задание для ячейки ${targetCell.code} (${creatorName}) с 1 заказом`,
        p_meta: {
          task_id: taskId,
          unit_count: 1,
          unit_barcodes: [matchedUnit.barcode],
          target_picking_cell_id: targetCell.id,
          target_picking_cell_code: targetCell.code,
          created_by_name: creatorName,
          scenario: scenarioValue,
        },
      });

      // Audit log for unit
      await supabase.rpc("audit_log_event", {
        p_action: "picking_task_create",
        p_entity_type: "unit",
        p_entity_id: matchedUnit.id,
        p_summary: `Создано задание на отгрузку в ячейку ${targetCell.code} (${scenarioValue})`,
        p_meta: {
          task_id: taskId,
          target_picking_cell_id: targetCell.id,
          target_picking_cell_code: targetCell.code,
          created_by_name: creatorName,
          scenario: scenarioValue,
        },
      });

      usedUnitIds.add(matchedUnit.id);
      created += 1;
    }
    return NextResponse.json({
      ok: true,
      created,
      errors,
    });
  } catch (e: any) {
    console.error("Import picking tasks error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
