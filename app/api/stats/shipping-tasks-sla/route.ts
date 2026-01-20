import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/stats/shipping-tasks-sla
 * Returns SLA statistics for shipping tasks (OPS → TSD → Picking)
 * Считает время от создания задачи OPS до завершения в ТСД и помещения в picking
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
      // Use UTC to avoid timezone issues
      startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
      endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));
    } else if (period === "yesterday") {
      // Use UTC for yesterday
      const yesterdayUTC = new Date(now);
      yesterdayUTC.setUTCDate(yesterdayUTC.getUTCDate() - 1);
      startDate = new Date(Date.UTC(yesterdayUTC.getUTCFullYear(), yesterdayUTC.getUTCMonth(), yesterdayUTC.getUTCDate(), 0, 0, 0));
      endDate = new Date(Date.UTC(yesterdayUTC.getUTCFullYear(), yesterdayUTC.getUTCMonth(), yesterdayUTC.getUTCDate(), 23, 59, 59));
    } else {
      // all - last 30 days
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      endDate = now;
    }

    // Get all shipping/picking tasks created in the period
    const { data: allTasks } = await supabaseAdmin
      .from("picking_tasks")
      .select("id, status, created_at, picked_at, completed_at, unit_id")
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

    // Get task units from new structure (picking_task_units)
    const taskIds = allTasks.map(t => t.id);
    const { data: taskUnitsData } = await supabaseAdmin
      .from("picking_task_units")
      .select("picking_task_id, unit_id")
      .in("picking_task_id", taskIds);

    // Build map: taskId -> unitIds[]
    const taskToUnitsMap = new Map<string, string[]>();
    (taskUnitsData || []).forEach((tu: any) => {
      if (!taskToUnitsMap.has(tu.picking_task_id)) {
        taskToUnitsMap.set(tu.picking_task_id, []);
      }
      taskToUnitsMap.get(tu.picking_task_id)!.push(tu.unit_id);
    });

    // Collect all unit_ids (from old structure and new structure)
    const allUnitIds = new Set<string>();
    allTasks.forEach(t => {
      // Old structure: unit_id field
      if (t.unit_id) {
        allUnitIds.add(t.unit_id);
      }
      // New structure: picking_task_units
      const unitsInTask = taskToUnitsMap.get(t.id);
      if (unitsInTask) {
        unitsInTask.forEach(uid => allUnitIds.add(uid));
      }
    });

    const unitIds = Array.from(allUnitIds);

    // Get units data for barcodes
    const { data: unitsData } = await supabaseAdmin
      .from("units")
      .select("id, barcode")
      .in("id", unitIds);

    const unitBarcodeMap = new Map<string, string>();
    (unitsData || []).forEach((u: any) => {
      unitBarcodeMap.set(u.id, u.barcode);
    });

    // Process tasks
    const completedTasks: any[] = [];
    const openTasks: any[] = [];
    const inProgressTasks: any[] = [];
    const completionTimes: number[] = [];
    const currentWaitTimes: number[] = [];

    for (const task of allTasks) {
      const createdTime = new Date(task.created_at).getTime();
      const nowTime = now.getTime();
      
      // Get barcode for this task (from old or new structure)
      let unitBarcode = "Unknown";
      if (task.unit_id) {
        unitBarcode = unitBarcodeMap.get(task.unit_id) || "Unknown";
      } else {
        const unitsInTask = taskToUnitsMap.get(task.id);
        if (unitsInTask && unitsInTask.length > 0) {
          unitBarcode = unitBarcodeMap.get(unitsInTask[0]) || "Unknown";
        }
      }
      
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
          
          completedTasks.push({
            id: task.id,
            barcode: unitBarcode,
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
        
        const taskData = {
          id: task.id,
          barcode: unitBarcode,
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

    // Calculate detailed statistics
    const avgCompletionTime = completionTimes.length > 0
      ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
      : 0;

    const avgCurrentWaitTime = currentWaitTimes.length > 0
      ? currentWaitTimes.reduce((a, b) => a + b, 0) / currentWaitTimes.length
      : 0;

    const minTime = completionTimes.length > 0 ? Math.min(...completionTimes) : 0;
    const maxTime = completionTimes.length > 0 ? Math.max(...completionTimes) : 0;

    // Calculate percentiles for completed tasks
    const sortedTimes = [...completionTimes].sort((a, b) => a - b);
    const p50 = sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length * 0.5)] : 0;
    const p90 = sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length * 0.9)] : 0;
    const p95 = sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length * 0.95)] : 0;

    // SLA thresholds (можно настроить)
    const slaTargetHours = 2; // Целевое время - 2 часа
    const slaCriticalHours = 4; // Критическое время - 4 часа
    
    const tasksWithinSLA = completionTimes.filter(t => t <= slaTargetHours).length;
    const tasksExceedingSLA = completionTimes.filter(t => t > slaTargetHours && t <= slaCriticalHours).length;
    const tasksCritical = completionTimes.filter(t => t > slaCriticalHours).length;

    // Hourly distribution (for today)
    const hourlyStats: Record<number, { count: number; avgTime: number }> = {};
    if (period === "today") {
      completedTasks.forEach(task => {
        const hour = new Date(task.completed_at).getUTCHours();
        if (!hourlyStats[hour]) {
          hourlyStats[hour] = { count: 0, avgTime: 0 };
        }
        hourlyStats[hour].count++;
      });
    }

    return NextResponse.json({
      ok: true,
      metrics: {
        period,
        // Общие метрики
        total_tasks: allTasks.length,
        open_tasks: openTasks.length,
        in_progress_tasks: inProgressTasks.length,
        completed_tasks: completedTasks.length,
        
        // Средние значения
        avg_completion_time_hours: Math.floor(avgCompletionTime),
        avg_completion_time_minutes: Math.round((avgCompletionTime % 1) * 60),
        avg_current_wait_time_hours: Math.floor(avgCurrentWaitTime),
        avg_current_wait_time_minutes: Math.round((avgCurrentWaitTime % 1) * 60),
        
        // Мин/Макс
        min_time_hours: Math.floor(minTime),
        min_time_minutes: Math.round((minTime % 1) * 60),
        max_time_hours: Math.floor(maxTime),
        max_time_minutes: Math.round((maxTime % 1) * 60),
        
        // Процентили
        p50_hours: Math.floor(p50),
        p50_minutes: Math.round((p50 % 1) * 60),
        p90_hours: Math.floor(p90),
        p90_minutes: Math.round((p90 % 1) * 60),
        p95_hours: Math.floor(p95),
        p95_minutes: Math.round((p95 % 1) * 60),
        
        // SLA метрики
        sla_target_hours: slaTargetHours,
        sla_critical_hours: slaCriticalHours,
        tasks_within_sla: tasksWithinSLA,
        tasks_exceeding_sla: tasksExceedingSLA,
        tasks_critical: tasksCritical,
        sla_compliance_percent: completionTimes.length > 0 
          ? Math.round((tasksWithinSLA / completionTimes.length) * 100) 
          : 0,
        
        // Почасовая статистика (только для today)
        hourly_distribution: period === "today" ? hourlyStats : null,
      },
      tasks: {
        completed: completedTasks.slice(0, 20), // Увеличил с 10 до 20
        open: openTasks.slice(0, 20),
        in_progress: inProgressTasks.slice(0, 20),
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
