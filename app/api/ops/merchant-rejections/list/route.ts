import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/ops/merchant-rejections/list
 * Returns units with merchant rejections
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

    // Only ops, manager, head, admin can access
    const allowedRoles = ["ops", "manager", "head", "admin"];
    if (!profile.role || !allowedRoles.includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get units with merchant rejections
    // Note: Simplified query without JOIN to avoid stack depth issues
    const { data: allUnits, error: unitsError } = await supabase
      .from("units")
      .select("id, barcode, status, product_name, partner_name, price, created_at, meta, cell_id")
      .eq("warehouse_id", profile.warehouse_id)
      .order("created_at", { ascending: false });

    if (unitsError) {
      console.error("Merchant rejections list error:", unitsError);
      return NextResponse.json(
        { error: "Failed to load merchant rejections", details: unitsError.message },
        { status: 500 }
      );
    }

    // Filter units with merchant rejections in app code
    const units = (allUnits || []).filter((unit: any) => {
      const meta = unit.meta as any;
      return meta?.merchant_rejection_count && meta.merchant_rejection_count > 0;
    });

    // Get cell info separately if needed
    const cellIds = units.map((u: any) => u.cell_id).filter(Boolean);
    const cellsMap: Record<string, any> = {};
    
    if (cellIds.length > 0) {
      const { data: cells } = await supabase
        .from("warehouse_cells")
        .select("id, code, cell_type")
        .in("id", cellIds);
      
      if (cells) {
        cells.forEach((cell: any) => {
          cellsMap[cell.id] = cell;
        });
      }
    }

    // Process units to extract rejection info
    const processedUnits = (units || []).map((unit: any) => {
      const meta = unit.meta || {};
      const rejectionCount = meta.merchant_rejection_count || 0;
      const rejections = meta.merchant_rejections || [];
      const lastRejection = rejections[rejections.length - 1];

      // Check if ticket exists
      const ticket = meta.merchant_rejection_ticket || null;
      
      const cell = unit.cell_id ? cellsMap[unit.cell_id] : null;

      return {
        id: unit.id,
        barcode: unit.barcode,
        status: unit.status,
        product_name: unit.product_name,
        partner_name: unit.partner_name,
        price: unit.price,
        cell_code: cell?.code,
        cell_type: cell?.cell_type,
        created_at: unit.created_at,
        rejection_count: rejectionCount,
        last_rejection: lastRejection
          ? {
              rejected_at: lastRejection.rejected_at,
              scenario: lastRejection.scenario,
              courier_name: lastRejection.courier_name,
            }
          : null,
        ticket: ticket
          ? {
              created: true,
              ticket_id: ticket.ticket_id,
              status: ticket.status,
              created_at: ticket.created_at,
              resolved_at: ticket.resolved_at,
              notes: ticket.notes,
            }
          : {
              created: false,
              ticket_id: null,
              status: null,
            },
      };
    });

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
