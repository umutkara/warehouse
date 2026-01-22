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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/units/[unitId]/history/route.ts:61',message:'Before querying picking_task_units',data:{unitId,warehouseId:profile.warehouse_id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    const { data: taskUnits, error: taskUnitsError } = await supabaseAdmin
      .from("picking_task_units")
      .select("picking_task_id")
      .eq("unit_id", unitId);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/units/[unitId]/history/route.ts:65',message:'After querying picking_task_units',data:{hasError:!!taskUnitsError,error:taskUnitsError?.message,foundCount:taskUnits?.length||0,taskUnits:taskUnits},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

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

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/units/[unitId]/history/route.ts:84',message:'Collected task IDs',data:{taskIdsCount:taskIds.length,legacyTaskIdsCount:legacyTaskIds.length,allTaskIdsCount:allTaskIds.length,allTaskIds},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    console.log(`[History] Unit ${unitId}: Found ${taskIds.length} tasks via picking_task_units, ${legacyTaskIds.length} via legacy, total: ${allTaskIds.length}`);
    console.log(`[History] Task IDs:`, allTaskIds);

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

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/units/[unitId]/history/route.ts:94',message:'Tasks loaded from DB (all warehouses)',data:{requestedCount:allTaskIds.length,loadedCount:tasksData?.length||0,userWarehouseId:profile.warehouse_id,requestedTaskIds:allTaskIds,foundTaskIds:tasksData?.map(t=>t.id)||[],tasks:tasksData?.map(t=>({id:t.id,status:t.status,warehouse_id:t.warehouse_id,warehouseMatch:t.warehouse_id===profile.warehouse_id}))||[]},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
      // #endregion

      // Filter by warehouse_id (only if tasks exist)
      if (tasksData && tasksData.length > 0) {
        tasks = tasksData.filter((t) => t.warehouse_id === profile.warehouse_id);
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/units/[unitId]/history/route.ts:111',message:'After filtering by warehouse_id',data:{beforeFilter:tasksData.length,afterFilter:tasks.length,warehouseId:profile.warehouse_id,filteredOut:tasksData.length-tasks.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
      } else {
        // Tasks don't exist in picking_tasks (orphaned picking_task_units records)
        console.warn(`[History] Warning: Found ${allTaskIds.length} task IDs in picking_task_units, but ${tasksData?.length || 0} tasks exist in picking_tasks. Orphaned records detected.`);
        tasks = [];
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/units/[unitId]/history/route.ts:120',message:'Orphaned picking_task_units detected',data:{taskIdsInJunction:allTaskIds.length,tasksInDB:tasksData?.length||0,orphanedTaskIds:allTaskIds},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
      }
      
      console.log(`[History] Loaded ${tasks.length} tasks after warehouse filter (warehouse_id: ${profile.warehouse_id})`);
      
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
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/units/[unitId]/history/route.ts:133',message:'Before converting tasks to events',data:{tasksCount:tasks.length,tasks:tasks.map(t=>({id:t.id,status:t.status}))},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    
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

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f5ccbc71-df7f-4deb-9f63-55a71444d072',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/units/[unitId]/history/route.ts:199',message:'Final history before return',data:{existingCount:existingHistory.length,taskEventsCount:taskEvents.length,totalCount:allHistory.length,taskEventTypes:taskEvents.map(e=>e.event_type),allEventTypes:allHistory.map(e=>e.event_type)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
    // #endregion

    console.log(`[History] Final: ${existingHistory.length} existing events + ${taskEvents.length} task events = ${allHistory.length} total`);

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
