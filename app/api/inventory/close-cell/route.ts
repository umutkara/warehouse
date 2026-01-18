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

    const { data: authData } = await supabase.auth.getUser();
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

    // Проверить что инвентаризация активна
    const { data: warehouse, error: warehouseError } = await supabase
      .from("warehouses")
      .select("id, inventory_active, inventory_session_id")
      .eq("id", profile.warehouse_id)
      .single();

    if (warehouseError || !warehouse) {
      return NextResponse.json({ error: "Склад не найден" }, { status: 404 });
    }

    if (!warehouse.inventory_active || !warehouse.inventory_session_id) {
      return NextResponse.json(
        { error: "Инвентаризация не активна" },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Тело запроса отсутствует" }, { status: 400 });
    }

    const cellCode = normalizeCellCode(body?.cellCode || "");
    if (!cellCode) {
      return NextResponse.json({ error: "cellCode обязателен" }, { status: 400 });
    }

    // Найти ячейку
    const { data: cell, error: cellError } = await supabase
      .from("warehouse_cells")
      .select("id, code, cell_type, warehouse_id")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("code", cellCode)
      .single();

    if (cellError || !cell) {
      return NextResponse.json({ error: `Ячейка "${cellCode}" не найдена` }, { status: 404 });
    }

    // Обработать barcodes - ИЗМЕНЕНО: используем scannedBarcodes вместо unitBarcodes
    const rawBarcodes = Array.isArray(body?.scannedBarcodes) ? body.scannedBarcodes : [];
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

    // Upsert inventory_cell_counts
    // Note: PostgREST schema cache may not see columns with DEFAULT values
    // Only include required fields without DEFAULT; others will be auto-filled
    const { error: countError } = await supabase
      .from("inventory_cell_counts")
      .upsert(
        {
          session_id: warehouse.inventory_session_id,
          cell_id: cell.id,
          scanned_by: authData.user.id,
          // scanned_at has DEFAULT now() - auto-filled
          // status has DEFAULT 'scanned' - auto-filled
          // meta has DEFAULT '{}'::jsonb - auto-filled
        },
        {
          onConflict: "session_id,cell_id",
        }
      );

    if (countError) {
      console.error("inventory_cell_counts upsert error:", countError);
      return NextResponse.json(
        { error: "Ошибка сохранения результата сканирования" },
        { status: 500 }
      );
    }

    // Удалить старые записи inventory_cell_units для этой ячейки
    const { error: deleteError } = await supabase
      .from("inventory_cell_units")
      .delete()
      .eq("session_id", warehouse.inventory_session_id)
      .eq("cell_id", cell.id);

    if (deleteError) {
      console.error("inventory_cell_units delete error:", deleteError);
      return NextResponse.json(
        { error: "Ошибка очистки предыдущих записей" },
        { status: 500 }
      );
    }

    // Вставить новые записи inventory_cell_units
    if (normalizedBarcodes.length > 0) {
      const unitsToInsert = normalizedBarcodes.map((barcode: string) => ({
        session_id: warehouse.inventory_session_id,
        cell_id: cell.id,
        unit_id: unitsMap.get(barcode) || null,
        unit_barcode: barcode,
      }));

      const { error: insertError } = await supabase
        .from("inventory_cell_units")
        .insert(unitsToInsert);

      if (insertError) {
        console.error("inventory_cell_units insert error:", insertError);
        return NextResponse.json(
          { error: "Ошибка сохранения списка unit'ов" },
          { status: 500 }
        );
      }
    }

    // Получить expected units (что должно быть в ячейке по БД)
    const { data: expectedUnits } = await supabase
      .from("units")
      .select("barcode")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("cell_id", cell.id);

    const expectedBarcodes = (expectedUnits || [])
      .map((u: { barcode: string | null }) => u.barcode)
      .filter((b): b is string => Boolean(b));
    const scannedBarcodes = normalizedBarcodes;

    // Вычислить diff
    const missing = expectedBarcodes.filter((b: string) => !scannedBarcodes.includes(b));
    const extra = scannedBarcodes.filter((b: string) => !expectedBarcodes.includes(b));
    const unknown = scannedBarcodes.filter((b: string) => !unitsMap.has(b));

    // Audit logging for inventory close_cell
    const { error: auditError } = await supabase.rpc("audit_log_event", {
      p_action: "inventory.close_cell",
      p_entity_type: "cell",
      p_entity_id: cell.id,
      p_summary: `Закрытие ячейки ${cell.code}: добавлено ${extra.length}, удалено ${missing.length}`,
      p_meta: {
        cell_id: cell.id,
        cell_code: cell.code,
        session_id: warehouse.inventory_session_id,
        added: extra,
        removed: missing,
        unknown,
        scanned_count: scannedBarcodes.length,
        expected_count: expectedBarcodes.length,
      },
    });

    if (auditError) {
      console.error("Audit log error:", auditError);
      // Don't fail the request if audit logging fails
    }

    return NextResponse.json({
      ok: true,
      sessionId: warehouse.inventory_session_id,
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
    });
  } catch (e: any) {
    console.error("inventory/close-cell error:", e);
    return NextResponse.json(
      { error: e?.message || "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
