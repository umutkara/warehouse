export function normalizeBarcodeDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function buildBarcodeCandidates(rawBarcode: unknown): string[] {
  const digits = normalizeBarcodeDigits(rawBarcode);
  const out = new Set<string>();
  if (!digits) return [];
  out.add(digits);

  if (digits.startsWith("00") && digits.length > 4) {
    out.add(digits.slice(2, -2));
  }
  if (!digits.startsWith("00")) {
    out.add(`00${digits}`);
    out.add(`00${digits}01`);
  } else {
    out.add(`${digits}01`);
  }
  if (!digits.endsWith("01")) {
    out.add(`${digits}01`);
  }

  return Array.from(out).filter(Boolean);
}

