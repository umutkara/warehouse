import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireUserProfile } from "@/app/api/_shared/user-profile";

const PAYABLE_STATUSES = new Set([
  "partner_accepted_return",
  "sent_to_sc",
  "client_accepted",
  "sent_to_client",
]);

const OPS_STATUS_LABELS: Record<string, string> = {
  in_progress: "В работе",
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
  no_report: "Отчета нет",
};

type Shipment = {
  id: string;
  unit_id: string;
  courier_name: string;
  out_at: string;
  status: string;
};

type UnitRecord = {
  id: string;
  barcode: string;
  meta?: {
    ops_status?: string | null;
    ops_status_comment?: string | null;
  } | null;
};

type OpsAuditEvent = {
  entity_id: string;
  created_at: string;
  meta?: {
    new_status?: string | null;
    comment?: string | null;
    unit_barcode?: string | null;
  } | null;
};

type CourierPaymentRow = {
  unit_id: string;
  barcode: string;
  courier_name: string;
  out_at: string;
  shipment_status: string;
  final_ops_status: string | null;
  final_ops_status_label: string;
  final_ops_status_at: string | null;
  ops_comment: string | null;
  is_payable: boolean;
  payment_amount: number;
};

type FinalizedCourierPaymentRow = Omit<CourierPaymentRow, "final_ops_status_at"> & {
  final_ops_status_at: string;
};

function toLabel(status: string | null | undefined): string {
  if (!status) return "Не назначен";
  return OPS_STATUS_LABELS[status] || status;
}

function isDateOnly(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function buildEmptyResponse(fromDate: string, toDate: string, courier: string, statusFilter: string, couriers: string[]) {
  return {
    ok: true,
    filters: { from: fromDate, to: toDate, courier, status: statusFilter },
    payable_statuses: Array.from(PAYABLE_STATUSES),
    couriers,
    summary: {
      total_finalized: 0,
      payable_count: 0,
      non_payable_count: 0,
      total_amount: 0,
      rate_per_order: 1,
    },
    by_courier: [],
    rows: [],
  };
}

export async function GET(req: Request) {
  const supabase = await supabaseServer();

  const auth = await requireUserProfile(supabase, {
    allowedRoles: ["ops", "admin", "head"],
  });
  if (!auth.ok) {
    return auth.response;
  }
  const { profile } = auth;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const courier = (url.searchParams.get("courier") || "").trim();
  const statusFilter = (url.searchParams.get("status") || "all").trim();

  const today = new Date();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const todayDate = today.toISOString().slice(0, 10);

  const fromDate = isDateOnly(from) ? from : monthStart;
  const toDate = isDateOnly(to) ? to : todayDate;
  const fromIso = `${fromDate}T00:00:00.000Z`;
  const toIso = `${toDate}T23:59:59.999Z`;

  const { data: shipments, error: shipmentsError } = await supabaseAdmin
    .from("outbound_shipments")
    .select("id, unit_id, courier_name, out_at, status")
    .eq("warehouse_id", profile.warehouse_id)
    .order("out_at", { ascending: false });

  if (shipmentsError) {
    return NextResponse.json({ error: shipmentsError.message }, { status: 400 });
  }

  const shipmentList = (shipments || []) as Shipment[];
  const courierOptions = Array.from(
    new Set(
      shipmentList
        .map((s) => s.courier_name?.trim())
        .filter((v): v is string => Boolean(v))
    )
  ).sort((a, b) => a.localeCompare(b, "ru"));

  if (shipmentList.length === 0) {
    return NextResponse.json(buildEmptyResponse(fromDate, toDate, courier, statusFilter, courierOptions));
  }

  const latestShipmentByUnit = new Map<string, Shipment>();
  for (const shipment of shipmentList) {
    if (!shipment.unit_id || latestShipmentByUnit.has(shipment.unit_id)) continue;
    latestShipmentByUnit.set(shipment.unit_id, shipment);
  }

  const unitIds = Array.from(latestShipmentByUnit.keys());
  if (unitIds.length === 0) {
    return NextResponse.json(buildEmptyResponse(fromDate, toDate, courier, statusFilter, courierOptions));
  }

  const chunkSize = 100;
  const unitsData: UnitRecord[] = [];
  for (let i = 0; i < unitIds.length; i += chunkSize) {
    const chunk = unitIds.slice(i, i + chunkSize);
    const { data: unitsChunk, error: unitsError } = await supabaseAdmin
      .from("units")
      .select("id, barcode, meta")
      .in("id", chunk);

    if (unitsError) {
      return NextResponse.json({ error: unitsError.message }, { status: 400 });
    }

    if (unitsChunk?.length) {
      unitsData.push(...(unitsChunk as UnitRecord[]));
    }
  }

  const unitsMap = new Map<string, UnitRecord>();
  for (const unit of unitsData) {
    unitsMap.set(unit.id, unit);
  }

  const latestOpsByUnit = new Map<string, OpsAuditEvent>();
  for (let i = 0; i < unitIds.length; i += chunkSize) {
    const chunk = unitIds.slice(i, i + chunkSize);
    const { data: events, error: eventsError } = await supabaseAdmin
      .from("audit_events")
      .select("entity_id, created_at, meta")
      .eq("warehouse_id", profile.warehouse_id)
      .eq("entity_type", "unit")
      .eq("action", "ops.unit_status_update")
      .in("entity_id", chunk)
      .order("created_at", { ascending: false });

    if (eventsError) {
      return NextResponse.json({ error: eventsError.message }, { status: 400 });
    }

    for (const event of (events || []) as OpsAuditEvent[]) {
      if (!event.entity_id || latestOpsByUnit.has(event.entity_id)) continue;
      latestOpsByUnit.set(event.entity_id, event);
    }
  }

  const rows = unitIds
    .map((unitId) => {
      const shipment = latestShipmentByUnit.get(unitId);
      if (!shipment) return null;

      const unit = unitsMap.get(unitId);
      const finalEvent = latestOpsByUnit.get(unitId);

      const finalStatus = finalEvent?.meta?.new_status || unit?.meta?.ops_status || null;
      const finalStatusAt = finalEvent?.created_at || null;
      const finalComment =
        finalEvent?.meta?.comment || unit?.meta?.ops_status_comment || null;

      const barcode = unit?.barcode || finalEvent?.meta?.unit_barcode || unitId;
      const payable = finalStatus ? PAYABLE_STATUSES.has(finalStatus) : false;

      return {
        unit_id: unitId,
        barcode,
        courier_name: shipment.courier_name,
        out_at: shipment.out_at,
        shipment_status: shipment.status,
        final_ops_status: finalStatus,
        final_ops_status_label: toLabel(finalStatus),
        final_ops_status_at: finalStatusAt,
        ops_comment: finalComment,
        is_payable: payable,
        payment_amount: payable ? 1 : 0,
      } satisfies CourierPaymentRow;
    })
    .filter(
      (row): row is FinalizedCourierPaymentRow =>
        Boolean(row && row.final_ops_status_at)
    )
    .filter((row) => row.final_ops_status_at >= fromIso && row.final_ops_status_at <= toIso)
    .filter((row) => (courier ? row.courier_name === courier : true))
    .filter((row) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "payable") return row.is_payable;
      if (statusFilter === "non_payable") return !row.is_payable;
      return row.final_ops_status === statusFilter;
    })
    .sort((a, b) => b.final_ops_status_at.localeCompare(a.final_ops_status_at));

  const byCourierMap = new Map<
    string,
    { courier_name: string; total_finalized: number; payable_count: number; non_payable_count: number; total_amount: number }
  >();

  for (const row of rows) {
    const key = row.courier_name || "—";
    if (!byCourierMap.has(key)) {
      byCourierMap.set(key, {
        courier_name: key,
        total_finalized: 0,
        payable_count: 0,
        non_payable_count: 0,
        total_amount: 0,
      });
    }
    const agg = byCourierMap.get(key)!;
    agg.total_finalized += 1;
    if (row.is_payable) {
      agg.payable_count += 1;
      agg.total_amount += row.payment_amount;
    } else {
      agg.non_payable_count += 1;
    }
  }

  const byCourier = Array.from(byCourierMap.values()).sort((a, b) =>
    b.total_amount - a.total_amount || a.courier_name.localeCompare(b.courier_name, "ru")
  );

  const summary = rows.reduce(
    (acc, row) => {
      acc.total_finalized += 1;
      if (row.is_payable) {
        acc.payable_count += 1;
        acc.total_amount += row.payment_amount;
      } else {
        acc.non_payable_count += 1;
      }
      return acc;
    },
    {
      total_finalized: 0,
      payable_count: 0,
      non_payable_count: 0,
      total_amount: 0,
      rate_per_order: 1,
    }
  );

  return NextResponse.json({
    ok: true,
    filters: { from: fromDate, to: toDate, courier, status: statusFilter },
    payable_statuses: Array.from(PAYABLE_STATUSES),
    couriers: courierOptions,
    summary,
    by_courier: byCourier,
    rows,
  });
}
