import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireUserProfile } from "@/app/api/_shared/user-profile";
import { ROUTE_PLANNING_VIEW_ROLES } from "@/lib/routeplanning/access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

const MAX_ROWS_PER_ENTITY = 10000;
const PAGE_SIZE = 1000;

type ShiftRow = {
  id: string;
  courier_user_id: string;
  status: string;
  started_at: string;
  closed_at: string | null;
  start_note: string | null;
  close_note: string | null;
};

type TaskRow = {
  id: string;
  courier_user_id: string;
  unit_id: string;
  shift_id: string | null;
  status: string;
  claimed_at: string | null;
  accepted_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  returned_at: string | null;
  fail_reason: string | null;
  fail_comment: string | null;
  last_event_at: string | null;
  updated_at: string;
};

type EventRow = {
  id: string;
  courier_user_id: string;
  task_id: string | null;
  unit_id: string;
  event_type: string;
  happened_at: string;
  note: string | null;
  proof_meta: unknown;
  lat: number | null;
  lng: number | null;
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function toIsoOrNull(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function safeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function pickOpsStatus(eventProofMeta: unknown, unitMeta: unknown): string {
  if (unitMeta && typeof unitMeta === "object") {
    const status = (unitMeta as Record<string, unknown>).ops_status;
    if (typeof status === "string" && status.trim()) return status.trim();
  }
  if (eventProofMeta && typeof eventProofMeta === "object") {
    const status = (eventProofMeta as Record<string, unknown>).ops_status;
    if (typeof status === "string" && status.trim()) return status.trim();
  }
  return "";
}

async function fetchAllRows<T>(
  fetchPage: (offset: number, limit: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let offset = 0; offset < MAX_ROWS_PER_ENTITY; offset += PAGE_SIZE) {
    const { data, error } = await fetchPage(offset, PAGE_SIZE);
    if (error) return { rows: [], error: error.message };
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return { rows, error: null };
}

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const auth = await requireUserProfile(supabase, {
    profileSelect: "warehouse_id, role",
    allowedRoles: [...ROUTE_PLANNING_VIEW_ROLES],
  });
  if (!auth.ok) return auth.response;

  const warehouseId = String(auth.profile.warehouse_id);
  const url = new URL(req.url);
  const fromIso = toIsoOrNull(url.searchParams.get("from"));
  const toIso = toIsoOrNull(url.searchParams.get("to"));

  if (fromIso && toIso && Date.parse(fromIso) > Date.parse(toIso)) {
    return NextResponse.json(
      { error: "Дата 'от' не может быть позже даты 'до'" },
      { status: 400 },
    );
  }

  const effectiveFrom = fromIso || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const effectiveTo = toIso || new Date().toISOString();

  const [couriersResult, shiftsRowsResult, tasksRowsResult, eventsRowsResult] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .eq("warehouse_id", warehouseId)
      .eq("role", "courier"),
    fetchAllRows<ShiftRow>(async (offset, limit) =>
      await supabaseAdmin
        .from("courier_shifts")
        .select("id, courier_user_id, status, started_at, closed_at, start_note, close_note")
        .eq("warehouse_id", warehouseId)
        .gte("started_at", effectiveFrom)
        .lte("started_at", effectiveTo)
        .order("started_at", { ascending: false })
        .range(offset, offset + limit - 1),
    ),
    fetchAllRows<TaskRow>(async (offset, limit) =>
      await supabaseAdmin
        .from("courier_tasks")
        .select(
          "id, courier_user_id, unit_id, shift_id, status, claimed_at, accepted_at, delivered_at, failed_at, returned_at, fail_reason, fail_comment, last_event_at, updated_at",
        )
        .eq("warehouse_id", warehouseId)
        .gte("updated_at", effectiveFrom)
        .lte("updated_at", effectiveTo)
        .order("updated_at", { ascending: false })
        .range(offset, offset + limit - 1),
    ),
    fetchAllRows<EventRow>(async (offset, limit) =>
      await supabaseAdmin
        .from("courier_task_events")
        .select(
          "id, courier_user_id, task_id, unit_id, event_type, happened_at, note, proof_meta, lat, lng",
        )
        .eq("warehouse_id", warehouseId)
        .gte("happened_at", effectiveFrom)
        .lte("happened_at", effectiveTo)
        .order("happened_at", { ascending: false })
        .range(offset, offset + limit - 1),
    ),
  ]);

  if (couriersResult.error) {
    return NextResponse.json({ error: couriersResult.error.message }, { status: 500 });
  }
  if (shiftsRowsResult.error) {
    return NextResponse.json({ error: shiftsRowsResult.error }, { status: 500 });
  }
  if (tasksRowsResult.error) {
    return NextResponse.json({ error: tasksRowsResult.error }, { status: 500 });
  }
  if (eventsRowsResult.error) {
    return NextResponse.json({ error: eventsRowsResult.error }, { status: 500 });
  }

  const tasks = tasksRowsResult.rows;
  const events = eventsRowsResult.rows;
  const shifts = shiftsRowsResult.rows;
  const courierNameById = new Map(
    (couriersResult.data || []).map((courier) => [courier.id, courier.full_name || "Без имени"]),
  );
  const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
  const taskById = new Map(tasks.map((task) => [task.id, task]));

  const unitIds = Array.from(
    new Set(
      [...tasks.map((task) => task.unit_id), ...events.map((event) => event.unit_id)].filter(Boolean),
    ),
  ) as string[];
  const { data: unitsRows, error: unitsError } = unitIds.length
    ? await supabaseAdmin.from("units").select("id, barcode, status, cell_id, meta").in("id", unitIds)
    : { data: [], error: null };
  if (unitsError) return NextResponse.json({ error: unitsError.message }, { status: 500 });

  const unitById = new Map((unitsRows || []).map((unit) => [unit.id, unit]));

  const eventSheetRows = events.map((event) => {
    const task = event.task_id ? taskById.get(event.task_id) : undefined;
    const unit = event.unit_id ? unitById.get(event.unit_id) : undefined;
    const shift = task?.shift_id ? shiftById.get(task.shift_id) : undefined;
    const courierId = event.courier_user_id || task?.courier_user_id || "";
    return {
      "Время события": safeText(event.happened_at),
      "Курьер ID": safeText(courierId),
      "Курьер": safeText(courierNameById.get(courierId) || "Без имени"),
      "Заказ ID": safeText(event.unit_id || task?.unit_id || ""),
      "Barcode": safeText(unit?.barcode || ""),
      "Тип события": safeText(event.event_type),
      "Статус задачи": safeText(task?.status || ""),
      "OPS статус": pickOpsStatus(event.proof_meta, unit?.meta),
      "Комментарий курьера": safeText(event.note || task?.fail_comment || ""),
      "Причина фейла": safeText(task?.fail_reason || ""),
      "Статус заказа": safeText(unit?.status || ""),
      "Ячейка": safeText(unit?.cell_id || ""),
      "Широта": safeText(event.lat),
      "Долгота": safeText(event.lng),
      "Accepted at": safeText(task?.accepted_at || ""),
      "Delivered at": safeText(task?.delivered_at || ""),
      "Failed at": safeText(task?.failed_at || ""),
      "Last event at": safeText(task?.last_event_at || ""),
      "Статус смены": safeText(shift?.status || ""),
      "Комментарий начала смены": safeText(shift?.start_note || ""),
      "Комментарий конца смены": safeText(shift?.close_note || ""),
    };
  });

  const taskSheetRows = tasks.map((task) => {
    const unit = task.unit_id ? unitById.get(task.unit_id) : undefined;
    const shift = task.shift_id ? shiftById.get(task.shift_id) : undefined;
    const courierId = task.courier_user_id || "";
    return {
      "Обновлено": safeText(task.updated_at),
      "Курьер ID": safeText(courierId),
      "Курьер": safeText(courierNameById.get(courierId) || "Без имени"),
      "Заказ ID": safeText(task.unit_id),
      "Barcode": safeText(unit?.barcode || ""),
      "Статус задачи": safeText(task.status),
      "Причина фейла": safeText(task.fail_reason || ""),
      "Комментарий курьера": safeText(task.fail_comment || ""),
      "Статус заказа": safeText(unit?.status || ""),
      "OPS статус": pickOpsStatus(null, unit?.meta),
      "Ячейка": safeText(unit?.cell_id || ""),
      "Claimed at": safeText(task.claimed_at || ""),
      "Accepted at": safeText(task.accepted_at || ""),
      "Delivered at": safeText(task.delivered_at || ""),
      "Failed at": safeText(task.failed_at || ""),
      "Returned at": safeText(task.returned_at || ""),
      "Last event at": safeText(task.last_event_at || ""),
      "Статус смены": safeText(shift?.status || ""),
      "Комментарий начала смены": safeText(shift?.start_note || ""),
      "Комментарий конца смены": safeText(shift?.close_note || ""),
    };
  });

  const metaSheetRows = [
    {
      "Период от": effectiveFrom,
      "Период до": effectiveTo,
      "Событий": events.length,
      "Задач": tasks.length,
      "Смен": shifts.length,
      "Сформировано": new Date().toISOString(),
    },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(eventSheetRows), "Events");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(taskSheetRows), "Tasks");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(metaSheetRows), "Meta");

  const file = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
  }) as ArrayBuffer;

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="routeplanning_export_${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
