import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function normalizeCellCode(code: string): string {
  let normalized = String(code || "").trim().toUpperCase();
  // Убрать префикс "CELL:" если есть
  if (normalized.startsWith("CELL:")) {
    normalized = normalized.substring(5).trim();
  }
  return normalized;
}

function normalizeBarcode(barcode: string): string {
  // Оставить только цифры
  return String(barcode || "").replace(/\D/g, "");
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();

    const { data: authData, error: authError } = await supabase.auth.getUser();
    
    if (!authData?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Получить профиль и warehouse_id
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("warehouse_id, role")
      .eq("id", authData.user.id)
      .single();

    if (profileError || !profile?.warehouse_id) {
      return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
    }

    // Проверить что инвентаризация активна через RPC (обходит проблему "stack depth limit exceeded" при запросе к warehouses)
    const { data: statusResult, error: statusError } = await supabase.rpc("inventory_status");

    if (statusError) {
      return NextResponse.json(
        { error: statusError.message || "Ошибка проверки статуса инвентаризации" },
        { status: 400 }
      );
    }

    const status = typeof statusResult === "string" ? JSON.parse(statusResult) : statusResult;

    if (!status?.ok) {
      return NextResponse.json(
        { error: status?.error || "Ошибка проверки статуса инвентаризации" },
        { status: 400 }
      );
    }

    if (!status.active || !status.sessionId) {
      return NextResponse.json(
        { error: "Инвентаризация не активна" },
        { status: 409 }
      );
    }

    const inventorySessionId = status.sessionId;

    const body = await req.json().catch(() => null);
    
    if (!body) {
      return NextResponse.json({ error: "Тело запроса отсутствует" }, { status: 400 });
    }

    const cellCode = normalizeCellCode(body?.cellCode || "");
    if (!cellCode) {
      return NextResponse.json({ error: "cellCode обязателен" }, { status: 400 });
    }

    // Найти ячейку через view (обходит проблему "stack depth limit exceeded" при запросе к warehouse_cells)
    const { data: cell, error: cellError } = await supabase
      .from("warehouse_cells_map")
      .select("id, code, cell_type, warehouse_id")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("code", cellCode)
      .single();

    if (cellError || !cell) {
      return NextResponse.json({ error: `Ячейка "${cellCode}" не найдена` }, { status: 404 });
    }

    // Обработать barcodes
    const rawBarcodes = Array.isArray(body?.unitBarcodes) ? body.unitBarcodes : [];
    const normalizedBarcodes = rawBarcodes
      .map(normalizeBarcode)
      .filter((b: string) => b.length >= 1) // Минимум 1 цифра
      .filter((b: string, idx: number, arr: string[]) => arr.indexOf(b) === idx); // Убрать дубликаты

    // Найти units по barcodes
    let unitsMap = new Map<string, string>(); // barcode -> unit_id
    
    if (normalizedBarcodes.length > 0) {
      const { data: units } = await supabase
        .from("units")
        .select("id, barcode")
        .eq("warehouse_id", profile.warehouse_id)
        .in("barcode", normalizedBarcodes);

      if (units) {
        units.forEach((u: { id: string; barcode: string | null }) => {
          if (u.barcode) {
            unitsMap.set(u.barcode, u.id);
          }
        });
      }
    }

    // Use RPC function to bypass PostgREST schema cache issues
    // This function uses direct SQL and doesn't rely on table schema cache
    const { data: rpcResult, error: rpcError } = await supabase.rpc("inventory_save_cell_scan", {
      p_session_id: inventorySessionId,
      p_cell_id: cell.id,
      p_scanned_by: authData.user.id,
      p_unit_barcodes: normalizedBarcodes,
    });

    if (rpcError) {
      console.error("inventory_save_cell_scan RPC error:", rpcError);
      return NextResponse.json(
        { error: "Ошибка сохранения результата сканирования", details: rpcError.message, code: rpcError.code },
        { status: 500 }
      );
    }

    const result = typeof rpcResult === "string" ? JSON.parse(rpcResult) : rpcResult;
    if (!result?.ok) {
      return NextResponse.json(
        { error: result?.error || "Ошибка сохранения результата сканирования" },
        { status: 400 }
      );
    }

    // RPC function already handled upsert and units insertion
    
    // ✨ НОВОЕ: Обновить статус задания с 'pending' на 'scanned'
    const { error: updateStatusError } = await supabase
      .from("inventory_cell_counts")
      .update({ 
        status: 'scanned',
        scanned_at: new Date().toISOString(),
        scanned_by: authData.user.id
      })
      .eq("session_id", inventorySessionId)
      .eq("cell_id", cell.id);

    if (updateStatusError) {
      console.error("Failed to update task status:", updateStatusError);
      // Don't fail the request - continue with the scan
    }
    
    // CRITICAL: Apply changes to actual units.cell_id by calling inventory_close_cell
    // This function updates units table based on scanned barcodes
    const { data: closeResult, error: closeError } = await supabase.rpc("inventory_close_cell", {
      p_cell_code: cell.code,
      p_scanned_barcodes: normalizedBarcodes,
    });

    if (closeError) {
      console.error("inventory_close_cell RPC error:", closeError);
      // Log error but don't fail - scan was saved, just not applied
      // Return warning that changes were saved but not applied
      return NextResponse.json(
        { 
          error: "Ошибка применения изменений к юнитам", 
          details: closeError.message,
          warning: "Сканирование сохранено, но изменения не применены к реальным юнитам",
          code: closeError.code 
        },
        { status: 500 }
      );
    }

    const closeData = typeof closeResult === "string" ? JSON.parse(closeResult) : closeResult;
    
    if (!closeData?.ok) {
      console.error("inventory_close_cell returned error:", closeData);
      return NextResponse.json(
        { 
          error: closeData?.error || "Ошибка применения изменений к юнитам",
          warning: "Сканирование сохранено, но изменения не применены к реальным юнитам"
        },
        { status: 400 }
      );
    }

    // Changes applied successfully
    // Get expected units (что должно быть в ячейке по БД) AFTER applying changes
    const { data: expectedUnits } = await supabase
      .from("units")
      .select("barcode")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("cell_id", cell.id);

    const expectedBarcodes = (expectedUnits || [])
      .map((u: { barcode: string | null }) => u.barcode)
      .filter((b): b is string => Boolean(b));
    const scannedBarcodes = normalizedBarcodes;

    // Вычислить diff (после применения изменений diff должен быть пустым если всё правильно)
    const missing = expectedBarcodes.filter((b: string) => !scannedBarcodes.includes(b));
    const extra = scannedBarcodes.filter((b: string) => !expectedBarcodes.includes(b));
    const unknown = scannedBarcodes.filter((b: string) => !unitsMap.has(b));

    // Audit logging: log cell scan with results
    const { error: auditError } = await supabase.rpc("audit_log_event", {
      p_action: "inventory.cell_scan",
      p_entity_type: "cell",
      p_entity_id: cell.id,
      p_summary: `Сканирование ячейки ${cell.code}: добавлено ${closeData.added || 0}, удалено ${closeData.removed || 0}`,
      p_meta: {
        cell_id: cell.id,
        cell_code: cell.code,
        session_id: inventorySessionId,
        scanned_count: scannedBarcodes.length,
        expected_count: expectedBarcodes.length,
        added: closeData.added || 0,
        removed: closeData.removed || 0,
        missing,
        extra,
        unknown,
      },
    });

    if (auditError) {
      console.error("Audit log error:", auditError);
      // Don't fail the request if audit logging fails
    }

    // ✨ НОВОЕ: Проверить завершение всех заданий и автоматически закрыть если нужно
    const { data: autoCloseResult, error: autoCloseError } = await supabase.rpc(
      "inventory_check_and_auto_close",
      { p_session_id: inventorySessionId }
    );

    let inventoryAutoClosed = false;
    if (!autoCloseError && autoCloseResult) {
      const closeData = typeof autoCloseResult === "string" 
        ? JSON.parse(autoCloseResult) 
        : autoCloseResult;
      inventoryAutoClosed = closeData.autoClosed || false;
    }

    return NextResponse.json({
      ok: true,
      sessionId: inventorySessionId,
      inventoryAutoClosed,
      cell: {
        id: cell.id,
        code: cell.code,
        cell_type: cell.cell_type,
      },
      expected: {
        count: expectedBarcodes.length,
        barcodes: expectedBarcodes,
      },
      scanned: {
        count: scannedBarcodes.length,
        barcodes: scannedBarcodes,
      },
      diff: {
        missing,
        extra,
        unknown,
      },
      applied: {
        added: closeData.added || 0,
        removed: closeData.removed || 0,
        addedBarcodes: closeData.addedBarcodes || [],
        removedBarcodes: closeData.removedBarcodes || [],
      },
    });
  } catch (e: any) {
    console.error("inventory/cell-scan error:", e);
    return NextResponse.json(
      { error: e?.message || "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
