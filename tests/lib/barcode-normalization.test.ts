import { describe, expect, it } from "vitest";
import {
  buildBarcodeCandidates,
  buildScannerBarcodeCandidates,
  normalizeBarcodeDigits,
  pickBestBarcodeCandidate,
} from "@/lib/barcode/normalization";

describe("barcode normalization", () => {
  it("keeps digits only from scanner input", () => {
    expect(normalizeBarcodeDigits(" 31-0286 24084 ")).toBe("31028624084");
  });

  it("builds candidates for plain warehouse barcode", () => {
    const candidates = buildBarcodeCandidates("31028624084");
    expect(candidates).toContain("31028624084");
    expect(candidates).toContain("003102862408401");
    expect(candidates).toContain("003102862408402");
  });

  it("adds 00…01 and 00…02 padded variants for short numeric barcode", () => {
    const candidates = buildBarcodeCandidates("31030960442");
    expect(candidates).toContain("003103096044202");
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

  it("builds scanner candidates including reversed digits variants", () => {
    const candidates = buildScannerBarcodeCandidates("108002040301300");
    expect(candidates).toContain("108002040301300");
    expect(candidates).toContain("003103040200801");
  });

  it("picks best candidate by ordered preference", () => {
    const rows = [
      { id: "u2", barcode: "003103040200801" },
      { id: "u1", barcode: "108002040301300" },
    ];
    const chosen = pickBestBarcodeCandidate(rows, [
      "108002040301300",
      "003103040200801",
    ]);
    expect(chosen?.id).toBe("u1");
  });

  it("accepts a single row object in candidate picker", () => {
    const chosen = pickBestBarcodeCandidate(
      { id: "u1", barcode: "003103040200801" },
      ["108002040301300", "003103040200801"],
    );
    expect(chosen?.id).toBe("u1");
  });
});

