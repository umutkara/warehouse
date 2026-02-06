import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function normalizeCellCode(v: any) {
  return String(v ?? "").trim().toUpperCase();
}

function normalizeUnitBarcode(v: any) {
  // unit barcode = только цифры
  return String(v ?? "").replace(/\D/g, "");
}

function statusByCellType(cellType: string) {
  // ВАЖНО: статусы должны совпадать с enum unit_status
  // Статус заказа = тип ячейки (согласно новой логике)
  switch (cellType) {
    case "bin":
      return "bin";
    case "storage":
      return "stored";
    case "shipping":
      return "shipping";
    case "picking":
      return "picking";
    case "rejected":
      return "rejected";
    case "ff":
      return "ff";
    default:
      return null;
  }
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();

  const { data: auth, error: authError } = await supabase.auth.getUser();
  
  if (authError) return NextResponse.json({ error: authError.message }, { status: 401 });

  const user = auth?.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("warehouse_id, full_name")
    .eq("id", user.id)
    .single();

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 });
  if (!profile?.warehouse_id) return NextResponse.json({ error: "Warehouse not found" }, { status: 404 });

  const body = await req.json().catch(() => null);

  const unitBarcode = normalizeUnitBarcode(body?.unitBarcode);

  // Новый формат
  const fromCellCode = normalizeCellCode(body?.fromCellCode);
  const toCellCode = normalizeCellCode(body?.toCellCode);

  // Legacy формат (если вдруг ещё остался где-то клиент)
  const cellCode = normalizeCellCode(body?.cellCode);

  if (!unitBarcode) return NextResponse.json({ error: "Barcode is required" }, { status: 400 });

  /**
   * =========================
   * NEW FORMAT: FROM + TO + UNIT
   * =========================
   */
  if (fromCellCode && toCellCode) {
    // unit
    const { data: unit, error: unitError } = await supabase
      .from("units")
      .select("id, barcode, cell_id, warehouse_id, status")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("barcode", unitBarcode)
      .single();

    if (unitError || !unit) return NextResponse.json({ error: "Unit не найден" }, { status: 404 });

    // from cell через view (обходит проблему "stack depth limit exceeded")
    const { data: fromCell, error: fromCellError } = await supabase
      .from("warehouse_cells_map")
      .select("id, code, cell_type, warehouse_id, meta, is_active")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("code", fromCellCode)
      .single();

    if (fromCellError || !fromCell) {
      return NextResponse.json({ error: `FROM ячейка "${fromCellCode}" не найдена` }, { status: 404 });
    }

    // to cell через view (обходит проблему "stack depth limit exceeded")
    const { data: toCell, error: toCellError } = await supabase
      .from("warehouse_cells_map")
      .select("id, code, cell_type, warehouse_id, meta, is_active")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("code", toCellCode)
      .single();

    if (toCellError || !toCell) {
      return NextResponse.json({ error: `TO ячейка "${toCellCode}" не найдена` }, { status: 404 });
    }

    // Активность/блок
    if (!fromCell.is_active) return NextResponse.json({ error: `FROM ячейка "${fromCellCode}" не активна` }, { status: 400 });
    if (!toCell.is_active) return NextResponse.json({ error: `TO ячейка "${toCellCode}" не активна` }, { status: 400 });
    if (fromCell.meta?.blocked) return NextResponse.json({ error: `FROM ячейка "${fromCellCode}" заблокирована` }, { status: 400 });
    if (toCell.meta?.blocked) return NextResponse.json({ error: `TO ячейка "${toCellCode}" заблокирована` }, { status: 400 });

    // unit must be in FROM
    if (unit.cell_id !== fromCell.id) {
      return NextResponse.json(
        { error: `Unit находится не в ячейке "${fromCellCode}". Текущая ячейка не совпадает.` },
        { status: 400 }
      );
    }

    // Запрет storage/shipping -> bin (BIN только входная)
    if (toCell.cell_type === "bin" && fromCell.cell_type !== "bin") {
      return NextResponse.json(
        { error: "Запрещено перемещать в BIN из storage/shipping. BIN - только входная зона." },
        { status: 400 }
      );
    }

    // Разрешённые перемещения
    // bin → storage/shipping/rejected/ff (решение куда отправить)
    // storage/shipping → picking (OPS создал задание)
    // storage ⇄ shipping (изменение решения)
    // rejected → rejected (обратная совместимость)
    // rejected → ff, storage, shipping (ТСД перемещение из отклонённых)
    // storage/shipping → rejected/ff (обратная совместимость)
    // picking → out (через ТСД отгрузка - но это отдельный API)
    const allowedMoves: Record<string, string[]> = {
      bin: ["storage", "shipping", "rejected", "ff"],
      storage: ["storage", "shipping", "picking", "rejected", "ff"],
      shipping: ["shipping", "storage", "picking", "rejected", "ff"],
      picking: ["picking"], // Picking может перемещаться внутри picking зоны
      rejected: ["rejected", "ff", "storage", "shipping"],
      ff: ["ff", "storage", "shipping"],
    };

    const fromType = String(fromCell.cell_type);
    const toType = String(toCell.cell_type);

    if (!allowedMoves[fromType]?.includes(toType)) {
      return NextResponse.json(
        { error: `Перемещение из "${fromType}" в "${toType}" запрещено` },
        { status: 400 }
      );
    }

    // STATUS строго по типу целевой ячейки (НЕ null)
    const toStatus = statusByCellType(toCell.cell_type);

    if (!toStatus) {
      return NextResponse.json(
        { error: `Неизвестный тип целевой ячейки: ${toCell.cell_type}` },
        { status: 400 }
      );
    }

    // RPC move (NO null status!)
    const { data: rpcResult, error: rpcError } = await supabase.rpc("move_unit_to_cell", {
      p_unit_id: unit.id,
      p_to_cell_id: toCell.id,
      p_to_status: toStatus,
      p_note: null,
      p_source: "move-by-scan",
      p_meta: null,
    });

    if (rpcError) {
      console.error("move-by-scan RPC error:", rpcError);
      // Проверка на блокировку инвентаризации
      if (rpcError.message && rpcError.message.includes('INVENTORY_ACTIVE')) {
        return NextResponse.json(
          { error: "Инвентаризация активна. Перемещения заблокированы." },
          { status: 423 }
        );
      }
      return NextResponse.json({ error: rpcError.message || "Ошибка перемещения" }, { status: 500 });
    }

    const result = typeof rpcResult === "string" ? JSON.parse(rpcResult) : rpcResult;

    if (!result?.ok) {
      return NextResponse.json({ error: result?.error || "Ошибка перемещения" }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      unitId: unit.id,
      fromCellId: fromCell.id,
      toCellId: toCell.id,
      toStatus,
      unit: { id: unit.id, barcode: unit.barcode, cell_id: toCell.id, status: toStatus },
      fromCell: { id: fromCell.id, code: fromCell.code, cell_type: fromCell.cell_type },
      toCell: { id: toCell.id, code: toCell.code, cell_type: toCell.cell_type },
    });
  }

  /**
   * =========================
   * LEGACY FORMAT: cellCode + unitBarcode
   * =========================
   * Вариант: оставить ТОЛЬКО как первичное размещение (unit.cell_id IS NULL).
   * Если не хочешь legacy вообще — замени этот блок на возврат 400.
   */
  if (cellCode) {
    const { data: unit, error: unitError } = await supabase
      .from("units")
      .select("id, barcode, cell_id, warehouse_id, status")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("barcode", unitBarcode)
      .single();

    if (unitError || !unit) return NextResponse.json({ error: "Unit not found" }, { status: 404 });

    // Разрешаем legacy ТОЛЬКО если unit ещё нигде не лежит (первичное размещение)
    if (unit.cell_id) {
      return NextResponse.json(
        { error: "Legacy формат запрещён для перемещений. Используйте fromCellCode/toCellCode." },
        { status: 400 }
      );
    }

    // cell через view (обходит проблему "stack depth limit exceeded")
    const { data: cell, error: cellError } = await supabase
      .from("warehouse_cells_map")
      .select("id, code, cell_type, warehouse_id, meta, is_active")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("code", cellCode)
      .single();

    if (cellError || !cell) return NextResponse.json({ error: "Cell not found" }, { status: 404 });
    if (!cell.is_active) return NextResponse.json({ error: `Cell "${cellCode}" is not active` }, { status: 400 });
    if (cell.meta?.blocked) return NextResponse.json({ error: `Cell "${cellCode}" is blocked` }, { status: 400 });

    const toStatus = statusByCellType(cell.cell_type);
    if (!toStatus) {
      return NextResponse.json({ error: `Неизвестный тип целевой ячейки: ${cell.cell_type}` }, { status: 400 });
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc("move_unit_to_cell", {
      p_unit_id: unit.id,
      p_to_cell_id: cell.id,
      p_to_status: toStatus,
      p_note: null,
      p_source: "move-by-scan-legacy",
      p_meta: null,
    });

    if (rpcError) {
      console.error("move-by-scan RPC error:", rpcError);
      // Проверка на блокировку инвентаризации
      if (rpcError.message && rpcError.message.includes('INVENTORY_ACTIVE')) {
        return NextResponse.json(
          { error: "Инвентаризация активна. Перемещения заблокированы." },
          { status: 423 }
        );
      }
      return NextResponse.json({ error: rpcError.message || "Move failed" }, { status: 500 });
    }

    const result = typeof rpcResult === "string" ? JSON.parse(rpcResult) : rpcResult;
    if (!result?.ok) {
      return NextResponse.json({ error: result?.error || "Move failed" }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      unit: { id: unit.id, barcode: unit.barcode, cell_id: cell.id, status: toStatus },
      cell: { id: cell.id, code: cell.code, cell_type: cell.cell_type },
      toStatus,
    });
  }

  return NextResponse.json(
    { error: "Необходимо указать fromCellCode/toCellCode или cellCode" },
    { status: 400 }
  );
}
