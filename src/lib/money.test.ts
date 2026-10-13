import { describe, expect, it } from "vitest";
import { assertCents, formatUsd, multiplyCents, parseUsdToCents, sumCents } from "./money";

describe("money (integer cents)", () => {
  it("parses typed dollar amounts exactly", () => {
    expect(parseUsdToCents("18.5")).toBe(1850);
    expect(parseUsdToCents("$1,250")).toBe(125000);
    expect(parseUsdToCents(" 0.07 ")).toBe(7);
    expect(parseUsdToCents("19.99")).toBe(1999);
  });

  it("refuses anything ambiguous instead of guessing", () => {
    for (const bad of ["", "abc", "12.345", "-5", "1e3", "12,5.0.1", "$"]) {
      expect(parseUsdToCents(bad)).toBeNull();
    }
  });

  it("adds without floating point drift", () => {
    // 0.1 + 0.2 !== 0.3 in floats; in cents it is exact.
    expect(sumCents([10, 20])).toBe(30);
    expect(sumCents(Array.from({ length: 1000 }, () => 1399))).toBe(1_399_000);
  });

  it("rejects fractional cents and fractional quantities", () => {
    expect(() => assertCents(10.5)).toThrow();
    expect(() => multiplyCents(1399, 1.5)).toThrow();
    expect(multiplyCents(1399, 12)).toBe(16788);
  });

  it("formats in both languages", () => {
    expect(formatUsd(1399, "en")).toBe("$13.99");
    expect(formatUsd(125000, "es")).toContain("1,250.00");
  });
});
