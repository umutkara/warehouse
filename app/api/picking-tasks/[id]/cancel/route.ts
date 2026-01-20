import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/picking-tasks/[id]/cancel
 * Отменяет задачу OPS и возвращает все заказы в исходные ячейки
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await supabaseServer();

  try {
    // Await params для Next.js 15+
    const { id: taskId } = await params;

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("warehouse_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.warehouse_id) {
      return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
    }

    // Только OPS и Admin могут отменять задачи
    if (profile.role !== "ops" && profile.role !== "admin") {
      return NextResponse.json({ error: "Only OPS and Admin can cancel tasks" }, { status: 403 });
    }

    // Получить задачу (для админов не проверяем warehouse_id)
    let query = supabaseAdmin
      .from("picking_tasks")
      .select("*")
      .eq("id", taskId);
    
    // Для не-админов проверяем warehouse_id
    if (profile.role !== "admin") {
      query = query.eq("warehouse_id", profile.warehouse_id);
    }

    const { data: task, error: taskError } = await query.single();

    if (taskError || !task) {
      console.error("Task lookup error:", { taskId, taskError, warehouse_id: profile.warehouse_id, role: profile.role });
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Проверить что задача не завершена
    if (task.status === "done" || task.status === "canceled") {
      return NextResponse.json(
        { error: "Cannot cancel completed or already canceled task" },
        { status: 400 }
      );
    }

    // Получить все units в задаче
    const { data: taskUnits, error: unitsError } = await supabaseAdmin
      .from("picking_task_units")
      .select("unit_id, from_cell_id")
      .eq("picking_task_id", taskId);

    if (unitsError) {
      console.error("Error fetching task units:", unitsError);
      return NextResponse.json(
        { error: "Failed to fetch task units" },
        { status: 500 }
      );
    }

    // Вернуть каждый unit в исходную ячейку
    const movePromises = (taskUnits || []).map(async (tu) => {
      if (!tu.from_cell_id) {
        console.warn(`Unit ${tu.unit_id} has no from_cell_id, skipping`);
        return null;
      }

      // Обновить cell_id у unit
      const { error: updateError } = await supabaseAdmin
        .from("units")
        .update({ cell_id: tu.from_cell_id })
        .eq("id", tu.unit_id);

      if (updateError) {
        console.error(`Failed to move unit ${tu.unit_id}:`, updateError);
        return null;
      }

      // Записать в unit_moves
      const { error: moveError } = await supabaseAdmin
        .from("unit_moves")
        .insert({
          unit_id: tu.unit_id,
          to_cell_id: tu.from_cell_id,
          from_cell_id: task.target_picking_cell_id,
          actor_user_id: user.id,
          warehouse_id: profile.warehouse_id,
        });

      if (moveError) {
        console.error(`Failed to log unit move ${tu.unit_id}:`, moveError);
      }

      return tu.unit_id;
    });

    await Promise.all(movePromises);

    // Обновить статус задачи на 'canceled'
    const { error: cancelError } = await supabaseAdmin
      .from("picking_tasks")
      .update({ 
        status: "canceled",
      })
      .eq("id", taskId);

    if (cancelError) {
      console.error("Error canceling task:", cancelError);
      return NextResponse.json(
        { error: "Failed to cancel task" },
        { status: 500 }
      );
    }

    // Записать в audit log
    await supabaseAdmin.rpc("audit_log_event", {
      p_event_type: "picking_task_canceled",
      p_table_name: "picking_tasks",
      p_record_id: taskId,
      p_user_id: user.id,
      p_warehouse_id: profile.warehouse_id,
      p_changes: {
        task_id: taskId,
        status: "canceled",
        units_count: taskUnits?.length || 0,
        units_returned: true,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Task canceled successfully",
      units_returned: taskUnits?.length || 0,
    });

  } catch (e: any) {
    console.error("Cancel task error:", e);
    return NextResponse.json(
      { error: "Internal server error", details: e.message },
      { status: 500 }
    );
  }
}
