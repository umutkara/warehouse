import { supabaseAdmin } from "@/lib/supabase/admin";
import { executeCourierShiftClose } from "@/app/api/courier/_shared/execute-courier-shift-close";

/** Matches ops stats (`Asia/Baku`) — calendar day for overnight cutoff. */
export const DEFAULT_COURIER_BUSINESS_TIMEZONE = "Asia/Baku";

function calendarDateInTimeZone(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function isShiftStartedOnEarlierCalendarDay(
  startedAtIso: string,
  timeZone: string,
): boolean {
  const started = new Date(startedAtIso);
  const now = new Date();
  const startDay = calendarDateInTimeZone(started, timeZone);
  const today = calendarDateInTimeZone(now, timeZone);
  return startDay < today;
}

/**
 * If the courier has an open/closing shift that started on a previous calendar day
 * (in the business timezone), closes it using the same pipeline as manual close.
 */
export async function closeStaleCalendarDayCourierShiftIfNeeded(params: {
  warehouseId: string;
  courierUserId: string;
  closedByUserId: string;
  timeZone?: string;
}): Promise<boolean> {
  const tz = params.timeZone ?? DEFAULT_COURIER_BUSINESS_TIMEZONE;

  const { data: shift, error } = await supabaseAdmin
    .from("courier_shifts")
    .select("id, status, started_at, courier_user_id, warehouse_id")
    .eq("warehouse_id", params.warehouseId)
    .eq("courier_user_id", params.courierUserId)
    .in("status", ["open", "closing"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[shift/stale-day] shift lookup error:", error);
    return false;
  }

  if (!shift?.started_at) return false;
  if (!isShiftStartedOnEarlierCalendarDay(shift.started_at, tz)) return false;

  await executeCourierShiftClose({
    warehouseId: params.warehouseId,
    shift: { id: shift.id, courier_user_id: shift.courier_user_id },
    closedByUserId: params.closedByUserId,
    note: "Auto-closed: new calendar day (Asia/Baku business day)",
    shiftMeta: {
      source: "api.courier.shift.auto_calendar_day",
      business_timezone: tz,
    },
    auditExtra: {
      auto_calendar_day: true,
      business_timezone: tz,
    },
  });

  console.log("[shift/stale-day] Auto-closed shift for calendar day rollover", {
    shiftId: shift.id,
    courierUserId: params.courierUserId,
  });

  return true;
}
