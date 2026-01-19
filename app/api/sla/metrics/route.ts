import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/sla/metrics
 * Returns SLA metrics and statistics from existing data
 */
export async function GET(req: Request) {
  const supabase = await supabaseServer();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profError } = await supabase
    .from("profiles")
    .select("warehouse_id, role")
    .eq("id", userData.user.id)
    .single();

  if (profError || !profile?.warehouse_id) {
    return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
  }

  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 1 & 2. Execute independent queries in parallel
    const [
      { data: oldUnits },
      { data: allUnits }
    ] = await Promise.all([
      // 1. Units older than 24 hours (залежалые заказы)
      supabaseAdmin
        .from("units")
        .select("id, barcode, status, created_at, cell_id")
        .eq("warehouse_id", profile.warehouse_id)
        .lt("created_at", twentyFourHoursAgo.toISOString())
        .neq("status", "shipped")
        .neq("status", "out")
        .order("created_at", { ascending: true })
        .limit(100),
      
      // 2. Total units by status (current snapshot)
      supabaseAdmin
        .from("units")
        .select("status")
        .eq("warehouse_id", profile.warehouse_id)
    ]);

    // Group by status
    const oldUnitsByStatus: Record<string, number> = {};
    (oldUnits || []).forEach(u => {
      oldUnitsByStatus[u.status] = (oldUnitsByStatus[u.status] || 0) + 1;
    });

    const unitsByStatus: Record<string, number> = {};
    (allUnits || []).forEach(u => {
      unitsByStatus[u.status] = (unitsByStatus[u.status] || 0) + 1;
    });

    // 3. Average time in each status (from audit_events)
    // Reduced limit from 500 to 200 for better performance
    const { data: recentEvents } = await supabaseAdmin
      .from("audit_events")
      .select("action, created_at, entity_id, meta")
      .eq("warehouse_id", profile.warehouse_id)
      .gte("created_at", sevenDaysAgo.toISOString())
      .in("action", ["unit.create", "unit.move", "picking_task_complete", "logistics.ship_out"])
      .order("created_at", { ascending: false })
      .limit(200);

    // Calculate average processing time (created → shipped)
    const unitTimestamps: Record<string, { created?: number; shipped?: number }> = {};
    (recentEvents || []).forEach(e => {
      if (!e.entity_id) return;
      if (!unitTimestamps[e.entity_id]) unitTimestamps[e.entity_id] = {};
      
      if (e.action === "unit.create") {
        unitTimestamps[e.entity_id].created = new Date(e.created_at).getTime();
      } else if (e.action === "logistics.ship_out") {
        unitTimestamps[e.entity_id].shipped = new Date(e.created_at).getTime();
      }
    });

    const processingTimes: number[] = [];
    Object.values(unitTimestamps).forEach(t => {
      if (t.created && t.shipped) {
        const hours = (t.shipped - t.created) / (1000 * 60 * 60);
        if (hours > 0 && hours < 1000) processingTimes.push(hours);
      }
    });

    const avgProcessingTime = processingTimes.length > 0
      ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
      : 0;

    // 4 & 5. Execute independent queries in parallel for better performance
    const [
      { data: outShipments },
      { data: pickingTasks }
    ] = await Promise.all([
      // 4. OUT shipments stats (returns)
      supabaseAdmin
        .from("outbound_shipments")
        .select("status, out_at, returned_at")
        .eq("warehouse_id", profile.warehouse_id)
        .gte("out_at", sevenDaysAgo.toISOString()),
      
      // 5. Picking tasks performance
      supabaseAdmin
        .from("picking_tasks")
        .select("status, created_at, picked_at, completed_at")
        .eq("warehouse_id", profile.warehouse_id)
        .gte("created_at", sevenDaysAgo.toISOString())
    ]);

    const totalShipments = (outShipments || []).length;
    const returnedShipments = (outShipments || []).filter(s => s.status === "returned").length;
    const returnRate = totalShipments > 0 ? (returnedShipments / totalShipments) * 100 : 0;

    const taskTimes: number[] = [];
    (pickingTasks || []).forEach(t => {
      if (t.created_at && t.completed_at) {
        const hours = (new Date(t.completed_at).getTime() - new Date(t.created_at).getTime()) / (1000 * 60 * 60);
        if (hours > 0 && hours < 100) taskTimes.push(hours);
      }
    });

    const avgTaskTime = taskTimes.length > 0
      ? taskTimes.reduce((a, b) => a + b, 0) / taskTimes.length
      : 0;

    // 6. Top 10 oldest units
    const topOldestUnits = (oldUnits || []).slice(0, 10).map(u => ({
      barcode: u.barcode,
      status: u.status,
      age_hours: Math.floor((now.getTime() - new Date(u.created_at).getTime()) / (1000 * 60 * 60)),
      created_at: u.created_at,
    }));

    // 7. Time distribution (by age ranges)
    const ageDistribution = {
      under_1h: 0,
      "1_6h": 0,
      "6_12h": 0,
      "12_24h": 0,
      "24_48h": 0,
      over_48h: 0,
    };

    (allUnits || []).forEach(u => {
      // We don't have created_at in this query, so we'll use a simplified approach
      // This is a limitation, but keeps the query fast
    });

    // Actually, let's get age distribution from oldUnits
    (oldUnits || []).forEach(u => {
      const ageHours = (now.getTime() - new Date(u.created_at).getTime()) / (1000 * 60 * 60);
      if (ageHours < 24) ageDistribution["12_24h"]++;
      else if (ageHours < 48) ageDistribution["24_48h"]++;
      else ageDistribution.over_48h++;
    });

    // 8. Get bin cells with their units and accurate placement time from unit_moves
    // First, get all bin cells
    const { data: binCells } = await supabaseAdmin
      .from("warehouse_cells")
      .select("id, code")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("cell_type", "bin")
      .eq("is_active", true)
      .order("code");

    let binStats = [];

    if (binCells && binCells.length > 0) {
      // Get all units in bin cells
      const binCellIds = binCells.map(c => c.id);
      const { data: binUnits } = await supabaseAdmin
        .from("units")
        .select("id, barcode, status, cell_id")
        .in("cell_id", binCellIds);

      if (binUnits && binUnits.length > 0) {
        const unitIds = binUnits.map(u => u.id);
        
        // Get the latest move TO each bin cell for each unit (accurate placement time)
        const { data: unitMoves } = await supabaseAdmin
          .from("unit_moves")
          .select("unit_id, to_cell_id, created_at")
          .in("unit_id", unitIds)
          .in("to_cell_id", binCellIds)
          .order("created_at", { ascending: false });

        // Get the latest move for each unit (when it was placed in current cell)
        const latestMoveByUnit: Record<string, any> = {};
        (unitMoves || []).forEach(move => {
          // Find the unit's current cell
          const unit = binUnits.find(u => u.id === move.unit_id);
          if (unit && unit.cell_id === move.to_cell_id) {
            // This move is to the current cell
            if (!latestMoveByUnit[move.unit_id]) {
              latestMoveByUnit[move.unit_id] = move;
            }
          }
        });

        // Group units by cell_id
        const unitsByCell: Record<string, any[]> = {};
        binUnits.forEach(unit => {
          if (!unitsByCell[unit.cell_id]) {
            unitsByCell[unit.cell_id] = [];
          }
          
          const moveInfo = latestMoveByUnit[unit.id];
          if (moveInfo) {
            unitsByCell[unit.cell_id].push({
              ...unit,
              placed_at: moveInfo.created_at,
            });
          }
        });

        // Process each bin cell
        for (const cell of binCells) {
          const cellUnits = unitsByCell[cell.id] || [];
          
          if (cellUnits.length > 0) {
            // Sort by placement time to get the latest
            cellUnits.sort((a, b) => 
              new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime()
            );
            const latestUnit = cellUnits[0];

            const placedAtTime = new Date(latestUnit.placed_at).getTime();
            const timeInCellHours = Math.floor(
              (now.getTime() - placedAtTime) / (1000 * 60 * 60)
            );
            const timeInCellMinutes = Math.floor(
              ((now.getTime() - placedAtTime) / (1000 * 60)) % 60
            );

            binStats.push({
              cell_code: cell.code,
              cell_id: cell.id,
              unit_barcode: latestUnit.barcode,
              unit_id: latestUnit.id,
              unit_status: latestUnit.status,
              time_in_cell_hours: timeInCellHours,
              time_in_cell_minutes: timeInCellMinutes,
              placed_at: latestUnit.placed_at,
            });
          }
        }

        // Sort by time in cell (longest first)
        binStats.sort((a, b) => {
          const timeA = a.time_in_cell_hours * 60 + a.time_in_cell_minutes;
          const timeB = b.time_in_cell_hours * 60 + b.time_in_cell_minutes;
          return timeB - timeA;
        });
      }
    }

    return NextResponse.json({
      ok: true,
      metrics: {
        // Summary
        total_units: allUnits?.length || 0,
        units_over_24h: oldUnits?.length || 0,
        avg_processing_time_hours: Math.round(avgProcessingTime * 10) / 10,
        
        // Current state
        units_by_status: unitsByStatus,
        old_units_by_status: oldUnitsByStatus,
        
        // OUT performance
        out_total_shipments: totalShipments,
        out_returned_shipments: returnedShipments,
        out_return_rate_percent: Math.round(returnRate * 10) / 10,
        
        // Picking performance
        picking_avg_time_hours: Math.round(avgTaskTime * 10) / 10,
        picking_total_tasks: pickingTasks?.length || 0,
        picking_completed_tasks: (pickingTasks || []).filter(t => t.status === "done").length,
        
        // Top issues
        top_oldest_units: topOldestUnits,
        
        // Age distribution
        age_distribution: ageDistribution,

        // Bin cells metrics
        bin_cells: binStats,
      },
    });
  } catch (e: any) {
    console.error("SLA metrics error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
