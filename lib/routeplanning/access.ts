import { hasAnyRole } from "@/app/api/_shared/role-access";

export const ROUTE_PLANNING_EDIT_ROLES = ["logistics", "admin"] as const;

export const ROUTE_PLANNING_VIEW_ROLES = [
  "worker",
  "manager",
  "head",
  "admin",
  "hub_worker",
  "ops",
  "logistics",
  "compliance",
] as const;

export function canViewRoutePlanning(role: string | null | undefined): boolean {
  return hasAnyRole(role, [...ROUTE_PLANNING_VIEW_ROLES]);
}

export function canEditRoutePlanning(role: string | null | undefined): boolean {
  return hasAnyRole(role, [...ROUTE_PLANNING_EDIT_ROLES]);
}
