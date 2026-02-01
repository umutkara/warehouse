import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { tryCreatePostponedTask } from "@/lib/postponed-auto-task";

/**
 * POST /api/units/ops-status
 * Updates OPS status for a unit (manual status tracking)
 * Only ops, logistics, admin, head can update
 * All users can view
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profError } = await supabase
    .from("profiles")
    .select("warehouse_id, role, full_name")
    .eq("id", userData.user.id)
    .single();

  if (profError || !profile?.warehouse_id) {
    return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
  }

  // Check permissions - only ops, logistics, admin, head can update
  if (!["ops", "logistics", "admin", "head"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden: Only ops, logistics, admin, head can update OPS status" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { unitId, status, comment } = body ?? {};

  if (!unitId || !status) {
    return NextResponse.json(
      { error: "unitId and status are required" },
      { status: 400 }
    );
  }

  // Valid OPS statuses
  const validStatuses = [
    "partner_accepted_return",
    "partner_rejected_return",
    "sent_to_sc",
    "delivered_to_rc",
    "client_accepted",
    "client_rejected",
    "sent_to_client",
    "delivered_to_pudo",
    "case_cancelled_cc",
    "postponed_1",
    "postponed_2",
    "warehouse_did_not_issue",
    "in_progress",
    "no_report",
  ];

  if (!validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    // Get current unit to read old status
    const { data: currentUnit, error: unitError } = await supabaseAdmin
      .from("units")
      .select("id, barcode, meta")
      .eq("id", unitId)
      .eq("warehouse_id", profile.warehouse_id)
      .single();

    if (unitError || !currentUnit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    const oldStatus = currentUnit.meta?.ops_status || null;
    const oldStatusText = getStatusText(oldStatus);
    const newStatusText = getStatusText(status);
    const oldComment = currentUnit.meta?.ops_status_comment || null;

    // Update unit meta with new OPS status and comment
    const currentMeta = currentUnit.meta || {};
    const updatedMeta = {
      ...currentMeta,
      ops_status: status,
      ops_status_comment: comment && comment.trim() ? comment.trim() : null,
    };

    const { data: updatedUnit, error: updateError } = await supabaseAdmin
      .from("units")
      .update({ meta: updatedMeta })
      .eq("id", unitId)
      .eq("warehouse_id", profile.warehouse_id)
      .select("id, barcode, meta")
      .single();

    if (updateError) {
      console.error("Failed to update unit OPS status:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Log the status change
    const summaryParts = [`OPS статус изменён: ${oldStatusText || "не назначен"} → ${newStatusText}`];
    if (comment && comment.trim()) {
      summaryParts.push(`Комментарий: ${comment.trim()}`);
    }
    if (oldComment && oldComment !== (comment && comment.trim() ? comment.trim() : null)) {
      summaryParts.push(`Предыдущий комментарий: ${oldComment}`);
    }

    const { error: auditError } = await supabase.rpc("audit_log_event", {
      p_action: "ops.unit_status_update",
      p_entity_type: "unit",
      p_entity_id: unitId,
      p_summary: summaryParts.join(" | "),
      p_meta: {
        old_status: oldStatus,
        new_status: status,
        old_status_text: oldStatusText,
        new_status_text: newStatusText,
        comment: comment && comment.trim() ? comment.trim() : null,
        old_comment: oldComment,
        actor_role: profile.role,
        unit_barcode: currentUnit.barcode,
      },
    });

    if (auditError) {
      console.error("Failed to log OPS status change:", auditError);
      // Don't fail the request if logging fails, but log the error
    }

    // Автозадача «Перенос 1/2»: если статус = postponed_1 или postponed_2 и заказ уже в shipping/storage — создать задачу из последней задачи по unit
    if (status === "postponed_1" || status === "postponed_2") {
      try {
        const result = await tryCreatePostponedTask(
          unitId,
          profile.warehouse_id,
          userData.user.id,
          profile.full_name || userData.user.email || "Unknown",
          supabaseAdmin
        );
        if (result.created) {
          console.log("[ops-status] postponed auto-task created:", result.taskId, "for unit", unitId);
        }
      } catch (e: any) {
        console.error("[ops-status] postponed auto-task error (non-blocking):", e?.message ?? e);
      }
    }

    return NextResponse.json({
      ok: true,
      unit: updatedUnit,
    });
  } catch (e: any) {
    console.error("OPS status update error:", e);
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/units/ops-status?unitId=xxx
 * Get OPS status for a unit (for viewing)
 */
export async function GET(req: Request) {
  const supabase = await supabaseServer();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const unitId = url.searchParams.get("unitId");

  if (!unitId) {
    return NextResponse.json({ error: "Missing unitId" }, { status: 400 });
  }

  const { data: profile, error: profError } = await supabase
    .from("profiles")
    .select("warehouse_id")
    .eq("id", userData.user.id)
    .single();

  if (profError || !profile?.warehouse_id) {
    return NextResponse.json({ error: "Warehouse not assigned" }, { status: 400 });
  }

  const { data: unit, error: unitError } = await supabaseAdmin
    .from("units")
    .select("id, meta")
    .eq("id", unitId)
    .eq("warehouse_id", profile.warehouse_id)
    .single();

  if (unitError || !unit) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    ops_status: unit.meta?.ops_status || null,
  });
}

/**
 * Get human-readable text for status code
 */
function getStatusText(status: string | null): string {
  if (!status) return "не назначен";

  const statusMap: Record<string, string> = {
    partner_accepted_return: "Партнер принял на возврат",
    partner_rejected_return: "Партнер не принял на возврат",
    sent_to_sc: "Передан в СЦ",
    delivered_to_rc: "Товар доставлен на РЦ",
    client_accepted: "Клиент принял",
    client_rejected: "Клиент не принял",
    sent_to_client: "Товар отправлен клиенту",
    delivered_to_pudo: "Товар доставлен на ПУДО",
    case_cancelled_cc: "Кейс отменен (Направлен КК)",
    postponed_1: "Перенос",
    postponed_2: "Перенос 2",
    warehouse_did_not_issue: "Склад не выдал",
    in_progress: "В работе",
    no_report: "Отчета нет",
  };

  return statusMap[status] || status;
}
