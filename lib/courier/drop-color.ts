export type DropColorKey = "red" | "yellow" | "purple" | "gray" | "black" | "green" | "blue";

export const DROP_COLOR_HEX: Record<DropColorKey, string> = {
  red: "#ef4444",
  yellow: "#facc15",
  purple: "#7c3aed",
  gray: "#6b7280",
  black: "#111827",
  green: "#22c55e",
  blue: "#2563eb",
};

export const DROP_COLOR_LABEL: Record<DropColorKey, string> = {
  red: "Красный",
  yellow: "Желтый",
  purple: "Фиолетовый",
  gray: "Серый",
  black: "Черный",
  green: "Зеленый",
  blue: "Синий",
};

export function normalizeDropColorKey(value: unknown): DropColorKey | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "red") return "red";
  if (normalized === "yellow") return "yellow";
  if (normalized === "purple") return "purple";
  if (normalized === "gray" || normalized === "grey") return "gray";
  if (normalized === "black") return "black";
  if (normalized === "green") return "green";
  if (normalized === "blue") return "blue";
  return null;
}

export function mapOpsStatusToDropColorKey(opsStatus: string | null | undefined): DropColorKey {
  const normalized = (opsStatus || "").trim().toLowerCase();
  if (normalized === "partner_accepted_return") return "purple";
  if (normalized === "sent_to_sc") return "yellow";
  if (normalized === "client_accepted") return "gray";
  if (normalized === "delivered_to_pudo") return "black";
  return "red";
}

export function resolveDropColor(input: {
  opsStatus?: string | null;
  overrideColorKey?: unknown;
}): { color_key: DropColorKey; color_hex: string } {
  const override = normalizeDropColorKey(input.overrideColorKey);
  const colorKey = override || mapOpsStatusToDropColorKey(input.opsStatus);
  return {
    color_key: colorKey,
    color_hex: DROP_COLOR_HEX[colorKey],
  };
}

export function isAllowedOpsPointColorTransition(
  currentColor: DropColorKey,
  nextColor: DropColorKey,
): boolean {
  return (
    currentColor === "yellow" &&
    (nextColor === "red" || nextColor === "green" || nextColor === "blue")
  );
}
