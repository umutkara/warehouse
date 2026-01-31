import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/ops/merchant-rejections/ticket
 * Create or update ticket for merchant rejection
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("warehouse_id, role, full_name")
      .eq("id", user.id)
      .single();

    if (!profile?.warehouse_id) {
      return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
    }

    // Only ops, logistics, manager, head, admin can access
    const allowedRoles = ["ops", "logistics", "manager", "head", "admin"];
    if (!profile.role || !allowedRoles.includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { unit_id, action, ticket_id, notes } = body;

    if (!unit_id || !action) {
      return NextResponse.json(
        { error: "unit_id and action are required" },
        { status: 400 }
      );
    }

    // Get current unit
    const { data: unit, error: unitError } = await supabaseAdmin
      .from("units")
      .select("meta")
      .eq("id", unit_id)
      .single();

    if (unitError || !unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    const currentMeta = (unit.meta as any) || {};

    // Handle different actions
    let updatedMeta = { ...currentMeta };

    if (action === "create_ticket") {
      // Create ticket
      const ticketReference = ticket_id || `TICKET-${Date.now()}`;
      updatedMeta.merchant_rejection_ticket = {
        ticket_id: ticketReference,
        status: "open",
        created_at: new Date().toISOString(),
        created_by: user.id,
        created_by_name: profile.full_name,
        notes: notes || "",
      };
    } else if (action === "mark_resolved") {
      // Mark as resolved
      if (!currentMeta.merchant_rejection_ticket) {
        return NextResponse.json(
          { error: "No ticket exists for this unit" },
          { status: 400 }
        );
      }
      updatedMeta.merchant_rejection_ticket = {
        ...currentMeta.merchant_rejection_ticket,
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
        resolved_by_name: profile.full_name,
        resolution_notes: notes || "",
      };
    } else if (action === "reopen") {
      // Reopen ticket
      if (!currentMeta.merchant_rejection_ticket) {
        return NextResponse.json(
          { error: "No ticket exists for this unit" },
          { status: 400 }
        );
      }
      updatedMeta.merchant_rejection_ticket = {
        ...currentMeta.merchant_rejection_ticket,
        status: "open",
        reopened_at: new Date().toISOString(),
        reopened_by: user.id,
        reopened_by_name: profile.full_name,
      };
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Update unit meta
    const { error: updateError } = await supabaseAdmin
      .from("units")
      .update({ meta: updatedMeta })
      .eq("id", unit_id);

    if (updateError) {
      console.error("Update unit meta error:", updateError);
      return NextResponse.json(
        { error: "Failed to update ticket" },
        { status: 500 }
      );
    }

    // Log audit event
    await supabase.rpc("audit_log_event", {
      p_action: `merchant_rejection.ticket_${action}`,
      p_entity_type: "unit",
      p_entity_id: unit_id,
      p_summary: `Тикет ${action === "create_ticket" ? "создан" : action === "mark_resolved" ? "решен" : "переоткрыт"}`,
      p_meta: {
        ticket_id: updatedMeta.merchant_rejection_ticket?.ticket_id,
        status: updatedMeta.merchant_rejection_ticket?.status,
        notes,
      },
    });

    return NextResponse.json({
      ok: true,
      ticket: updatedMeta.merchant_rejection_ticket,
    });
  } catch (e: any) {
    console.error("Ticket management error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
