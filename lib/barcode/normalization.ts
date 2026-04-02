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
    out.add(`00${digits}02`);
  } else {
    out.add(`${digits}01`);
  }
  if (!digits.endsWith("01")) {
    out.add(`${digits}01`);
  }

  return Array.from(out).filter(Boolean);
}

function reverseDigits(value: string): string {
  return value.split("").reverse().join("");
}

/**
 * Candidates for scanner input matching.
 * Includes direct variants and reversed-digit variants because some
 * scanners can emit reversed barcode strings in keyboard mode.
 */
export function buildScannerBarcodeCandidates(rawBarcode: unknown): string[] {
  const digits = normalizeBarcodeDigits(rawBarcode);
  if (!digits) return [];

  const out = new Set<string>();
  for (const c of buildBarcodeCandidates(digits)) out.add(c);

  const reversed = reverseDigits(digits);
  if (reversed && reversed !== digits) {
    for (const c of buildBarcodeCandidates(reversed)) out.add(c);
  }

  return Array.from(out).filter(Boolean);
}

export function pickBestBarcodeCandidate<T extends { barcode?: string | null }>(
  rows: T[] | T | null | undefined,
  orderedCandidates: string[],
): T | null {
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  if (!list.length || !orderedCandidates.length) return null;
  const rank = new Map<string, number>();
  orderedCandidates.forEach((c, i) => rank.set(c, i));
  return (
    [...list].sort((a, b) => {
      const aRank = rank.get(a.barcode ?? "") ?? Number.MAX_SAFE_INTEGER;
      const bRank = rank.get(b.barcode ?? "") ?? Number.MAX_SAFE_INTEGER;
      return aRank - bRank;
    })[0] ?? null
  );
}

