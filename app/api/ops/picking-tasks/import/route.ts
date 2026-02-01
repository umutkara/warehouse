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
      .eq("warehouse_id", profile.warehouse_id)
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

    // Fetch all open/in_progress tasks (paginate: Supabase returns max 1000 per request)
    const pageSize = 1000;
    const maxPages = 10;
    let pickingTasks: { unit_id: string | null; id: string }[] = [];
    for (let page = 0; page < maxPages; page++) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data: pageTasks, error: pageError } = await supabaseAdmin
        .from("picking_tasks")
        .select("unit_id, id")
        .eq("warehouse_id", profile.warehouse_id)
        .in("status", ["open", "in_progress"])
        .order("created_at", { ascending: false })
        .range(from, to);

      if (pageError) {
        return NextResponse.json({ error: pageError.message }, { status: 400 });
      }
      if (!pageTasks?.length) break;
      pickingTasks.push(...pageTasks);
      if (pageTasks.length < pageSize) break;
    }

    const taskIds = pickingTasks.map((t) => t.id).filter(Boolean);
    let unitsFromMultiUnitTasks: string[] = [];
    if (taskIds.length > 0) {
      const chunkSize = 200;
      for (let i = 0; i < taskIds.length; i += chunkSize) {
        const chunk = taskIds.slice(i, i + chunkSize);
        const { data: taskUnits } = await supabaseAdmin
          .from("picking_task_units")
          .select("unit_id")
          .in("picking_task_id", chunk);
        if (taskUnits) {
          unitsFromMultiUnitTasks.push(...taskUnits.map((tu) => tu.unit_id).filter(Boolean));
        }
      }
    }

    const unitIdsInTasks = new Set([
      ...pickingTasks.map((task) => task.unit_id).filter(Boolean),
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
    const usedUnitIds = new Set<string>();
    const SCENARIO_FROM = "Склад Возвратов";
    const creatorName = profile.full_name || userData.user.email || "Unknown";

    type ValidRow = {
      rowIndex: number;
      matchedUnit: { id: string; barcode: string; cell_id: string };
      targetCell: (typeof pickingCells)[number];
      scenarioValue: string;
    };
    const validRows: ValidRow[] = [];

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
        errors.push({ rowIndex, message: "Заказ не найден среди доступных" });
        continue;
      }

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

      let scenarioValue = scenario || destination;
      if (destination) {
        const hasArrow = scenarioValue.includes("→");
        if (!hasArrow) {
          scenarioValue = scenario
            ? `${SCENARIO_FROM} → ${destination} → ${scenario}`
            : `${SCENARIO_FROM} → ${destination}`;
        }
      }

      usedUnitIds.add(matchedUnit.id);
      validRows.push({ rowIndex, matchedUnit, targetCell, scenarioValue });
    }

    if (validRows.length === 0) {
      return NextResponse.json({
        ok: true,
        created: 0,
        errors,
        availableUnitsCount: availableUnits.length,
      });
    }

    // Stream progress: batch insert (50 per batch) and send progress after each batch
    const BATCH_SIZE = 50;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let created = 0;
        try {
          for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
            const batch = validRows.slice(i, i + BATCH_SIZE);
            const taskRows = batch.map((v) => ({
              warehouse_id: profile.warehouse_id,
              unit_id: null,
              from_cell_id: null,
              target_picking_cell_id: v.targetCell.id,
              scenario: v.scenarioValue,
              status: "open",
              created_by: userData.user.id,
              created_by_name: creatorName,
            }));

            const { data: insertedTasks, error: insertError } = await supabaseAdmin
              .from("picking_tasks")
              .insert(taskRows)
              .select("id");

            if (insertError || !insertedTasks?.length) {
              batch.forEach((v) => errors.push({ rowIndex: v.rowIndex, message: insertError?.message || "Не удалось создать задачу" }));
              continue;
            }

            const taskUnitsToInsert = insertedTasks.map((t, idx) => ({
              picking_task_id: t.id,
              unit_id: batch[idx].matchedUnit.id,
              from_cell_id: batch[idx].matchedUnit.cell_id,
            }));

            const { error: unitsInsertError } = await supabaseAdmin
              .from("picking_task_units")
              .insert(taskUnitsToInsert);

            if (unitsInsertError) {
              const ids = insertedTasks.map((t) => t.id).filter(Boolean);
              if (ids.length > 0) await supabaseAdmin.from("picking_tasks").delete().in("id", ids);
              batch.forEach((v) => errors.push({ rowIndex: v.rowIndex, message: unitsInsertError.message }));
              continue;
            }

            created += batch.length;
            controller.enqueue(encoder.encode(JSON.stringify({ type: "progress", created, total: validRows.length }) + "\n"));
          }
          const donePayload = { type: "done", ok: true, created, errors, availableUnitsCount: availableUnits.length };
          controller.enqueue(encoder.encode(JSON.stringify(donePayload) + "\n"));
        } catch (e: any) {
          controller.enqueue(encoder.encode(JSON.stringify({ type: "done", ok: false, created: 0, errors: [...errors, { rowIndex: 0, message: e?.message || "Internal error" }], availableUnitsCount: availableUnits.length }) + "\n"));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
  } catch (e: any) {
    console.error("Import picking tasks error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
