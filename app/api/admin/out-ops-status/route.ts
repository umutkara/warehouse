import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const VALID_OPS_STATUSES = [
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

/**
 * POST /api/admin/out-ops-status
 * Body: { date: "YYYY-MM-DD", status: "in_progress", overwriteExisting?: boolean }
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();

  try {
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

    if (!["admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const date = String(body?.date || "").trim();
    const status = String(body?.status || "").trim();
    const overwriteExisting = Boolean(body?.overwriteExisting);

    if (!date) {
      return NextResponse.json({ error: "Date is required" }, { status: 400 });
    }

    if (!status || !VALID_OPS_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_OPS_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const start = new Date(`${date}T00:00:00`);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    const { data: shipments, error: shipmentsError } = await supabaseAdmin
      .from("outbound_shipments")
      .select("id, unit_id, out_at")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("status", "out")
      .gte("out_at", start.toISOString())
      .lt("out_at", end.toISOString());

    if (shipmentsError) {
      return NextResponse.json({ error: shipmentsError.message }, { status: 400 });
    }

    const unitIds = Array.from(new Set((shipments || []).map((s) => s.unit_id).filter(Boolean)));
    if (unitIds.length === 0) {
      return NextResponse.json({ ok: true, updated: 0, skipped: 0, total: 0 });
    }

    const { data: units, error: unitsError } = await supabaseAdmin
      .from("units")
      .select("id, barcode, meta")
      .in("id", unitIds)
      .eq("warehouse_id", profile.warehouse_id);

    if (unitsError) {
      return NextResponse.json({ error: unitsError.message }, { status: 400 });
    }

    let updated = 0;
    let skipped = 0;
    const comment = `Массово: OUT ${date}`;
    const actorName = profile.full_name || userData.user.email || "Unknown";

    for (const unit of units || []) {
      const currentMeta = unit.meta || {};
      const oldStatus = currentMeta.ops_status || null;
      const oldComment = currentMeta.ops_status_comment || null;

      if (oldStatus && !overwriteExisting) {
        skipped += 1;
        continue;
      }

      const updatedMeta = {
        ...currentMeta,
        ops_status: status,
        ops_status_comment: comment,
      };

      const { error: updateError } = await supabaseAdmin
        .from("units")
        .update({ meta: updatedMeta })
        .eq("id", unit.id)
        .eq("warehouse_id", profile.warehouse_id);

      if (updateError) {
        continue;
      }

      const oldStatusText = getStatusText(oldStatus);
      const newStatusText = getStatusText(status);

      await supabase.rpc("audit_log_event", {
        p_action: "ops.unit_status_update",
        p_entity_type: "unit",
        p_entity_id: unit.id,
        p_summary: `OPS статус изменён: ${oldStatusText} → ${newStatusText} | Комментарий: ${comment}`,
        p_meta: {
          old_status: oldStatus,
          new_status: status,
          old_status_text: oldStatusText,
          new_status_text: newStatusText,
          comment,
          old_comment: oldComment,
          actor_role: profile.role,
          unit_barcode: unit.barcode,
          actor_name: actorName,
          source: "admin.outbound_bulk",
        },
      });

      updated += 1;
    }

    return NextResponse.json({
      ok: true,
      total: unitIds.length,
      updated,
      skipped,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}
