import { describe, expect, it } from "vitest";
import { buildBarcodeCandidates, normalizeBarcodeDigits } from "@/lib/barcode/normalization";

describe("barcode normalization", () => {
  it("keeps digits only from scanner input", () => {
    expect(normalizeBarcodeDigits(" 31-0286 24084 ")).toBe("31028624084");
  });

  it("builds candidates for plain warehouse barcode", () => {
    const candidates = buildBarcodeCandidates("31028624084");
    expect(candidates).toContain("31028624084");
    expect(candidates).toContain("003102862408401");
  });

  it("builds candidates for 00-prefixed barcode", () => {
    const candidates = buildBarcodeCandidates("003102862408401");
    expect(candidates).toContain("003102862408401");
    expect(candidates).toContain("31028624084");
  });

  it("returns empty list for invalid input", () => {
    expect(buildBarcodeCandidates("")).toEqual([]);
    expect(buildBarcodeCandidates("abc")).toEqual([]);
  });
});

