const ROLE_INHERITANCE: Record<string, string[]> = {
  compliance: ["guest"],
};

function collectRoles(role: string, roles: Set<string>) {
  if (!role || roles.has(role)) return;
  roles.add(role);
  const inheritedRoles = ROLE_INHERITANCE[role] || [];
  inheritedRoles.forEach((inheritedRole) => collectRoles(inheritedRole, roles));
}

export function getEffectiveRoles(role: string | null | undefined): string[] {
  if (!role) return [];
  const roles = new Set<string>();
  collectRoles(role, roles);
  return Array.from(roles);
}

export function hasAnyRole(
  role: string | null | undefined,
  allowedRoles: string[],
): boolean {
  if (!role) return false;
  const effectiveRoles = new Set(getEffectiveRoles(role));
  return allowedRoles.some((allowedRole) => effectiveRoles.has(allowedRole));
}
