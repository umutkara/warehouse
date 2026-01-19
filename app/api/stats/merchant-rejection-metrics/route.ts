import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/stats/merchant-rejection-metrics
 * Returns merchant rejection statistics
 * Query params: rejection_count=2|3|all
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

    // Get rejection_count filter from query params
    const url = new URL(req.url);
    const rejectionCountParam = url.searchParams.get("rejection_count"); // 2, 3, all

    // Get all units with merchant rejections
    const { data: allUnits } = await supabaseAdmin
      .from("units")
      .select("id, barcode, status, created_at, meta, cell_id")
      .eq("warehouse_id", profile.warehouse_id);

    const unitsWithRejections = (allUnits || []).filter((unit: any) => {
      const meta = unit.meta || {};
      return meta.merchant_rejection_count && meta.merchant_rejection_count > 0;
    });

    // Filter by rejection count if specified
    let filteredUnits = unitsWithRejections;
    if (rejectionCountParam === "2") {
      filteredUnits = unitsWithRejections.filter((u: any) => u.meta?.merchant_rejection_count === 2);
    } else if (rejectionCountParam === "3") {
      filteredUnits = unitsWithRejections.filter((u: any) => u.meta?.merchant_rejection_count >= 3);
    }

    // Get bin cells
    const { data: binCells } = await supabaseAdmin
      .from("warehouse_cells")
      .select("id, code")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("cell_type", "bin");

    const binCellIds = (binCells || []).map(c => c.id);

    // Get unit moves to bin cells
    const unitIds = filteredUnits.map((u: any) => u.id);
    
    if (unitIds.length === 0) {
      return NextResponse.json({
        ok: true,
        metrics: {
          total_units: 0,
          avg_bin_to_ticket_hours: 0,
          avg_bin_to_ticket_minutes: 0,
          avg_ticket_resolution_hours: 0,
          avg_ticket_resolution_minutes: 0,
          units_with_tickets: 0,
          units_resolved: 0,
        },
        units: [],
      });
    }

    const { data: unitMovesToBin } = await supabaseAdmin
      .from("unit_moves")
      .select("unit_id, to_cell_id, created_at")
      .in("unit_id", unitIds)
      .in("to_cell_id", binCellIds)
      .order("created_at", { ascending: true });

    // Process metrics
    const binToTicketTimes: number[] = [];
    const ticketResolutionTimes: number[] = [];
    let unitsWithTickets = 0;
    let unitsResolved = 0;

    const unitsData = filteredUnits.map((unit: any) => {
      const meta = unit.meta || {};
      const ticket = meta.merchant_rejection_ticket;
      const rejectionCount = meta.merchant_rejection_count || 0;
      const rejections = meta.merchant_rejections || [];

      // Find first move to bin
      const firstBinMove = (unitMovesToBin || []).find((m: any) => m.unit_id === unit.id);
      let binToTicketHours = null;
      let ticketResolutionHours = null;

      if (ticket) {
        unitsWithTickets++;
        
        if (ticket.status === "resolved") {
          unitsResolved++;
        }

        // Calculate bin to ticket time
        if (firstBinMove && ticket.created_at) {
          const binTime = new Date(firstBinMove.created_at).getTime();
          const ticketTime = new Date(ticket.created_at).getTime();
          const diffMs = ticketTime - binTime;
          
          if (diffMs > 0) {
            const diffHours = diffMs / (1000 * 60 * 60);
            binToTicketTimes.push(diffHours);
            binToTicketHours = diffHours;
          }
        }

        // Calculate ticket resolution time
        if (ticket.status === "resolved" && ticket.created_at && ticket.resolved_at) {
          const createdTime = new Date(ticket.created_at).getTime();
          const resolvedTime = new Date(ticket.resolved_at).getTime();
          const diffMs = resolvedTime - createdTime;
          
          if (diffMs > 0) {
            const diffHours = diffMs / (1000 * 60 * 60);
            ticketResolutionTimes.push(diffHours);
            ticketResolutionHours = diffHours;
          }
        }
      }

      return {
        id: unit.id,
        barcode: unit.barcode,
        status: unit.status,
        rejection_count: rejectionCount,
        has_ticket: !!ticket,
        ticket_status: ticket?.status || null,
        ticket_created_at: ticket?.created_at || null,
        ticket_resolved_at: ticket?.resolved_at || null,
        bin_to_ticket_hours: binToTicketHours,
        ticket_resolution_hours: ticketResolutionHours,
        last_rejection: rejections[rejections.length - 1] || null,
      };
    });

    const avgBinToTicket = binToTicketTimes.length > 0
      ? binToTicketTimes.reduce((a, b) => a + b, 0) / binToTicketTimes.length
      : 0;

    const avgTicketResolution = ticketResolutionTimes.length > 0
      ? ticketResolutionTimes.reduce((a, b) => a + b, 0) / ticketResolutionTimes.length
      : 0;

    return NextResponse.json({
      ok: true,
      metrics: {
        total_units: filteredUnits.length,
        avg_bin_to_ticket_hours: Math.floor(avgBinToTicket),
        avg_bin_to_ticket_minutes: Math.floor((avgBinToTicket % 1) * 60),
        avg_ticket_resolution_hours: Math.floor(avgTicketResolution),
        avg_ticket_resolution_minutes: Math.floor((avgTicketResolution % 1) * 60),
        units_with_tickets: unitsWithTickets,
        units_resolved: unitsResolved,
      },
      units: unitsData,
    });
  } catch (e: any) {
    console.error("Merchant rejection metrics error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
