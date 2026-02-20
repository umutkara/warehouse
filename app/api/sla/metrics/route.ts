import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolvePeriodRange } from "@/app/api/stats/_shared";

/**
 * GET /api/sla/metrics
 * Returns SLA metrics and statistics. All period-based metrics use daily window (00:00–23:59 UTC).
 * - Всего заказов: actual count, all cells excluding picking (no 1000 cap).
 * - Залежалые: >24h, excluding rejected, picking, shipped, out.
 * - Среднее время обработки: receipt → shipment, today.
 * - Процент возвратов / OUT / picking: today.
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
    const { startDate: startOfDay, endDate: endOfDay } = resolvePeriodRange("today", now);

    // 1. Total units: actual count, exclude picking (no 1000 cap)
    const { count: totalUnitsCount } = await supabaseAdmin
      .from("units")
      .select("id", { count: "exact", head: true })
      .eq("warehouse_id", profile.warehouse_id)
      .neq("status", "picking");

    // 2. Залежалые (>24h): exclude rejected, picking, shipped, out; use count
    const { count: oldUnitsCount } = await supabaseAdmin
      .from("units")
      .select("id", { count: "exact", head: true })
      .eq("warehouse_id", profile.warehouse_id)
      .lt("created_at", twentyFourHoursAgo.toISOString())
      .neq("status", "shipped")
      .neq("status", "out")
      .neq("status", "rejected")
      .neq("status", "picking");

    // 3. Top-10 oldest units (exclude rejected)
    const { data: topOldUnits } = await supabaseAdmin
      .from("units")
      .select("barcode, status, created_at")
      .eq("warehouse_id", profile.warehouse_id)
      .lt("created_at", twentyFourHoursAgo.toISOString())
      .neq("status", "shipped")
      .neq("status", "out")
      .neq("status", "rejected")
      .neq("status", "picking")
      .order("created_at", { ascending: true })
      .limit(10);

    // 4. Old units sample for age_distribution (optional, keep small)
    const { data: oldUnitsForStats } = await supabaseAdmin
      .from("units")
      .select("status, created_at")
      .eq("warehouse_id", profile.warehouse_id)
      .lt("created_at", twentyFourHoursAgo.toISOString())
      .neq("status", "shipped")
      .neq("status", "out")
      .neq("status", "rejected")
      .neq("status", "picking")
      .limit(500);

    const oldUnitsByStatus: Record<string, number> = {};
    (oldUnitsForStats || []).forEach(u => {
      oldUnitsByStatus[u.status] = (oldUnitsByStatus[u.status] || 0) + 1;
    });

    const unitsByStatus: Record<string, number> = {};
    const ageDistribution = {
      under_1h: 0,
      "1_6h": 0,
      "6_12h": 0,
      "12_24h": 0,
      "24_48h": 0,
      over_48h: 0,
    };
    (oldUnitsForStats || []).forEach(u => {
      const ageHours = (now.getTime() - new Date(u.created_at).getTime()) / (1000 * 60 * 60);
      if (ageHours < 24) ageDistribution["12_24h"]++;
      else if (ageHours < 48) ageDistribution["24_48h"]++;
      else ageDistribution.over_48h++;
    });

    // 5. Average processing time: receipt (unit created_at) → shipment (out_at), daily window
    const pageSize = 1000;
    let outOffset = 0;
    const allOutToday: { unit_id: string; out_at: string }[] = [];
    let hasMore = true;
    while (hasMore) {
      const { data: page } = await supabaseAdmin
        .from("outbound_shipments")
        .select("unit_id, out_at")
        .eq("warehouse_id", profile.warehouse_id)
        .gte("out_at", startOfDay.toISOString())
        .lte("out_at", endOfDay.toISOString())
        .range(outOffset, outOffset + pageSize - 1);
      if (!page?.length) break;
      allOutToday.push(...page);
      hasMore = page.length === pageSize;
      outOffset += pageSize;
    }

    const processingTimes: number[] = [];
    if (allOutToday.length > 0) {
      const unitIds = [...new Set(allOutToday.map(s => s.unit_id))];
      const unitCreatedById = new Map<string, string>();
      for (let i = 0; i < unitIds.length; i += 200) {
        const chunk = unitIds.slice(i, i + 200);
        const { data: units } = await supabaseAdmin
          .from("units")
          .select("id, created_at")
          .in("id", chunk);
        (units || []).forEach(u => unitCreatedById.set(u.id, u.created_at));
      }
      allOutToday.forEach(s => {
        const createdAt = unitCreatedById.get(s.unit_id);
        if (createdAt) {
          const created = new Date(createdAt).getTime();
          const out = new Date(s.out_at).getTime();
          const hours = (out - created) / (1000 * 60 * 60);
          if (hours > 0 && hours < 1000) processingTimes.push(hours);
        }
      });
    }
    const avgProcessingTime = processingTimes.length > 0
      ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
      : 0;

    // 6. OUT shipments today: total and returned (counts)
    const { count: outTotalCount } = await supabaseAdmin
      .from("outbound_shipments")
      .select("id", { count: "exact", head: true })
      .eq("warehouse_id", profile.warehouse_id)
      .gte("out_at", startOfDay.toISOString())
      .lte("out_at", endOfDay.toISOString());
    const { count: outReturnedCount } = await supabaseAdmin
      .from("outbound_shipments")
      .select("id", { count: "exact", head: true })
      .eq("warehouse_id", profile.warehouse_id)
      .gte("out_at", startOfDay.toISOString())
      .lte("out_at", endOfDay.toISOString())
      .eq("status", "returned");

    const totalShipments = outTotalCount ?? 0;
    const returnedShipments = outReturnedCount ?? 0;
    const returnRate = totalShipments > 0 ? (returnedShipments / totalShipments) * 100 : 0;

    // 7. Picking tasks today: total and completed (counts)
    const { count: pickingTotalCount } = await supabaseAdmin
      .from("picking_tasks")
      .select("id", { count: "exact", head: true })
      .eq("warehouse_id", profile.warehouse_id)
      .gte("created_at", startOfDay.toISOString())
      .lte("created_at", endOfDay.toISOString());
    const { count: pickingDoneCount } = await supabaseAdmin
      .from("picking_tasks")
      .select("id", { count: "exact", head: true })
      .eq("warehouse_id", profile.warehouse_id)
      .gte("created_at", startOfDay.toISOString())
      .lte("created_at", endOfDay.toISOString())
      .eq("status", "done");

    const pickingTotalTasks = pickingTotalCount ?? 0;
    const pickingCompletedTasks = pickingDoneCount ?? 0;

    // Picking avg time: fetch tasks for today (paginate) to compute avg
    let pickOffset = 0;
    const taskTimes: number[] = [];
    hasMore = true;
    while (hasMore) {
      const { data: pickingPage } = await supabaseAdmin
        .from("picking_tasks")
        .select("created_at, completed_at, status")
        .eq("warehouse_id", profile.warehouse_id)
        .gte("created_at", startOfDay.toISOString())
        .lte("created_at", endOfDay.toISOString())
        .range(pickOffset, pickOffset + pageSize - 1);
      if (!pickingPage?.length) break;
      pickingPage.forEach(t => {
        if (t.created_at && t.completed_at) {
          const hours = (new Date(t.completed_at).getTime() - new Date(t.created_at).getTime()) / (1000 * 60 * 60);
          if (hours > 0 && hours < 100) taskTimes.push(hours);
        }
      });
      hasMore = pickingPage.length === pageSize;
      pickOffset += pageSize;
    }
    const avgTaskTime = taskTimes.length > 0
      ? taskTimes.reduce((a, b) => a + b, 0) / taskTimes.length
      : 0;

    const topOldestUnits = (topOldUnits || []).map(u => ({
      barcode: u.barcode,
      status: u.status,
      age_hours: Math.floor((now.getTime() - new Date(u.created_at).getTime()) / (1000 * 60 * 60)),
      created_at: u.created_at,
    }));

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
        // Summary (daily 00:00–23:59 UTC where applicable)
        total_units: totalUnitsCount ?? 0,
        units_over_24h: oldUnitsCount ?? 0,
        avg_processing_time_hours: Math.round(avgProcessingTime * 10) / 10,
        
        // Kept for compatibility (sections removed from UI)
        units_by_status: unitsByStatus,
        old_units_by_status: oldUnitsByStatus,
        
        // OUT (today)
        out_total_shipments: totalShipments,
        out_returned_shipments: returnedShipments,
        out_return_rate_percent: Math.round(returnRate * 10) / 10,
        
        // Picking (today)
        picking_avg_time_hours: Math.round(avgTaskTime * 10) / 10,
        picking_total_tasks: pickingTotalTasks,
        picking_completed_tasks: pickingCompletedTasks,
        
        // Top issues (rejected excluded)
        top_oldest_units: topOldestUnits,
        
        age_distribution: ageDistribution,
        bin_cells: binStats,
      },
    });
  } catch (e: any) {
    console.error("SLA metrics error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
