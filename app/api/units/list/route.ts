import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/units/list
 * Returns list of units with filters
 * Query params:
 * - age: all | 24h | 48h | 7d (filter by time on warehouse)
 * - search: search by barcode (partial match)
 * - status: filter by status (bin, stored, picking, shipping, out, rejected, ff, all)
 *          OR by cell_type (bin, shipping) - filters units in cells of specific type
 * - ops: OPS статус (postponed_1, no_status, etc.) or "all"
 */
export async function GET(req: Request) {
  const supabase = await supabaseServer();

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

    // Parse query params
    const { searchParams } = new URL(req.url);
    const ageFilter = searchParams.get("age") || "all";
    const searchQuery = searchParams.get("search") || "";
    const statusFilter = searchParams.get("status") || "all";
    const opsFilter = searchParams.get("ops") || "all";

    // Calculate date threshold based on filter
    let dateThreshold: string | null = null;
    const now = new Date();

    switch (ageFilter) {
      case "24h":
        dateThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        break;
      case "48h":
        dateThreshold = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
        break;
      case "7d":
        dateThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        break;
      default:
        dateThreshold = null;
    }

    // Build query - specify explicit foreign key relationship
    let query = supabaseAdmin
      .from("units")
      .select(`
        id,
        barcode,
        status,
        product_name,
        partner_name,
        price,
        cell_id,
        created_at,
        meta,
        warehouse_cells!units_cell_id_fkey(code, cell_type)
      `)
      .eq("warehouse_id", profile.warehouse_id)
      .order("created_at", { ascending: false });
    let countQuery = supabaseAdmin
      .from("units")
      .select("id, warehouse_cells!units_cell_id_fkey(cell_type)", { count: "exact", head: true })
      .eq("warehouse_id", profile.warehouse_id);

    // Apply status filter
    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "on_warehouse") {
        // "На складе" - фильтруем по cell_type (более надежно, не зависит от enum)
        // Units на складе находятся в ячейках типов: bin, storage, shipping, picking, rejected, ff
        query = query.in("warehouse_cells.cell_type", ["bin", "storage", "shipping", "picking", "rejected", "ff"]);
        countQuery = countQuery.in("warehouse_cells.cell_type", ["bin", "storage", "shipping", "picking", "rejected", "ff"]);
      } else if (statusFilter === "bin") {
        // "BIN" - заказы в BIN ячейках (обычно со статусом bin)
        // Фильтруем по cell_type через join
        query = query.eq("warehouse_cells.cell_type", "bin");
        countQuery = countQuery.eq("warehouse_cells.cell_type", "bin");
      } else if (statusFilter === "shipping") {
        // "Shipping" - заказы в shipping ячейках
        // Фильтруем по cell_type через join
        query = query.eq("warehouse_cells.cell_type", "shipping");
        countQuery = countQuery.eq("warehouse_cells.cell_type", "shipping");
      } else {
        query = query.eq("status", statusFilter);
        countQuery = countQuery.eq("status", statusFilter);
      }
    }

    // Apply search filter
    if (searchQuery.trim()) {
      query = query.ilike("barcode", `%${searchQuery.trim()}%`);
      countQuery = countQuery.ilike("barcode", `%${searchQuery.trim()}%`);
    }

    // Apply age filter
    if (dateThreshold) {
      query = query.lt("created_at", dateThreshold);
      countQuery = countQuery.lt("created_at", dateThreshold);
    }

    // Apply OPS status filter (meta.ops_status)
    if (opsFilter && opsFilter !== "all") {
      if (opsFilter === "no_status") {
        query = (query as any).is("meta->>ops_status", null);
        countQuery = (countQuery as any).is("meta->>ops_status", null);
      } else {
        query = query.contains("meta", { ops_status: opsFilter });
        countQuery = countQuery.contains("meta", { ops_status: opsFilter });
      }
    }

    const { count: totalCount } = await countQuery;

    const { data: units, error: unitsError } = await query;

    if (unitsError) {
      console.error("Units list error:", unitsError);
      return NextResponse.json(
        { error: "Failed to load units" },
        { status: 500 }
      );
    }

    // Calculate age for each unit
    const unitsWithAge = (units || []).map((unit: any) => {
      const createdAt = new Date(unit.created_at);
      const ageHours = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
      
      return {
        id: unit.id,
        barcode: unit.barcode,
        status: unit.status,
        product_name: unit.product_name,
        partner_name: unit.partner_name,
        price: unit.price,
        cell_code: unit.warehouse_cells?.code,
        cell_type: unit.warehouse_cells?.cell_type,
        created_at: unit.created_at,
        age_hours: ageHours,
        meta: unit.meta,
      };
    });

    const total = typeof totalCount === "number" ? totalCount : unitsWithAge.length;
    return NextResponse.json({
      ok: true,
      units: unitsWithAge,
      total,
    });
  } catch (e: any) {
    console.error("List units error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
