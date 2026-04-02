export const COURIER_ALLOWED_ROLES = [
  "courier",
  "admin",
] as const;

export const WAREHOUSE_CONTROL_ROLES = [
  "admin",
] as const;

export const ACTIVE_TASK_STATUSES = [
  "claimed",
  "in_route",
  "arrived",
  "dropped",
] as const;

export const TERMINAL_TASK_STATUSES = [
  "delivered",
  "failed",
  "returned",
  "canceled",
] as const;

/** Matches filtering in GET /api/courier/tasks/my (exclude removed-from-hands / rejected tasks). */
export function courierTaskVisibleInCourierApp(meta: unknown): boolean {
  const m = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
  return m.hidden_from_courier !== true;
}

export function mapEventToTaskStatus(eventType: string): string {
  switch (eventType) {
    case "claimed":
      return "claimed";
    case "started_route":
      return "in_route";
    case "arrived":
      return "arrived";
    case "dropped":
      return "dropped";
    case "delivered":
      return "delivered";
    case "failed":
      return "failed";
    case "returned":
      return "returned";
    default:
      return "in_route";
  }
}
