import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/stats/shipping-tasks-sla
 * Returns SLA statistics for shipping tasks (OPS → TSD completion)
 * Query params: period=today|yesterday|all
 */
export async function GET(req: Request) {
  const supabase = await supabaseServer();

  try {
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

    // Get period from query params
    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "today"; // today, yesterday, all

    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    if (period === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    } else if (period === "yesterday") {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0);
      endDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59);
    } else {
      // all - last 30 days
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      endDate = now;
    }

    // Get all shipping/picking tasks created in the period
    const { data: allTasks } = await supabaseAdmin
      .from("picking_tasks")
      .select(`
        id,
        status,
        created_at,
        picked_at,
        completed_at,
        units!inner (
          barcode
        )
      `)
      .eq("warehouse_id", profile.warehouse_id)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: false });

    if (!allTasks || allTasks.length === 0) {
      return NextResponse.json({
        ok: true,
        metrics: {
          period,
          total_tasks: 0,
          open_tasks: 0,
          in_progress_tasks: 0,
          completed_tasks: 0,
          avg_completion_time_hours: 0,
          avg_completion_time_minutes: 0,
          avg_current_wait_time_hours: 0,
          avg_current_wait_time_minutes: 0,
          min_time_hours: 0,
          max_time_hours: 0,
        },
        tasks: [],
      });
    }

    // Process tasks
    const completedTasks: any[] = [];
    const openTasks: any[] = [];
    const inProgressTasks: any[] = [];
    const completionTimes: number[] = [];
    const currentWaitTimes: number[] = [];

    for (const task of allTasks) {
      const createdTime = new Date(task.created_at).getTime();
      const nowTime = now.getTime();
      
      let timeInHours = 0;
      let completionTime: Date | null = null;

      if (task.status === "done" || task.completed_at) {
        // Task is completed
        completionTime = task.completed_at ? new Date(task.completed_at) : 
                         task.picked_at ? new Date(task.picked_at) : null;
        
        if (completionTime) {
          const diffMs = completionTime.getTime() - createdTime;
          timeInHours = diffMs / (1000 * 60 * 60);
          completionTimes.push(timeInHours);
          const unitBarcode = Array.isArray(task.units) 
            ? task.units[0]?.barcode 
            : (task.units as any)?.barcode;
          
          completedTasks.push({
            id: task.id,
            barcode: unitBarcode || "Unknown",
            status: task.status,
            created_at: task.created_at,
            completed_at: completionTime.toISOString(),
            time_hours: timeInHours,
          });
        }
      } else {
        // Task is still open or in progress
        const diffMs = nowTime - createdTime;
        timeInHours = diffMs / (1000 * 60 * 60);
        currentWaitTimes.push(timeInHours);

        const unitBarcode = Array.isArray(task.units) 
          ? task.units[0]?.barcode 
          : (task.units as any)?.barcode;
        
        const taskData = {
          id: task.id,
          barcode: unitBarcode || "Unknown",
          status: task.status,
          created_at: task.created_at,
          time_hours: timeInHours,
        };

        if (task.status === "open") {
          openTasks.push(taskData);
        } else if (task.status === "in_progress") {
          inProgressTasks.push(taskData);
        }
      }
    }

    // Calculate averages
    const avgCompletionTime = completionTimes.length > 0
      ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
      : 0;

    const avgCurrentWaitTime = currentWaitTimes.length > 0
      ? currentWaitTimes.reduce((a, b) => a + b, 0) / currentWaitTimes.length
      : 0;

    const allTimes = [...completionTimes, ...currentWaitTimes];
    const minTime = allTimes.length > 0 ? Math.min(...allTimes) : 0;
    const maxTime = allTimes.length > 0 ? Math.max(...allTimes) : 0;

    return NextResponse.json({
      ok: true,
      metrics: {
        period,
        total_tasks: allTasks.length,
        open_tasks: openTasks.length,
        in_progress_tasks: inProgressTasks.length,
        completed_tasks: completedTasks.length,
        avg_completion_time_hours: Math.floor(avgCompletionTime),
        avg_completion_time_minutes: Math.floor((avgCompletionTime % 1) * 60),
        avg_current_wait_time_hours: Math.floor(avgCurrentWaitTime),
        avg_current_wait_time_minutes: Math.floor((avgCurrentWaitTime % 1) * 60),
        min_time_hours: Math.floor(minTime),
        max_time_hours: Math.floor(maxTime),
      },
      tasks: {
        open: openTasks,
        in_progress: inProgressTasks,
        completed: completedTasks,
      },
    });
  } catch (e: any) {
    console.error("Shipping tasks SLA error:", e);
    return NextResponse.json(
      { error: "Internal server error", details: e.message },
      { status: 500 }
    );
  }
}
