import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasAnyRole } from "@/app/api/_shared/role-access";

export const dynamic = "force-dynamic";

/**
 * GET /api/ops/merchant-rejections/list
 * Returns merchant rejection cases:
 * - active: units currently in rejected cells
 * - archived: units with merchant_rejection_ticket outside rejected
 * - all: active + archived
 * Query: scope=all|active|archived, ticket_status=all|open|resolved, age=all|24h|48h|7d, sort=age_desc|age_asc|created_desc|created_asc, page, page_size
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
    const warehouseId = profile.warehouse_id;

    const allowedRoles = ["ops", "logistics", "manager", "head", "admin", "compliance"];
    if (!profile.role || !hasAnyRole(profile.role, allowedRoles)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") || "all";
    const ticketStatus = url.searchParams.get("ticket_status") || "all";
    const ageFilter = url.searchParams.get("age") || "all";
    const sortBy = url.searchParams.get("sort") || "created_desc";
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const queryPageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("page_size") || 30)));
    const ageThresholdHours = ageFilter === "24h" ? 24 : ageFilter === "48h" ? 48 : ageFilter === "7d" ? 168 : null;
    const ageThresholdIso =
      ageThresholdHours != null
        ? new Date(Date.now() - ageThresholdHours * 60 * 60 * 1000).toISOString()
        : null;
    const requiresPostProcessingPagination =
      ageFilter !== "all" || sortBy === "age_desc" || sortBy === "age_asc";

    if (!["all", "active", "archived"].includes(scope)) {
      return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
    }
    // Resolve rejected cells once (used in scope filtering)
    const { data: rejectedCells, error: rejectedCellsError } = await supabaseAdmin
      .from("warehouse_cells_map")
      .select("id")
      .eq("warehouse_id", warehouseId)
      .eq("cell_type", "rejected");

    if (rejectedCellsError) {
      console.error("Merchant rejections rejected-cells error:", rejectedCellsError);
      return NextResponse.json(
        { error: "Failed to load merchant rejections", details: rejectedCellsError.message },
        { status: 500 }
      );
    }

    const rejectedCellIds = (rejectedCells || []).map((c: any) => c.id).filter(Boolean);
    const rejectedIdsCsv = rejectedCellIds.join(",");
    function applyScopeAndTicketFilters(query: any) {
      let q = query.eq("warehouse_id", warehouseId);

      if (scope === "active") {
        if (rejectedCellIds.length === 0) {
          // No rejected cells means no active cases.
          q = q.eq("id", "__never__");
        } else {
          q = q.in("cell_id", rejectedCellIds);
        }
      } else if (scope === "archived") {
        if (rejectedCellIds.length > 0) {
          q = q.not("cell_id", "in", `(${rejectedIdsCsv})`);
        }
        q = q.not("meta->merchant_rejection_ticket", "is", null);
      } else {
        // all = active OR archived(has ticket)
        if (rejectedCellIds.length > 0) {
          q = q.or(`cell_id.in.(${rejectedIdsCsv}),meta->merchant_rejection_ticket.not.is.null`);
        } else {
          q = q.not("meta->merchant_rejection_ticket", "is", null);
        }
      }

      if (ticketStatus === "open") {
        q = q
          .not("meta->merchant_rejection_ticket", "is", null)
          .eq("meta->merchant_rejection_ticket->>status", "open");
      } else if (ticketStatus === "resolved") {
        q = q
          .not("meta->merchant_rejection_ticket", "is", null)
          .or("meta->merchant_rejection_ticket->>status.eq.resolved,meta->merchant_rejection_ticket->>status.eq.partner_rejected");
      }

      return q;
    }

    const selectColumns = "id, barcode, status, product_name, partner_name, price, created_at, meta, cell_id";
    const from = (page - 1) * queryPageSize;
    const to = from + queryPageSize - 1;

    let baseUnits: any[] = [];
    let total = 0;

    // Fast path: DB-level pagination is safe only for created_at sorting without age filtering.
    if (!requiresPostProcessingPagination) {
      const unitsQuery = applyScopeAndTicketFilters(
        supabaseAdmin.from("units").select(selectColumns, { count: "exact" }),
      )
        .order(sortBy.startsWith("created_") ? "created_at" : "created_at", {
          ascending: sortBy === "created_asc",
        })
        .range(from, to);

      const { data: unitsPage, count, error: unitsError } = await unitsQuery;
      if (unitsError) {
        console.error("Merchant rejections list error:", unitsError);
        return NextResponse.json(
          { error: "Failed to load merchant rejections", details: unitsError.message },
          { status: 500 }
        );
      }
      baseUnits = unitsPage || [];
      total = count || 0;
    } else {
      // Fallback keeps exact age-filter behavior and accurate age sorting by evaluating full matched set.
      const fetchPageSize = 1000;
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        let unitsQuery = applyScopeAndTicketFilters(
          supabaseAdmin.from("units").select(selectColumns),
        );
        if (ageThresholdIso) {
          // age_hours is based on stay_start (>= created_at), so this is a strict prefilter.
          unitsQuery = unitsQuery.lte("created_at", ageThresholdIso);
        }
        unitsQuery = unitsQuery
          .order("created_at", { ascending: false })
          .range(offset, offset + fetchPageSize - 1);
        const { data: chunk, error: unitsError } = await unitsQuery;
        if (unitsError) {
          console.error("Merchant rejections list fallback error:", unitsError);
          return NextResponse.json(
            { error: "Failed to load merchant rejections", details: unitsError.message },
            { status: 500 }
          );
        }
        if (!chunk?.length) break;
        baseUnits.push(...chunk);
        hasMore = chunk.length === fetchPageSize;
        offset += fetchPageSize;
      }
    }

    const cellIds = [...new Set(baseUnits.map((u: any) => u.cell_id).filter(Boolean))];
    const cellsMap = new Map<string, { code: string; cell_type: string }>();
    if (cellIds.length > 0) {
      const batch = 200;
      for (let i = 0; i < cellIds.length; i += batch) {
        const chunk = cellIds.slice(i, i + batch);
        const { data: cells } = await supabaseAdmin
          .from("warehouse_cells_map")
          .select("id, code, cell_type")
          .eq("warehouse_id", warehouseId)
          .in("id", chunk);
        cells?.forEach((c: any) => cellsMap.set(c.id, { code: c.code, cell_type: c.cell_type }));
      }
    }

    // stay_start for age_hours (reset after return)
    const unitIds = baseUnits.map((u: any) => u.id);
    const lastReturnedAtByUnitId = new Map<string, string>();
    if (unitIds.length > 0) {
      for (let i = 0; i < unitIds.length; i += 100) {
        const chunk = unitIds.slice(i, i + 100);
        const { data: rows } = await supabaseAdmin
          .from("outbound_shipments")
          .select("unit_id, returned_at")
          .eq("warehouse_id", warehouseId)
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
      const rejections = Array.isArray(meta.merchant_rejections) ? meta.merchant_rejections : [];
      const lastRejectionByDate = rejections.reduce((latest: any, current: any) => {
        if (!current?.rejected_at) return latest;
        if (!latest?.rejected_at) return current;
        return new Date(current.rejected_at).getTime() > new Date(latest.rejected_at).getTime()
          ? current
          : latest;
      }, null);
      const fallbackLastRejection = rejections.length > 0 ? rejections[rejections.length - 1] : null;
      const lastRejection = lastRejectionByDate || fallbackLastRejection;
      const lastWrittenScenario =
        [...rejections]
          .reverse()
          .find((r: any) => typeof r?.scenario === "string" && r.scenario.trim().length > 0)
          ?.scenario || lastRejection?.scenario || null;
      const ticket = meta.merchant_rejection_ticket || null;
      const ticketHistory = Array.isArray(meta.merchant_rejection_tickets)
        ? meta.merchant_rejection_tickets
        : ticket
        ? [ticket]
        : [];
      const cell = unit.cell_id ? cellsMap.get(unit.cell_id) : null;
      const caseState = cell?.cell_type === "rejected" ? "active" : "archived";
      const lastReturnedAt = lastReturnedAtByUnitId.get(unit.id) || null;
      const stayStart = lastReturnedAt || unit.created_at;
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
          ? { rejected_at: lastRejection.rejected_at, scenario: lastWrittenScenario, courier_name: lastRejection.courier_name }
          : null,
        ticket: ticket
          ? {
              created: true,
              ticket_id: ticket.ticket_id,
              status: ticket.status,
              created_at: ticket.created_at,
              resolved_at: ticket.resolved_at,
              notes: ticket.notes,
              ticket_number: ticket.ticket_number || ticketHistory.length || 1,
              ticket_count: ticketHistory.length || 1,
            }
          : { created: false, ticket_id: null, status: null },
      };
    });

    if (ticketStatus === "open") {
      processedUnits = processedUnits.filter((u: any) => u.ticket.created && u.ticket.status === "open");
    } else if (ticketStatus === "resolved") {
      processedUnits = processedUnits.filter(
        (u: any) =>
          u.ticket.created &&
          (u.ticket.status === "resolved" || u.ticket.status === "partner_rejected")
      );
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

    // For fallback mode, pagination must happen after full filtering/sorting.
    let unitsPage = processedUnits;
    let computedTotal = total;
    let computedTotalPages = Math.max(1, Math.ceil(computedTotal / queryPageSize));
    let safePage = Math.min(page, computedTotalPages);
    let pageOffsetFrom = from;
    let pageOffsetTo = to;
    if (requiresPostProcessingPagination) {
      computedTotal = processedUnits.length;
      computedTotalPages = Math.max(1, Math.ceil(computedTotal / queryPageSize));
      safePage = Math.min(page, computedTotalPages);
      pageOffsetFrom = (safePage - 1) * queryPageSize;
      pageOffsetTo = pageOffsetFrom + queryPageSize - 1;
      unitsPage = processedUnits.slice(pageOffsetFrom, pageOffsetTo + 1);
    }

    return NextResponse.json({
      ok: true,
      units: unitsPage,
      total: computedTotal,
      page: safePage,
      page_size: queryPageSize,
      total_pages: computedTotalPages,
    });
  } catch (e: any) {
    console.error("Get merchant rejections error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
