import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/units/[unitId]/history
 * Returns comprehensive history of unit movements and events
 * Includes picking tasks information (created, canceled, completed)
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ unitId: string }> | { unitId: string } }
) {
  const supabase = await supabaseServer();
  
  // Await params for Next.js App Router compatibility
  const resolvedParams = await params;
  const unitId = resolvedParams.unitId;

  try {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("warehouse_id")
      .eq("id", userData.user.id)
      .single();

    if (!profile?.warehouse_id) {
      return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
    }

    // Call RPC function to get comprehensive history
    const { data: historyData, error: historyError } = await supabase.rpc(
      "get_unit_history",
      { p_unit_id: unitId }
    );

    if (historyError) {
      console.error("History RPC error:", historyError);
      return NextResponse.json(
        { error: "Failed to load history", details: historyError.message },
        { status: 500 }
      );
    }

    // Check if RPC returned an error
    if (historyData && !historyData.ok) {
      console.error("History RPC returned error:", historyData);
      return NextResponse.json(
        { error: historyData.error || "Failed to load history" },
        { status: 400 }
      );
    }

    // Load picking tasks for this unit
    // Check both new format (picking_task_units) and legacy (unit_id)
    const { data: taskUnits, error: taskUnitsError } = await supabaseAdmin
      .from("picking_task_units")
      .select("picking_task_id")
      .eq("unit_id", unitId);

    if (taskUnitsError) {
      console.error("Error loading picking_task_units:", taskUnitsError);
    }

    const taskIds = taskUnits?.map((tu) => tu.picking_task_id) || [];

    // Also check legacy unit_id field
    const { data: legacyTasks, error: legacyTasksError } = await supabaseAdmin
      .from("picking_tasks")
      .select("id")
      .eq("unit_id", unitId)
      .not("unit_id", "is", null);

    if (legacyTasksError) {
      console.error("Error loading legacy picking_tasks:", legacyTasksError);
    }

    const legacyTaskIds = legacyTasks?.map((t) => t.id) || [];
    const allTaskIds = [...new Set([...taskIds, ...legacyTaskIds])];

    // Get all tasks with full information
    let tasks: any[] = [];
    let cellCodesMap = new Map<string, string>();
    
    if (allTaskIds.length > 0) {
      // Load tasks - check if they exist at all (orphaned picking_task_units records)
      const { data: tasksData, error: tasksDataError } = await supabaseAdmin
        .from("picking_tasks")
        .select(`
          id,
          status,
          scenario,
          created_at,
          created_by_name,
          canceled_at,
          canceled_by,
          completed_at,
          completed_by,
          target_picking_cell_id,
          warehouse_id
        `)
        .in("id", allTaskIds)
        .order("created_at", { ascending: false });

      if (tasksDataError) {
        console.error("[History] Error loading tasks:", tasksDataError);
      }

      // Filter by warehouse_id (only if tasks exist)
      if (tasksData && tasksData.length > 0) {
        tasks = tasksData.filter((t) => t.warehouse_id === profile.warehouse_id);
      } else {
        // Tasks don't exist in picking_tasks (orphaned picking_task_units records)
        console.warn(`[History] Warning: Found ${allTaskIds.length} task IDs in picking_task_units, but ${tasksData?.length || 0} tasks exist in picking_tasks. Orphaned records detected.`);
        tasks = [];
      }
      
      // Get cell codes for all target cells
      const targetCellIds = tasks
        .map((t) => t.target_picking_cell_id)
        .filter((id): id is string => !!id);
      
      if (targetCellIds.length > 0) {
        const { data: cellsData } = await supabaseAdmin
          .from("warehouse_cells")
          .select("id, code")
          .in("id", targetCellIds);
        
        if (cellsData) {
          cellsData.forEach((cell: any) => {
            cellCodesMap.set(cell.id, cell.code);
          });
        }
      }
    }

    // Convert tasks to history events
    // For canceled/done tasks, create TWO events: creation + cancellation/completion
    const taskEvents: any[] = [];

    tasks.forEach((task) => {
      const targetCellCode = task.target_picking_cell_id 
        ? (cellCodesMap.get(task.target_picking_cell_id) || "?")
        : "?";
      
      const baseDetails = {
        task_id: task.id,
        scenario: task.scenario || null,
        target_cell: targetCellCode,
        created_at: task.created_at,
        created_by_name: task.created_by_name,
      };
      
      // Always add creation event (even for canceled/done tasks)
      taskEvents.push({
        event_type: "picking_task_created",
        created_at: task.created_at,
        details: {
          ...baseDetails,
          status: task.status,
        },
      });
      
      // Add cancellation event if task was canceled
      if (task.status === "canceled" && task.canceled_at) {
        taskEvents.push({
          event_type: "picking_task_canceled",
          created_at: task.canceled_at,
          details: {
            ...baseDetails,
            canceled_at: task.canceled_at,
            canceled_by: task.canceled_by,
          },
        });
      }
      
      // Add completion event if task was completed
      if (task.status === "done" && task.completed_at) {
        taskEvents.push({
          event_type: "picking_task_completed",
          created_at: task.completed_at,
          details: {
            ...baseDetails,
            completed_at: task.completed_at,
            completed_by: task.completed_by,
          },
        });
      }
    });

    // Merge task events with existing history and sort by date
    const existingHistory = historyData?.history || [];
    const allHistory = [...existingHistory, ...taskEvents];
    allHistory.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA; // Newest first
    });

    return NextResponse.json({
      ok: true,
      unit: historyData?.unit || null,
      history: allHistory,
    });
  } catch (e: any) {
    console.error("Get history error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
