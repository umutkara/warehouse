import { NextResponse } from "next/server";

import {
  loadComputedHandovers,
  mergeHandoverItemMeta,
  readHandoverItemMeta,
  requireWarehouseHandoverAccess,
} from "@/app/api/ops/courier-handovers/_shared";
import { POST as receiveScanPost } from "@/app/api/receiving/scan/route";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const auth = await requireWarehouseHandoverAccess();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const handoverId = body?.handoverId?.toString() || "";
  const cellCode = body?.cellCode?.toString() || "";
  const unitBarcode = body?.unitBarcode?.toString() || "";

  if (!handoverId || !cellCode || !unitBarcode) {
    return NextResponse.json(
      { error: "handoverId, cellCode and unitBarcode are required" },
      { status: 400 },
    );
  }

  const { data: handover, error: handoverError } = await supabaseAdmin
    .from("warehouse_handover_sessions")
    .select("id, warehouse_id, status")
    .eq("id", handoverId)
    .eq("warehouse_id", auth.profile.warehouse_id)
    .maybeSingle();

  if (handoverError || !handover) {
    return NextResponse.json({ error: "Handover session not found" }, { status: 404 });
  }
  if (handover.status === "confirmed") {
    return NextResponse.json({ error: "Handover session is already closed" }, { status: 409 });
  }

  const receiveResponse = await receiveScanPost(
    new Request("http://localhost/api/receiving/scan", {
      method: "POST",
      body: JSON.stringify({
        cellCode,
        unitBarcode,
        skipHandoverReconciliation: true,
      }),
    }),
  );
  const receivePayload = await receiveResponse.json().catch(() => ({}));
  if (!receiveResponse.ok) {
    return NextResponse.json(receivePayload, { status: receiveResponse.status });
  }

  const unitId = receivePayload?.unitId?.toString() || null;
  if (!unitId) {
    return NextResponse.json({ error: "Receiving scan did not return unitId" }, { status: 500 });
  }

  const now = new Date().toISOString();
  const { data: existingItem, error: existingItemError } = await supabaseAdmin
    .from("warehouse_handover_items")
    .select("id, task_id, meta")
    .eq("handover_session_id", handover.id)
    .eq("unit_id", unitId)
    .maybeSingle();
  if (existingItemError) {
    return NextResponse.json({ error: existingItemError.message }, { status: 500 });
  }

  let itemKind: "expected" | "extra" = "extra";

  if (existingItem?.id) {
    const metaInfo = readHandoverItemMeta(existingItem.meta);
    itemKind = metaInfo.sourceKind;
    const nextMeta = mergeHandoverItemMeta(existingItem.meta, {
      source: "api.ops.courier-handovers.scan",
      source_kind: metaInfo.sourceKind,
      receiving_status: "received",
      received_at: metaInfo.receivedAt || now,
      received_by: auth.user.id,
      received_via: "courier_receiving",
      lost_at: null,
      lost_by: null,
    });
    const { error: updateError } = await supabaseAdmin
      .from("warehouse_handover_items")
      .update({ meta: nextMeta })
      .eq("id", existingItem.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    if (existingItem.task_id) {
      const { data: taskRow } = await supabaseAdmin
        .from("courier_tasks")
        .select("id, meta")
        .eq("id", existingItem.task_id)
        .maybeSingle();
      if (taskRow?.id) {
        const taskMeta =
          taskRow.meta && typeof taskRow.meta === "object"
            ? (taskRow.meta as Record<string, unknown>)
            : {};
        const hiddenAt = new Date().toISOString();
        const hiddenMeta = {
          ...taskMeta,
          hidden_from_courier: true,
          hidden_from_courier_at: hiddenAt,
          hidden_from_courier_by: auth.user.id,
          hidden_from_courier_reason: "warehouse_handover_received",
          source: "api.ops.courier-handovers.scan",
        };
        await supabaseAdmin
          .from("courier_tasks")
          .update({ meta: hiddenMeta, updated_at: hiddenAt })
          .eq("id", taskRow.id);
      }
    }
  } else {
    const { error: insertError } = await supabaseAdmin.from("warehouse_handover_items").insert({
      handover_session_id: handover.id,
      unit_id: unitId,
      task_id: null,
      condition_status: "ok",
      meta: {
        source: "api.ops.courier-handovers.scan",
        source_kind: "extra",
        receiving_status: "received",
        received_at: now,
        received_by: auth.user.id,
        received_via: "courier_receiving",
      },
    });
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  const [computedHandover] = await loadComputedHandovers({
    warehouseId: auth.profile.warehouse_id,
    handoverId: handover.id,
  });

  return NextResponse.json({
    ok: true,
    item_kind: itemKind,
    receive: receivePayload,
    handover: computedHandover || null,
  });
}
