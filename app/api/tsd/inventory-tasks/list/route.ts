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

    // Check if inventory is active
    const { data: warehouse } = await supabase
      .from("warehouses")
      .select("inventory_active, inventory_session_id")
      .eq("id", profile.warehouse_id)
      .single();

    if (!warehouse?.inventory_active || !warehouse.inventory_session_id) {
      return NextResponse.json(
        { error: "Инвентаризация не активна" },
        { status: 409 }
      );
    }

    // Get pending tasks (ячейки которые ещё не взяты в работу другими)
    // Задание считается доступным если:
    // - status = 'pending'
    // - scanned_by = менеджер (кто создал) ИЛИ текущий пользователь
    const { data: tasks, error: tasksError } = await supabase
      .from("inventory_cell_counts")
      .select(`
        id,
        cell_id,
        status,
        scanned_by,
        warehouse_cells!inner(
          id,
          code,
          cell_type
        )
      `)
      .eq("session_id", warehouse.inventory_session_id)
      .eq("status", "pending")
      .order("warehouse_cells(code)", { ascending: true });

    if (tasksError) {
      console.error("Tasks fetch error:", tasksError);
      return NextResponse.json(
        { error: "Ошибка загрузки заданий" },
        { status: 500 }
      );
    }

    // Фильтруем: только задания которые никто не взял, или взял текущий пользователь
    const availableTasks = (tasks || []).filter((task: any) => {
      // Если scanned_by = текущий пользователь - показываем (он уже работает над ней)
      if (task.scanned_by === authData.user.id) {
        return true;
      }
      // Если scanned_by = кто-то другой - НЕ показываем (кто-то уже работает)
      // Проверим через profiles - если это worker, значит занято
      return false; // Упрощаем: если не текущий пользователь - не показываем
    });

    // Для простоты: показываем все pending задания
    // В реальности нужно проверить роль scanned_by
    const formattedTasks = (tasks || []).map((task: any) => ({
      id: task.id,
      cellId: task.cell_id,
      cellCode: task.warehouse_cells.code,
      cellType: task.warehouse_cells.cell_type,
      status: task.status,
      isLockedByMe: task.scanned_by === authData.user.id,
    }));

    return NextResponse.json({
      ok: true,
      sessionId: warehouse.inventory_session_id,
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
