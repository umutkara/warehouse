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

    // Get task
    const { data: task, error: taskError } = await supabase
      .from("inventory_cell_counts")
      .select(`
        id,
        session_id,
        cell_id,
        status,
        scanned_by,
        warehouse_id,
        warehouse_cells!inner(
          id,
          code,
          cell_type,
          warehouse_id
        )
      `)
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      return NextResponse.json({ error: "Задание не найдено" }, { status: 404 });
    }

    // Check warehouse
    const { data: profile } = await supabase
      .from("profiles")
      .select("warehouse_id")
      .eq("id", authData.user.id)
      .single();

    const warehouseCell = Array.isArray(task.warehouse_cells) 
      ? task.warehouse_cells[0] 
      : task.warehouse_cells;
    
    if (!profile || profile.warehouse_id !== warehouseCell?.warehouse_id) {
      return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
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
    if (task.scanned_by && task.scanned_by !== authData.user.id) {
      const { data: lockedByProfile } = await supabase
        .from("profiles")
        .select("role, full_name")
        .eq("id", task.scanned_by)
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
      console.error("Failed to lock task:", updateError);
      return NextResponse.json(
        { error: "Не удалось взять задание в работу" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      taskId: task.id,
      cellId: task.cell_id,
      cellCode: warehouseCell?.code,
      cellType: warehouseCell?.cell_type,
    });
  } catch (e: any) {
    console.error("tsd/inventory-tasks/start error:", e);
    return NextResponse.json(
      { error: e?.message || "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
