import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  try {
    const supabase = await supabaseServer();

    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Получить профиль и warehouse_id
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("warehouse_id")
      .eq("id", authData.user.id)
      .single();

    if (profileError || !profile?.warehouse_id) {
      return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
    }

    // Получить sessionId из query или из активной сессии
    const url = new URL(req.url);
    let sessionId = url.searchParams.get("sessionId");

    if (!sessionId) {
      // Попробовать получить из текущей или последней сессии
      const { data: warehouse } = await supabase
        .from("warehouses")
        .select("inventory_session_id, inventory_active")
        .eq("id", profile.warehouse_id)
        .single();

      if (warehouse?.inventory_session_id) {
        sessionId = warehouse.inventory_session_id;
      } else {
        // If no session_id on warehouse, try to find the most recent session
        const { data: lastSession } = await supabase
          .from("inventory_sessions")
          .select("id")
          .eq("warehouse_id", profile.warehouse_id)
          .order("started_at", { ascending: false })
          .limit(1)
          .single();

        if (lastSession) {
          sessionId = lastSession.id;
        } else {
          return NextResponse.json(
            { error: "sessionId не указан и сессии не найдены" },
            { status: 400 }
          );
        }
      }
    }

    // Проверить что session принадлежит warehouse
    const { data: session, error: sessionError } = await supabase
      .from("inventory_sessions")
      .select("id, status, started_at, closed_at, warehouse_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
    }

    if (session.warehouse_id !== profile.warehouse_id) {
      return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
    }

    // Получить общее количество ячеек (активных)
    const { count: cellsTotal } = await supabase
      .from("warehouse_cells")
      .select("*", { count: "exact", head: true })
      .eq("warehouse_id", profile.warehouse_id)
      .eq("is_active", true);

    // Получить отсканированные ячейки
    const { data: scannedCells } = await supabase
      .from("inventory_cell_counts")
      .select("cell_id")
      .eq("session_id", sessionId);

    const scannedCellIds = (scannedCells || []).map((c) => c.cell_id);
    const cellsScanned = scannedCellIds.length;

    // Получить данные по отсканированным ячейкам с деталями
    const { data: cellCounts } = await supabase
      .from("inventory_cell_counts")
      .select("cell_id")
      .eq("session_id", sessionId);

    const rows: Array<{
      cell: { id: string; code: string; cell_type: string };
      expectedCount: number;
      scannedCount: number;
      missingCount: number;
      extraCount: number;
      unknownCount: number;
    }> = [];

    let unitsExpectedTotal = 0;
    let unitsScannedTotal = 0;
    let cellsWithDiff = 0;

    if (cellCounts && cellCounts.length > 0) {
      const cellIdsForQuery = cellCounts.map((c) => c.cell_id);

      // Получить информацию о ячейках
      const { data: cells } = await supabase
        .from("warehouse_cells")
        .select("id, code, cell_type")
        .in("id", cellIdsForQuery);

      // Получить expected units (что должно быть в ячейках по БД)
      const { data: expectedUnits } = await supabase
        .from("units")
        .select("barcode, cell_id")
        .eq("warehouse_id", profile.warehouse_id)
        .in("cell_id", cellIdsForQuery);

      const expectedByCell = new Map<string, string[]>();
      if (expectedUnits) {
        expectedUnits.forEach((u) => {
          if (u.cell_id && u.barcode) {
            const existing = expectedByCell.get(u.cell_id) || [];
            existing.push(u.barcode);
            expectedByCell.set(u.cell_id, existing);
          }
        });
      }

      // Получить scanned units
      const { data: scannedUnits } = await supabase
        .from("inventory_cell_units")
        .select("unit_barcode, cell_id, unit_id")
        .eq("session_id", sessionId)
        .in("cell_id", cellIdsForQuery);

      const scannedByCell = new Map<string, Array<{ barcode: string; unit_id: string | null }>>();
      if (scannedUnits) {
        scannedUnits.forEach((u) => {
          if (u.cell_id && u.unit_barcode) {
            const existing = scannedByCell.get(u.cell_id) || [];
            existing.push({ barcode: u.unit_barcode, unit_id: u.unit_id });
            scannedByCell.set(u.cell_id, existing);
          }
        });
      }

      // Построить rows
      if (cells) {
        cells.forEach((cell) => {
          const expected = expectedByCell.get(cell.id) || [];
          const scanned = scannedByCell.get(cell.id) || [];

          const expectedSet = new Set(expected);
          const scannedBarcodes = scanned.map((s) => s.barcode);
          const scannedSet = new Set(scannedBarcodes);

          const missing = expected.filter((b) => !scannedSet.has(b));
          const extra = scannedBarcodes.filter((b) => !expectedSet.has(b));
          const unknown = scanned.filter((s) => !s.unit_id).map((s) => s.barcode);

          const hasDiff = missing.length > 0 || extra.length > 0 || unknown.length > 0;

          rows.push({
            cell: {
              id: cell.id,
              code: cell.code,
              cell_type: cell.cell_type,
            },
            expectedCount: expected.length,
            scannedCount: scanned.length,
            missingCount: missing.length,
            extraCount: extra.length,
            unknownCount: unknown.length,
            // Добавляем подробные списки для отчетности
            missing: missing,
            extra: extra,
            unknown: unknown,
          });

          unitsExpectedTotal += expected.length;
          unitsScannedTotal += scanned.length;
          if (hasDiff) {
            cellsWithDiff++;
          }
        });
      }
    }

    return NextResponse.json({
      ok: true,
      session: {
        id: session.id,
        status: session.status,
        started_at: session.started_at,
        closed_at: session.closed_at,
      },
      totals: {
        cellsTotal: cellsTotal || 0,
        cellsScanned,
        unitsExpectedTotal,
        unitsScannedTotal,
        cellsWithDiff,
      },
      rows,
    });
  } catch (e: any) {
    console.error("inventory/session-report error:", e);
    return NextResponse.json(
      { error: e?.message || "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
