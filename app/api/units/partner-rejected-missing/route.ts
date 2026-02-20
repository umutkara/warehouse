import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/units/partner-rejected-missing
 * Returns list of units with OPS status "partner_rejected_return" that are NOT on warehouse
 * (cell_id IS NULL or status not in warehouse statuses)
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

    // Paginate to get real total (all-time): partner_rejected_return and not placed in cell
    const warehouseStatuses = ["stored", "bin", "picking", "shipping"];
    const pageSize = 1000;
    let offset = 0;
    const units: any[] = [];
    let hasMore = true;

    while (hasMore) {
      const { data: page, error: pageError } = await supabaseAdmin
        .from("units")
        .select("id, barcode, status, product_name, partner_name, price, cell_id, created_at, meta")
        .eq("warehouse_id", profile.warehouse_id)
        .order("created_at", { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (pageError) {
        console.error("Partner rejected missing units error:", pageError);
        return NextResponse.json({ error: "Failed to load units" }, { status: 500 });
      }
      if (!page?.length) break;

      page.forEach((unit: any) => {
        const opsStatus = unit.meta?.ops_status;
        if (opsStatus !== "partner_rejected_return") return;
        const notOnWarehouse = !unit.cell_id || !warehouseStatuses.includes(unit.status);
        if (notOnWarehouse) units.push(unit);
      });

      hasMore = page.length === pageSize;
      offset += pageSize;
    }
    let shipmentCourierByUnit = new Map<string, string>();
    if (units.length > 0) {
      const unitIds = units.map((u: any) => u.id);
      const { data: shipments, error: shipmentsError } = await supabaseAdmin
        .from("outbound_shipments")
        .select("unit_id, courier_name, status, out_at, returned_at")
        .in("unit_id", unitIds);
      shipmentCourierByUnit = new Map(
        (shipments || [])
          .filter((s: any) => !!s.courier_name)
          .map((s: any) => [s.unit_id, s.courier_name])
      );
      if (shipmentsError) {
        console.warn("Outbound shipments lookup error:", shipmentsError.message);
      }
    }

    // Calculate age for each unit
    const now = new Date();
    const unitsWithInfo = (units || []).map((unit: any) => {
      const createdAt = new Date(unit.created_at);
      const ageHours = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
      const ageDays = Math.floor(ageHours / 24);
      const rejections = Array.isArray(unit.meta?.merchant_rejections)
        ? unit.meta.merchant_rejections
        : [];
      const lastRejection = rejections.length > 0 ? rejections[rejections.length - 1] : null;
      const courierName =
        lastRejection?.courier_name ||
        unit.meta?.courier_name ||
        shipmentCourierByUnit.get(unit.id) ||
        null;
      
      return {
        id: unit.id,
        barcode: unit.barcode,
        status: unit.status,
        product_name: unit.product_name,
        partner_name: unit.partner_name,
        price: unit.price,
        cell_id: unit.cell_id,
        created_at: unit.created_at,
        age_hours: ageHours,
        age_days: ageDays,
        ops_status: unit.meta?.ops_status || null,
        ops_status_comment: unit.meta?.ops_status_comment || null,
        courier_name: courierName,
        meta: unit.meta,
      };
    });
    return NextResponse.json({
      ok: true,
      units: unitsWithInfo,
      total: unitsWithInfo.length,
    });
  } catch (e: any) {
    console.error("Partner rejected missing units error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
