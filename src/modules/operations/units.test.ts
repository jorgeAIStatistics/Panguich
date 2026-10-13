import { describe, expect, it } from "vitest";
import { describeCase, formatPercent, formatQuantity, formatUnitPrice } from "./format";
import {
  caseContent,
  compare,
  compareUnitPrices,
  convertUnits,
  dimensionOf,
  equals,
  parseDecimal,
  priceDifferenceCents,
  rational,
  roseByAtLeast,
  roundHalfUp,
  toFixed,
  type PricedPack,
} from "./units";

function converted(amount: string, from: Parameters<typeof convertUnits>[1], to: Parameters<typeof convertUnits>[2]) {
  const result = convertUnits(parseDecimal(amount), from, to);
  if (!result.ok) throw new Error("expected a conversion");
  return result.value;
}

function comparable(previous: PricedPack, latest: PricedPack) {
  const result = compareUnitPrices(previous, latest);
  if (!result.comparable) throw new Error(`expected a comparison, got ${result.reason}`);
  return result;
}

describe("exact unit conversion", () => {
  it("converts ounces and pounds exactly, both ways", () => {
    expect(equals(converted("16", "oz", "lb"), rational(1))).toBe(true);
    expect(equals(converted("640", "oz", "lb"), rational(40))).toBe(true);
    expect(equals(converted("2.5", "lb", "oz"), rational(40))).toBe(true);
    expect(equals(converted("1", "oz", "lb"), rational(1, 16))).toBe(true);
  });

  it("converts grams and kilograms exactly, both ways", () => {
    expect(equals(converted("1000", "g", "kg"), rational(1))).toBe(true);
    expect(equals(converted("2.5", "kg", "g"), rational(2500))).toBe(true);
    expect(equals(converted("1", "g", "kg"), rational(1, 1000))).toBe(true);
  });

  it("converts quarts and gallons exactly, both ways", () => {
    expect(equals(converted("4", "qt", "gal"), rational(1))).toBe(true);
    expect(equals(converted("2.5", "gal", "qt"), rational(10))).toBe(true);
    expect(equals(converted("1", "qt", "gal"), rational(1, 4))).toBe(true);
  });

  it("uses the defined metric factors without rounding", () => {
    // 1 lb is exactly 453.59237 g; 1 US gallon is exactly 3.785411784 L.
    expect(equals(converted("1", "lb", "g"), rational(45_359_237, 100_000))).toBe(true);
    expect(equals(converted("1", "kg", "lb"), rational(100_000_000, 45_359_237))).toBe(true);
    expect(equals(converted("1", "gal", "l"), rational(3_785_411_784, 1_000_000_000))).toBe(true);
    // There and back again is the identity, with no drift.
    const there = converted("7.125", "lb", "kg");
    const back = convertUnits(there, "kg", "lb");
    expect(back.ok && equals(back.value, parseDecimal("7.125"))).toBe(true);
  });

  it("refuses to convert between different kinds of unit", () => {
    expect(convertUnits(rational(1), "each", "lb")).toEqual({ ok: false, reason: "different_dimensions", from: "count", to: "weight" });
    expect(convertUnits(rational(1), "gal", "kg")).toEqual({ ok: false, reason: "different_dimensions", from: "volume", to: "weight" });
    expect(dimensionOf("qt")).toBe("volume");
    expect(dimensionOf("oz")).toBe("weight");
    expect(dimensionOf("each")).toBe("count");
  });

  it("reads pack sizes strictly", () => {
    expect(equals(parseDecimal("40.000"), rational(40))).toBe(true);
    expect(equals(parseDecimal("2.5"), rational(5, 2))).toBe(true);
    expect(() => parseDecimal("40 lb")).toThrow();
    expect(() => parseDecimal("-1")).toThrow();
    expect(() => parseDecimal("1e3")).toThrow();
    expect(equals(caseContent({ packCount: 4, packSize: "2.5", packUnit: "gal" }), rational(10))).toBe(true);
  });
});

describe("rounding", () => {
  it("rounds halves away from zero", () => {
    expect(roundHalfUp(rational(1, 2))).toBe(BigInt(1));
    expect(roundHalfUp(rational(149, 100))).toBe(BigInt(1));
    expect(roundHalfUp(rational(3, 2))).toBe(BigInt(2));
    expect(roundHalfUp(rational(-1, 2))).toBe(BigInt(-1));
    expect(roundHalfUp(rational(7))).toBe(BigInt(7));
  });

  it("formats fixed decimals and says when it had to round", () => {
    expect(toFixed(rational(21, 10), 2)).toEqual({ text: "2.10", exact: true });
    expect(toFixed(rational(1, 3), 4)).toEqual({ text: "0.3333", exact: false });
    expect(toFixed(rational(5, 1000), 2)).toEqual({ text: "0.01", exact: false });
  });
});

describe("price per unit", () => {
  const forty = { packCount: 1, packSize: "40", packUnit: "lb" } as const;

  it("works out an exact price per lb", () => {
    const result = comparable({ ...forty, casePriceCents: 8400 }, { ...forty, casePriceCents: 9920 });
    expect(result.unit).toBe("lb");
    expect(equals(result.previousUnitPriceCents, rational(210))).toBe(true);
    expect(equals(result.latestUnitPriceCents, rational(248))).toBe(true);
    expect(result.direction).toBe("up");
    expect(formatPercent(result.changePercent)).toBe("18.1%");
    expect(formatUnitPrice(result.latestUnitPriceCents, "en")).toBe("$2.48");
  });

  it("sees a larger case at the same price per lb as no change", () => {
    const result = comparable({ ...forty, casePriceCents: 2600 }, { packCount: 1, packSize: "50", packUnit: "lb", casePriceCents: 3250 });
    expect(result.direction).toBe("same");
    expect(compare(result.latestContent, result.previousContent)).toBe(1);
    expect(roseByAtLeast(result, 0)).toBe(false);
  });

  it("compares across units of the same kind (oz against lb)", () => {
    // 640 oz is 40 lb, so $84.00 for either is $2.10 per lb.
    const result = comparable({ packCount: 1, packSize: "640", packUnit: "oz", casePriceCents: 8400 }, { ...forty, casePriceCents: 8400 });
    expect(result.direction).toBe("same");
    expect(equals(result.previousContent, rational(40))).toBe(true);
  });

  it("applies the threshold exactly", () => {
    const base = { ...forty, casePriceCents: 10_000 };
    expect(roseByAtLeast(comparable(base, { ...forty, casePriceCents: 10_799 }), 800)).toBe(false);
    expect(roseByAtLeast(comparable(base, { ...forty, casePriceCents: 10_800 }), 800)).toBe(true);
    expect(roseByAtLeast(comparable(base, { ...forty, casePriceCents: 9_000 }), 800)).toBe(false);
  });

  it("says plainly when two purchases cannot be compared", () => {
    expect(compareUnitPrices({ packCount: 12, packSize: "1", packUnit: "each", casePriceCents: 2400 }, { ...forty, casePriceCents: 9920 })).toEqual({
      comparable: false,
      reason: "different_dimensions",
      previousDimension: "count",
      latestDimension: "weight",
    });
    expect(compareUnitPrices({ ...forty, casePriceCents: 0 }, { ...forty, casePriceCents: 9920 })).toEqual({ comparable: false, reason: "no_previous_price" });
    expect(compareUnitPrices({ ...forty, packSize: "0", casePriceCents: 100 }, { ...forty, casePriceCents: 9920 })).toEqual({ comparable: false, reason: "invalid_pack" });
  });

  it("turns the difference into whole cents, rounding halves up", () => {
    const rise = comparable({ ...forty, casePriceCents: 8400 }, { ...forty, casePriceCents: 9920 });
    // $0.38 more per lb × (3 cases × 40 lb) = $45.60
    expect(priceDifferenceCents(rise, 3)).toBe(4560);

    // 3 lb case: 100¢ → 110¢ is 3.333…¢ more per lb. One case: 10¢ exactly.
    const three = { packCount: 1, packSize: "3", packUnit: "lb" } as const;
    expect(priceDifferenceCents(comparable({ ...three, casePriceCents: 100 }, { ...three, casePriceCents: 110 }), 1)).toBe(10);

    // Previous 3 lb at 100¢ (33.33…¢/lb), latest 1 lb at 34¢: 0.666…¢ more per lb × 1 lb → rounds to 1¢.
    const one = { packCount: 1, packSize: "1", packUnit: "lb" } as const;
    expect(priceDifferenceCents(comparable({ ...three, casePriceCents: 100 }, { ...one, casePriceCents: 34 }), 1)).toBe(1);
    // …and 0.5¢ exactly rounds up to 1¢: previous 2 lb at 99¢ (49.5¢/lb), latest 1 lb at 50¢.
    const two = { packCount: 1, packSize: "2", packUnit: "lb" } as const;
    expect(priceDifferenceCents(comparable({ ...two, casePriceCents: 99 }, { ...one, casePriceCents: 50 }), 1)).toBe(1);
  });
});

describe("plain-words formatting", () => {
  it("describes case sizes in both languages", () => {
    expect(describeCase({ packCount: 1, packSize: "40", packUnit: "lb" }, "en")).toBe("40 lb case");
    expect(describeCase({ packCount: 1, packSize: "40.000", packUnit: "lb" }, "es")).toBe("caja de 40 lb");
    expect(describeCase({ packCount: 2, packSize: "2.5", packUnit: "gal" }, "en")).toBe("2 × 2.5 gal case (5 gal)");
    expect(describeCase({ packCount: 12, packSize: "1", packUnit: "each" }, "es")).toBe("caja de 12 × 1 unidad (12 unidades)");
  });

  it("shows unit prices without inventing precision", () => {
    expect(formatUnitPrice(rational(65), "en")).toBe("$0.65");
    expect(formatUnitPrice(rational(1305, 20), "en")).toBe("$0.6525");
    expect(formatUnitPrice(rational(100, 3), "en")).toBe("about $0.3333");
    expect(formatUnitPrice(rational(100, 3), "es")).toBe("aprox. $0.3333");
    expect(formatQuantity(rational(5, 2), "en")).toBe("2.5");
    expect(formatQuantity(rational(120), "en")).toBe("120");
  });
});
