import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/stats/processing-metrics
 * Returns processing time statistics
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

    // Get picking tasks created in the period
    const { data: pickingTasks } = await supabaseAdmin
      .from("picking_tasks")
      .select("id, unit_id, created_at")
      .eq("warehouse_id", profile.warehouse_id)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString());

    if (!pickingTasks || pickingTasks.length === 0) {
      return NextResponse.json({
        ok: true,
        metrics: {
          period,
          total_tasks: 0,
          avg_processing_time_hours: 0,
          avg_processing_time_minutes: 0,
          min_time_hours: 0,
          max_time_hours: 0,
          tasks_count: 0,
        },
      });
    }

    // Get unit_ids from both old (unit_id) and new (picking_task_units) structure
    const taskIds = pickingTasks.map(t => t.id);
    
    // Get units from new structure (picking_task_units)
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
    pickingTasks.forEach(t => {
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

    if (unitIds.length === 0) {
      return NextResponse.json({
        ok: true,
        metrics: {
          period,
          total_tasks: pickingTasks.length,
          avg_processing_time_hours: 0,
          avg_processing_time_minutes: 0,
          min_time_hours: 0,
          max_time_hours: 0,
          tasks_count: 0,
        },
      });
    }

    // Get unit_moves to storage/shipping cells for these units
    const { data: cells } = await supabaseAdmin
      .from("warehouse_cells")
      .select("id, code, cell_type")
      .eq("warehouse_id", profile.warehouse_id)
      .in("cell_type", ["storage", "shipping"]);

    const storageCellIds = (cells || []).map(c => c.id);

    if (storageCellIds.length === 0) {
      return NextResponse.json({
        ok: true,
        metrics: {
          period,
          total_tasks: pickingTasks.length,
          avg_processing_time_hours: 0,
          avg_processing_time_minutes: 0,
          min_time_hours: 0,
          max_time_hours: 0,
          tasks_count: 0,
        },
      });
    }

    // Get moves TO storage/shipping cells for these units
    const { data: unitMoves } = await supabaseAdmin
      .from("unit_moves")
      .select("unit_id, to_cell_id, created_at")
      .in("unit_id", unitIds)
      .in("to_cell_id", storageCellIds)
      .order("created_at", { ascending: true });

    // Calculate processing times
    const processingTimes: number[] = [];

    for (const task of pickingTasks) {
      // Find first move to storage/shipping for this unit
      const firstMove = (unitMoves || []).find(m => m.unit_id === task.unit_id);
      
      if (firstMove) {
        const moveTime = new Date(firstMove.created_at).getTime();
        const taskTime = new Date(task.created_at).getTime();
        const diffMs = taskTime - moveTime;
        
        if (diffMs > 0) {
          const diffHours = diffMs / (1000 * 60 * 60);
          processingTimes.push(diffHours);
        }
      }
    }

    if (processingTimes.length === 0) {
      return NextResponse.json({
        ok: true,
        metrics: {
          period,
          total_tasks: pickingTasks.length,
          avg_processing_time_hours: 0,
          avg_processing_time_minutes: 0,
          min_time_hours: 0,
          max_time_hours: 0,
          tasks_count: 0,
        },
      });
    }

    const avgHours = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
    const minHours = Math.min(...processingTimes);
    const maxHours = Math.max(...processingTimes);

    return NextResponse.json({
      ok: true,
      metrics: {
        period,
        total_tasks: pickingTasks.length,
        avg_processing_time_hours: Math.floor(avgHours),
        avg_processing_time_minutes: Math.floor((avgHours % 1) * 60),
        min_time_hours: Math.floor(minHours),
        max_time_hours: Math.floor(maxHours),
        tasks_count: processingTimes.length,
      },
    });
  } catch (e: any) {
    console.error("Processing metrics error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
