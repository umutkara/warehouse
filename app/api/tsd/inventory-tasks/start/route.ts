import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();

    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await req.json();
    const { taskId } = body;

    if (!taskId) {
      return NextResponse.json({ error: "taskId обязателен" }, { status: 400 });
    }

    // Check warehouse
    const { data: profile } = await supabase
      .from("profiles")
      .select("warehouse_id")
      .eq("id", authData.user.id)
      .single();

    if (!profile?.warehouse_id) {
      return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
    }

    // Resolve active inventory session via RPC (same source of truth as status/list)
    const { data: statusRpc, error: statusErr } = await supabase.rpc("inventory_status");
    if (statusErr) {
      return NextResponse.json({ error: "Ошибка проверки статуса инвентаризации" }, { status: 500 });
    }

    const statusResult = typeof statusRpc === "string" ? JSON.parse(statusRpc) : statusRpc;
    const sessionId = statusResult?.sessionId ?? statusResult?.session_id ?? null;
    const active = Boolean(statusResult?.active ?? statusResult?.inventory_active);
    if (!active || !sessionId) {
      return NextResponse.json({ error: "Инвентаризация не активна" }, { status: 409 });
    }

    // Resolve task via RPC task list to avoid direct inventory_cell_counts query (54001)
    const { data: tasksRpc, error: tasksErr } = await supabase.rpc("inventory_get_tasks", {
      p_session_id: sessionId,
    });
    if (tasksErr) {
      return NextResponse.json({ error: "Ошибка получения задания" }, { status: 500 });
    }

    const tasksResult = typeof tasksRpc === "string" ? JSON.parse(tasksRpc) : tasksRpc;
    const tasks = Array.isArray(tasksResult?.tasks) ? tasksResult.tasks : [];
    const task = tasks.find((t: any) => t.id === taskId);

    if (!task) {
      return NextResponse.json({ error: "Задание не найдено" }, { status: 404 });
    }

    // Check if task is pending
    if (task.status !== "pending") {
      return NextResponse.json(
        { error: "Задание уже выполнено" },
        { status: 409 }
      );
    }

    // Check if task is already locked by another user
    // Если scanned_by != текущий пользователь и это worker (не менеджер)
    // то задание занято
    const scannedBy = task.scannedBy ?? task.scanned_by ?? null;
    if (scannedBy && scannedBy !== authData.user.id) {
      const { data: lockedByProfile } = await supabase
        .from("profiles")
        .select("role, full_name")
        .eq("id", scannedBy)
        .single();

      // Если это worker - значит задание занято
      if (lockedByProfile && lockedByProfile.role === "worker") {
        return NextResponse.json(
          { error: `Задание уже взято другим складчиком: ${lockedByProfile.full_name}` },
          { status: 409 }
        );
      }
    }

    // Lock task for current user (update scanned_by)
    const { error: updateError } = await supabase
      .from("inventory_cell_counts")
      .update({
        scanned_by: authData.user.id,
      })
      .eq("id", taskId)
      .eq("status", "pending"); // Double-check status

    if (updateError) {
      console.error("Failed to lock task row (non-blocking):", updateError);
    }

    return NextResponse.json({
      ok: true,
      taskId: task.id,
      cellId: task.cellId ?? task.cell_id ?? null,
      cellCode: task.cellCode ?? task.cell_code ?? null,
      cellType: task.cellType ?? task.cell_type ?? null,
    });
  } catch (e: any) {
    console.error("tsd/inventory-tasks/start error:", e);
    return NextResponse.json(
      { error: e?.message || "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
