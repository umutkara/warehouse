import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/ops/merchant-rejections/list
 * Returns merchant rejection cases:
 * - active: units currently in rejected cells
 * - archived: units with merchant_rejection_ticket outside rejected
 * - all: active + archived
 * Query: scope=all|active|archived, ticket_status=all|open|resolved, age=all|24h|48h|7d, sort=age_desc|age_asc|created_desc|created_asc
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

    const allowedRoles = ["ops", "logistics", "manager", "head", "admin"];
    if (!profile.role || !allowedRoles.includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") || "all";
    const ticketStatus = url.searchParams.get("ticket_status") || "all";
    const ageFilter = url.searchParams.get("age") || "all";
    const sortBy = url.searchParams.get("sort") || "created_desc";

    if (!["all", "active", "archived"].includes(scope)) {
      return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
    }

    // Paginate to get all units (PostgREST default limit 1000)
    const pageSize = 1000;
    let allUnits: any[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: page, error: unitsError } = await supabaseAdmin
        .from("units")
        .select("id, barcode, status, product_name, partner_name, price, created_at, meta, cell_id")
        .eq("warehouse_id", profile.warehouse_id)
        .order("created_at", { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (unitsError) {
        console.error("Merchant rejections list error:", unitsError);
        return NextResponse.json(
          { error: "Failed to load merchant rejections", details: unitsError.message },
          { status: 500 }
        );
      }
      if (!page?.length) break;
      allUnits = allUnits.concat(page);
      hasMore = page.length === pageSize;
      offset += pageSize;
    }

    const cellIds = [...new Set(allUnits.map((u: any) => u.cell_id).filter(Boolean))];
    const cellsMap = new Map<string, { code: string; cell_type: string }>();
    if (cellIds.length > 0) {
      const batch = 200;
      for (let i = 0; i < cellIds.length; i += batch) {
        const chunk = cellIds.slice(i, i + batch);
        const { data: cells } = await supabaseAdmin
          .from("warehouse_cells_map")
          .select("id, code, cell_type")
          .eq("warehouse_id", profile.warehouse_id)
          .in("id", chunk);
        cells?.forEach((c: any) => cellsMap.set(c.id, { code: c.code, cell_type: c.cell_type }));
      }
    }

    const baseUnits = allUnits.filter((unit: any) => {
      const cell = unit.cell_id ? cellsMap.get(unit.cell_id) : null;
      const isRejectedNow = cell?.cell_type === "rejected";
      const hasTicket = Boolean(unit.meta?.merchant_rejection_ticket);

      if (scope === "active") return isRejectedNow;
      if (scope === "archived") return !isRejectedNow && hasTicket;
      return isRejectedNow || hasTicket;
    });

    // stay_start for age_hours (reset after return)
    const unitIds = baseUnits.map((u: any) => u.id);
    const lastReturnedAtByUnitId = new Map<string, string>();
    if (unitIds.length > 0) {
      for (let i = 0; i < unitIds.length; i += 100) {
        const chunk = unitIds.slice(i, i + 100);
        const { data: rows } = await supabaseAdmin
          .from("outbound_shipments")
          .select("unit_id, returned_at")
          .eq("warehouse_id", profile.warehouse_id)
          .eq("status", "returned")
          .in("unit_id", chunk)
          .not("returned_at", "is", null)
          .order("returned_at", { ascending: false });
        rows?.forEach((r: any) => {
          if (!r.unit_id || !r.returned_at) return;
          const prev = lastReturnedAtByUnitId.get(r.unit_id);
          if (!prev || new Date(r.returned_at) > new Date(prev)) {
            lastReturnedAtByUnitId.set(r.unit_id, r.returned_at);
          }
        });
      }
    }

    const now = new Date();
    let processedUnits = baseUnits.map((unit: any) => {
      const meta = unit.meta || {};
      const rejectionCount = meta.merchant_rejection_count || 0;
      const rejections = meta.merchant_rejections || [];
      const lastRejection = rejections[rejections.length - 1];
      const ticket = meta.merchant_rejection_ticket || null;
      const cell = unit.cell_id ? cellsMap.get(unit.cell_id) : null;
      const caseState = cell?.cell_type === "rejected" ? "active" : "archived";
      const stayStart = lastReturnedAtByUnitId.get(unit.id) || unit.created_at;
      const ageHours = Math.floor((now.getTime() - new Date(stayStart).getTime()) / (1000 * 60 * 60));

      return {
        id: unit.id,
        barcode: unit.barcode,
        status: unit.status,
        product_name: unit.product_name,
        partner_name: unit.partner_name,
        price: unit.price,
        cell_code: cell?.code ?? null,
        cell_type: cell?.cell_type ?? null,
        case_state: caseState,
        created_at: unit.created_at,
        age_hours: ageHours,
        rejection_count: rejectionCount,
        last_rejection: lastRejection
          ? { rejected_at: lastRejection.rejected_at, scenario: lastRejection.scenario, courier_name: lastRejection.courier_name }
          : null,
        ticket: ticket
          ? { created: true, ticket_id: ticket.ticket_id, status: ticket.status, created_at: ticket.created_at, resolved_at: ticket.resolved_at, notes: ticket.notes }
          : { created: false, ticket_id: null, status: null },
      };
    });

    if (ticketStatus === "open") {
      processedUnits = processedUnits.filter((u: any) => u.ticket.created && u.ticket.status !== "resolved");
    } else if (ticketStatus === "resolved") {
      processedUnits = processedUnits.filter((u: any) => u.ticket.created && u.ticket.status === "resolved");
    }

    if (ageFilter !== "all") {
      const thresholdHours = ageFilter === "24h" ? 24 : ageFilter === "48h" ? 48 : 168;
      processedUnits = processedUnits.filter((u: any) => (u.age_hours ?? 0) >= thresholdHours);
    }

    if (sortBy === "age_desc") {
      processedUnits.sort((a: any, b: any) => (b.age_hours ?? 0) - (a.age_hours ?? 0));
    } else if (sortBy === "age_asc") {
      processedUnits.sort((a: any, b: any) => (a.age_hours ?? 0) - (b.age_hours ?? 0));
    } else if (sortBy === "created_asc") {
      processedUnits.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else {
      processedUnits.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return NextResponse.json({
      ok: true,
      units: processedUnits,
      total: processedUnits.length,
    });
  } catch (e: any) {
    console.error("Get merchant rejections error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
