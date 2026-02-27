import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await supabaseServer();

    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Get profile and warehouse_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("warehouse_id")
      .eq("id", authData.user.id)
      .single();

    if (!profile?.warehouse_id) {
      return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
    }

    // Use the same source of truth as /api/inventory/status
    const { data: statusRpc, error: statusErr } = await supabase.rpc("inventory_status");
    if (statusErr) {
      return NextResponse.json(
        { error: "Ошибка статуса инвентаризации" },
        { status: 500 }
      );
    }

    const statusResult =
      typeof statusRpc === "string" ? JSON.parse(statusRpc) : statusRpc;
    const inventoryActive = Boolean(
      statusResult?.active ?? (statusResult as any)?.inventory_active
    );
    const inventorySessionId =
      statusResult?.sessionId ?? (statusResult as any)?.session_id ?? null;

    if (!inventoryActive || !inventorySessionId) {
      return NextResponse.json(
        { error: "Инвентаризация не активна" },
        { status: 409 }
      );
    }

    // Use inventory_get_tasks RPC (same path as /api/inventory/tasks) to avoid
    // direct inventory_cell_counts reads that can trigger recursive policy issues.
    const { data: tasksRpc, error: tasksRpcError } = await supabase.rpc(
      "inventory_get_tasks",
      { p_session_id: inventorySessionId }
    );

    if (tasksRpcError) {
      return NextResponse.json(
        { error: "Ошибка загрузки заданий" },
        { status: 500 }
      );
    }

    const tasksResult = typeof tasksRpc === "string" ? JSON.parse(tasksRpc) : tasksRpc;
    if (!tasksResult?.ok) {
      return NextResponse.json(
        { error: tasksResult?.error || "Ошибка загрузки заданий" },
        { status: 500 }
      );
    }

    const tasks = Array.isArray(tasksResult?.tasks) ? tasksResult.tasks : [];

    const formattedTasks = tasks.map((task: any) => {
      const cellId = task.cellId ?? task.cell_id ?? null;
      const cellCode = task.cellCode ?? task.cell_code ?? null;
      const cellType = task.cellType ?? task.cell_type ?? null;
      const scannedBy = task.scannedBy ?? task.scanned_by ?? null;

      return {
        id: task.id,
        cellId,
        cellCode,
        cellType,
        status: task.status,
        isLockedByMe: scannedBy === authData.user.id,
      };
    });

    return NextResponse.json({
      ok: true,
      sessionId: inventorySessionId,
      tasks: formattedTasks,
    });
  } catch (e: any) {
    console.error("tsd/inventory-tasks/list error:", e);
    return NextResponse.json(
      { error: e?.message || "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
