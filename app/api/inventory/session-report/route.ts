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

    // Получить sessionId из query или из текущей/последней сессии
    const url = new URL(req.url);
    let sessionId = url.searchParams.get("sessionId");

    if (!sessionId) {
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

    // Проверить, что session принадлежит warehouse
    let session: any = null;
    const { data: sessionWithUsers, error: sessionWithUsersError } = await supabase
      .from("inventory_sessions")
      .select("id, status, started_at, closed_at, warehouse_id, started_by, closed_by")
      .eq("id", sessionId)
      .single();
    if (sessionWithUsersError) {
      const { data: sessionFallback, error: sessionFallbackError } = await supabase
        .from("inventory_sessions")
        .select("id, status, started_at, closed_at, warehouse_id")
        .eq("id", sessionId)
        .single();
      if (sessionFallbackError || !sessionFallback) {
        return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
      }
      session = sessionFallback;
    } else {
      session = sessionWithUsers;
    }

    if (session.warehouse_id !== profile.warehouse_id) {
      return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
    }

    const participantIds = [session.started_by, session.closed_by].filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    const participantsById = new Map<string, string>();
    if (participantIds.length > 0) {
      const { data: participants } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", Array.from(new Set(participantIds)));
      (participants || []).forEach((p: { id: string; full_name: string | null }) => {
        participantsById.set(p.id, p.full_name || p.id);
      });
    }

    // Используем RPC, чтобы не упираться в прямой SELECT inventory_cell_counts и RLS edge cases.
    const { data: tasksRpc, error: tasksRpcError } = await supabase.rpc("inventory_get_tasks", {
      p_session_id: sessionId,
    });
    if (tasksRpcError) {
      return NextResponse.json(
        { error: tasksRpcError.message || "Ошибка получения задач сессии" },
        { status: 500 },
      );
    }
    const tasksResult = typeof tasksRpc === "string" ? JSON.parse(tasksRpc) : tasksRpc;
    if (!tasksResult?.ok) {
      return NextResponse.json(
        { error: tasksResult?.error || "Ошибка получения задач сессии" },
        { status: 500 },
      );
    }
    const tasks = Array.isArray(tasksResult?.tasks) ? tasksResult.tasks : [];

    const normalizedTasks = tasks
      .map((task: any) => ({
        id: task.id,
        cellId: task.cellId ?? task.cell_id ?? null,
        cellCode: task.cellCode ?? task.cell_code ?? null,
        cellType: task.cellType ?? task.cell_type ?? null,
        status: task.status ?? null,
        scannedBy: task.scannedBy ?? task.scanned_by ?? null,
        scannedByName: task.scannedByName ?? task.scanned_by_name ?? null,
        scannedAt: task.scannedAt ?? task.scanned_at ?? null,
      }))
      .filter((task: any) => task.cellId && task.cellCode);

    const cellIdsForQuery = Array.from(new Set(normalizedTasks.map((task: any) => task.cellId)));
    const scannerIds = Array.from(
      new Set(
        normalizedTasks
          .map((task: any) => task.scannedBy)
          .filter((v: any): v is string => typeof v === "string" && v.length > 0),
      ),
    );
    if (scannerIds.length > 0) {
      const { data: scanners } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", scannerIds);
      (scanners || []).forEach((p: { id: string; full_name: string | null }) => {
        participantsById.set(p.id, p.full_name || p.id);
      });
    }

    const rows: Array<{
      taskId: string;
      cell: { id: string; code: string; cell_type: string };
      status: string;
      scannedBy: string | null;
      scannedByName: string | null;
      scannedAt: string | null;
      expectedCount: number;
      scannedCount: number;
      missingCount: number;
      lostCount: number;
      extraCount: number;
      unknownCount: number;
      scanned: string[];
      missing: string[];
      lost: string[];
      extra: string[];
      unknown: string[];
    }> = [];

    let unitsExpectedTotal = 0;
    let unitsScannedTotal = 0;
    let cellsWithDiff = 0;

    if (cellIdsForQuery.length > 0) {
      const { data: expectedUnits } = await supabase
        .from("units")
        .select("barcode, cell_id")
        .eq("warehouse_id", profile.warehouse_id)
        .in("cell_id", cellIdsForQuery);

      const expectedByCell = new Map<string, string[]>();
      (expectedUnits || []).forEach((u: { barcode: string | null; cell_id: string | null }) => {
        if (!u.cell_id || !u.barcode) return;
        const list = expectedByCell.get(u.cell_id) || [];
        list.push(u.barcode);
        expectedByCell.set(u.cell_id, list);
      });

      const { data: scannedUnits } = await supabase
        .from("inventory_cell_units")
        .select("unit_barcode, cell_id, unit_id")
        .eq("session_id", sessionId)
        .in("cell_id", cellIdsForQuery);

      const scannedByCell = new Map<string, Array<{ barcode: string; unit_id: string | null }>>();
      (scannedUnits || []).forEach(
        (u: { unit_barcode: string | null; cell_id: string | null; unit_id: string | null }) => {
          if (!u.cell_id || !u.unit_barcode) return;
          const list = scannedByCell.get(u.cell_id) || [];
          list.push({ barcode: u.unit_barcode, unit_id: u.unit_id });
          scannedByCell.set(u.cell_id, list);
        },
      );

      normalizedTasks.forEach((task: any) => {
        const expected = expectedByCell.get(task.cellId) || [];
        const scanned = scannedByCell.get(task.cellId) || [];

        const expectedSet = new Set(expected);
        const scannedBarcodes = scanned.map((s) => s.barcode);
        const scannedSet = new Set(scannedBarcodes);

        const missing = expected.filter((b) => !scannedSet.has(b));
        const extra = scannedBarcodes.filter((b) => !expectedSet.has(b));
        const unknown = scanned.filter((s) => !s.unit_id).map((s) => s.barcode);
        const lost = missing;
        const hasDiff = missing.length > 0 || extra.length > 0 || unknown.length > 0;

        const scannedByName =
          task.scannedByName ||
          (task.scannedBy ? participantsById.get(task.scannedBy) || task.scannedBy : null);

        rows.push({
          taskId: task.id,
          cell: {
            id: task.cellId,
            code: task.cellCode,
            cell_type: task.cellType || "unknown",
          },
          status: task.status || "pending",
          scannedBy: task.scannedBy,
          scannedByName,
          scannedAt: task.scannedAt,
          expectedCount: expected.length,
          scannedCount: scannedBarcodes.length,
          missingCount: missing.length,
          lostCount: lost.length,
          extraCount: extra.length,
          unknownCount: unknown.length,
          scanned: scannedBarcodes,
          missing,
          lost,
          extra,
          unknown,
        });

        unitsExpectedTotal += expected.length;
        unitsScannedTotal += scannedBarcodes.length;
        if (hasDiff) cellsWithDiff++;
      });
    }

    const cellsTotal = normalizedTasks.length;
    const cellsScanned = normalizedTasks.filter((task: any) => task.status === "scanned").length;

    return NextResponse.json({
      ok: true,
      session: {
        id: session.id,
        status: session.status,
        started_at: session.started_at,
        closed_at: session.closed_at,
        started_by: session.started_by ?? null,
        started_by_name:
          typeof session.started_by === "string"
            ? participantsById.get(session.started_by) || session.started_by
            : null,
        closed_by: session.closed_by ?? null,
        closed_by_name:
          typeof session.closed_by === "string"
            ? participantsById.get(session.closed_by) || session.closed_by
            : null,
      },
      totals: {
        cellsTotal,
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
