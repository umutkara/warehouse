import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasAnyRole } from "@/app/api/_shared/role-access";

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

    // Only ops, logistics, manager, head, admin, compliance can access
    const allowedRoles = ["ops", "logistics", "manager", "head", "admin", "compliance"];
    if (!profile.role || !hasAnyRole(profile.role, allowedRoles)) {
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
    const existingTickets = Array.isArray(currentMeta.merchant_rejection_tickets)
      ? currentMeta.merchant_rejection_tickets
      : currentMeta.merchant_rejection_ticket
      ? [currentMeta.merchant_rejection_ticket]
      : [];
    const currentTicket = currentMeta.merchant_rejection_ticket || null;

    // Handle different actions
    let updatedMeta = { ...currentMeta };
    const nowIso = new Date().toISOString();

    function updateCurrentInHistory(nextCurrentTicket: any) {
      const tickets = [...existingTickets];
      if (tickets.length === 0) {
        return [nextCurrentTicket];
      }
      tickets[tickets.length - 1] = {
        ...tickets[tickets.length - 1],
        ...nextCurrentTicket,
      };
      return tickets;
    }

    if (action === "create_ticket") {
      if (currentTicket?.status === "open") {
        return NextResponse.json(
          { error: "Current ticket is still open" },
          { status: 400 }
        );
      }
      const ticketNumber = existingTickets.length + 1;
      const ticketReference = ticket_id || `TICKET-${Date.now()}-${ticketNumber}`;
      const newTicket = {
        ticket_id: ticketReference,
        ticket_number: ticketNumber,
        status: "open",
        created_at: nowIso,
        created_by: user.id,
        created_by_name: profile.full_name,
        notes: notes || "",
      };
      updatedMeta.merchant_rejection_ticket = newTicket;
      updatedMeta.merchant_rejection_tickets = [...existingTickets, newTicket];
    } else if (action === "mark_resolved") {
      if (!currentTicket) {
        return NextResponse.json(
          { error: "No ticket exists for this unit" },
          { status: 400 }
        );
      }
      if (currentTicket.status !== "open") {
        return NextResponse.json(
          { error: "Only open ticket can be resolved" },
          { status: 400 }
        );
      }
      const resolvedTicket = {
        ...currentTicket,
        status: "resolved",
        resolved_at: nowIso,
        resolved_by: user.id,
        resolved_by_name: profile.full_name,
        resolution_notes: notes || "",
      };
      updatedMeta.merchant_rejection_ticket = resolvedTicket;
      updatedMeta.merchant_rejection_tickets = updateCurrentInHistory(resolvedTicket);
    } else if (action === "mark_partner_rejected") {
      if (!currentTicket) {
        return NextResponse.json(
          { error: "No ticket exists for this unit" },
          { status: 400 }
        );
      }
      if (currentTicket.status !== "open") {
        return NextResponse.json(
          { error: "Only open ticket can be marked as partner rejected" },
          { status: 400 }
        );
      }
      const partnerRejectedTicket = {
        ...currentTicket,
        status: "partner_rejected",
        partner_rejected_at: nowIso,
        partner_rejected_by: user.id,
        partner_rejected_by_name: profile.full_name,
        partner_rejected_notes: notes || "",
      };
      updatedMeta.merchant_rejection_ticket = partnerRejectedTicket;
      updatedMeta.merchant_rejection_tickets = updateCurrentInHistory(partnerRejectedTicket);
    } else if (action === "reopen") {
      if (!currentTicket) {
        return NextResponse.json(
          { error: "No ticket exists for this unit" },
          { status: 400 }
        );
      }
      const reopenedTicket = {
        ...currentTicket,
        status: "open",
        reopened_at: nowIso,
        reopened_by: user.id,
        reopened_by_name: profile.full_name,
      };
      updatedMeta.merchant_rejection_ticket = reopenedTicket;
      updatedMeta.merchant_rejection_tickets = updateCurrentInHistory(reopenedTicket);
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
      p_summary:
        action === "create_ticket"
          ? "Тикет создан"
          : action === "mark_resolved"
          ? "Тикет решен"
          : action === "mark_partner_rejected"
          ? "Тикет отклонен партнером"
          : "Тикет переоткрыт",
      p_meta: {
        ticket_id: updatedMeta.merchant_rejection_ticket?.ticket_id,
        ticket_number: updatedMeta.merchant_rejection_ticket?.ticket_number || null,
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
