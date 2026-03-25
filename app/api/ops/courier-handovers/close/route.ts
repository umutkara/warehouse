import { NextResponse } from "next/server";

import {
  loadComputedHandovers,
  mergeHandoverItemMeta,
  requireWarehouseHandoverAccess,
} from "@/app/api/ops/courier-handovers/_shared";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const auth = await requireWarehouseHandoverAccess();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const handoverId = body?.handoverId?.toString() || "";
  const note = body?.note?.toString() || null;
  if (!handoverId) {
    return NextResponse.json({ error: "handoverId is required" }, { status: 400 });
  }

  const [handover] = await loadComputedHandovers({
    warehouseId: auth.profile.warehouse_id,
    handoverId,
  });
  if (!handover) {
    return NextResponse.json({ error: "Handover session not found" }, { status: 404 });
  }
  if (handover.status === "confirmed") {
    return NextResponse.json({
      ok: true,
      already_confirmed: true,
      handover,
    });
  }

  const now = new Date().toISOString();

  for (const item of handover.remaining_items) {
    const { data: rawItem, error: itemError } = await supabaseAdmin
      .from("warehouse_handover_items")
      .select("id, meta")
      .eq("id", item.handover_item_id)
      .maybeSingle();
    if (itemError || !rawItem) {
      return NextResponse.json(
        { error: itemError?.message || "Failed to load handover item" },
        { status: 500 },
      );
    }

    const nextMeta = mergeHandoverItemMeta(rawItem.meta, {
      source: "api.ops.courier-handovers.close",
      source_kind: "expected",
      receiving_status: "lost",
      lost_at: now,
      lost_by: auth.user.id,
    });
    const { error: updateError } = await supabaseAdmin
      .from("warehouse_handover_items")
      .update({ meta: nextMeta })
      .eq("id", rawItem.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  const { error: confirmError } = await supabaseAdmin
    .from("warehouse_handover_sessions")
    .update({
      status: "confirmed",
      receiver_user_id: auth.user.id,
      confirmed_at: now,
      note,
      updated_at: now,
      meta: {
        source: "api.ops.courier-handovers.close",
        closed_with_lost: handover.remaining_items.length > 0,
      },
    })
    .eq("id", handover.handover_session_id);
  if (confirmError) {
    return NextResponse.json({ error: confirmError.message }, { status: 500 });
  }

  if (handover.shift_id) {
    await supabaseAdmin
      .from("courier_shifts")
      .update({
        status: "closed",
        closed_at: now,
        close_approved_by: auth.user.id,
        updated_at: now,
        meta: { source: "api.ops.courier-handovers.close", handover_id: handover.handover_session_id },
      })
      .eq("id", handover.shift_id)
      .neq("status", "closed");
  }

  await supabaseAdmin.rpc("audit_log_event", {
    p_action: "courier.handover_close_partial",
    p_entity_type: "courier_handover",
    p_entity_id: handover.handover_session_id,
    p_summary: "Courier handover closed in TSD",
    p_meta: {
      handover_id: handover.handover_session_id,
      shift_id: handover.shift_id,
      courier_user_id: handover.courier_user_id,
      receiver_user_id: auth.user.id,
      note,
      expected_total: handover.expected_total,
      received_total: handover.received_total,
      lost_total: handover.remaining_total,
      extra_total: handover.extra_total,
    },
  });

  const [updated] = await loadComputedHandovers({
    warehouseId: auth.profile.warehouse_id,
    handoverId,
  });

  return NextResponse.json({
    ok: true,
    handover: updated || null,
    summary: {
      expected_total: handover.expected_total,
      received_total: handover.received_total,
      lost_total: handover.remaining_total,
      extra_total: handover.extra_total,
    },
  });
}
