import type { PackUnit } from "@/db/schema";

/**
 * Exact unit arithmetic for supplier invoice lines.
 *
 * Everything here is whole-number (BigInt) fraction math. No floating point touches a
 * quantity or a price, so "40 lb at $84.00" is exactly $2.10 per lb, every time.
 *
 * Two things can only be compared when they measure the same kind of thing. A case sold by
 * weight and a case sold by count are NOT comparable, and the functions here say so
 * explicitly instead of guessing.
 */

export type Dimension = "weight" | "volume" | "count";

/** An exact fraction. Always reduced; the denominator is always positive. */
export type Rational = { readonly n: bigint; readonly d: bigint };

const B0 = BigInt(0);
const B1 = BigInt(1);
const B2 = BigInt(2);
const B10 = BigInt(10);

function toBig(value: bigint | number): bigint {
  if (typeof value === "bigint") return value;
  if (!Number.isSafeInteger(value)) throw new Error(`Expected a whole number, got ${value}`);
  return BigInt(value);
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < B0 ? -a : a;
  let y = b < B0 ? -b : b;
  while (y !== B0) {
    [x, y] = [y, x % y];
  }
  return x;
}

export function rational(numerator: bigint | number, denominator: bigint | number = 1): Rational {
  const n = toBig(numerator);
  const d = toBig(denominator);
  if (d === B0) throw new Error("Cannot divide by zero");
  const divisor = gcd(n, d);
  const sign = d < B0 ? -B1 : B1;
  return { n: (sign * n) / divisor, d: (sign * d) / divisor };
}

export const ZERO: Rational = rational(0);

export function add(a: Rational, b: Rational): Rational {
  return rational(a.n * b.d + b.n * a.d, a.d * b.d);
}
export function subtract(a: Rational, b: Rational): Rational {
  return rational(a.n * b.d - b.n * a.d, a.d * b.d);
}
export function multiply(a: Rational, b: Rational): Rational {
  return rational(a.n * b.n, a.d * b.d);
}
export function divide(a: Rational, b: Rational): Rational {
  if (b.n === B0) throw new Error("Cannot divide by zero");
  return rational(a.n * b.d, a.d * b.n);
}
/** -1 when a < b, 0 when equal, 1 when a > b. */
export function compare(a: Rational, b: Rational): -1 | 0 | 1 {
  const left = a.n * b.d;
  const right = b.n * a.d;
  return left < right ? -1 : left > right ? 1 : 0;
}
export function equals(a: Rational, b: Rational): boolean {
  return compare(a, b) === 0;
}
export function isPositive(a: Rational): boolean {
  return a.n > B0;
}

/** Strictly reads a plain decimal such as "40", "2.5" or "10.000". Anything else throws. */
export function parseDecimal(text: string): Rational {
  const clean = text.trim();
  if (!/^\d{1,12}(\.\d{1,6})?$/.test(clean)) throw new Error(`Not a plain decimal number: "${text}"`);
  const [whole, fraction = ""] = clean.split(".");
  return rational(BigInt(whole + fraction), B10 ** BigInt(fraction.length));
}

/**
 * Rounds to a whole number, halves away from zero (so 0.5 becomes 1 and -0.5 becomes -1).
 * This is the one rounding rule used when a calculated amount has to become whole cents.
 */
export function roundHalfUp(value: Rational): bigint {
  const negative = value.n < B0;
  const n = negative ? -value.n : value.n;
  const rounded = (B2 * n + value.d) / (B2 * value.d);
  return negative ? -rounded : rounded;
}

/** A calculated amount as whole cents (see roundHalfUp). Throws if it cannot be a safe number. */
export function toWholeCents(value: Rational): number {
  const rounded = Number(roundHalfUp(value));
  if (!Number.isSafeInteger(rounded)) throw new Error("Amount is too large to store as cents");
  return rounded;
}

/** Fixed-decimals text for display, rounded half up. `exact` is false when rounding lost something. */
export function toFixed(value: Rational, places: number): { text: string; exact: boolean } {
  const scale = B10 ** BigInt(places);
  const scaled = rational(value.n * scale, value.d);
  const rounded = roundHalfUp(scaled);
  const negative = rounded < B0;
  const digits = (negative ? -rounded : rounded).toString().padStart(places + 1, "0");
  const whole = digits.slice(0, digits.length - places);
  const fraction = places > 0 ? `.${digits.slice(digits.length - places)}` : "";
  return { text: `${negative ? "-" : ""}${whole}${fraction}`, exact: scaled.d === B1 };
}

/*
 * Conversion factors to one base unit per dimension. These are definitions, not measurements:
 *  - weight, base gram: the international pound is exactly 453.59237 g; an ounce is 1/16 lb.
 *  - volume, base liter: the US liquid gallon is exactly 3.785411784 L; a quart is 1/4 gal.
 *  - count, base each.
 */
const UNITS: Record<PackUnit, { dimension: Dimension; toBase: Rational }> = {
  g: { dimension: "weight", toBase: rational(1) },
  kg: { dimension: "weight", toBase: rational(1000) },
  lb: { dimension: "weight", toBase: rational(45_359_237, 100_000) },
  oz: { dimension: "weight", toBase: rational(45_359_237, 1_600_000) },
  l: { dimension: "volume", toBase: rational(1) },
  gal: { dimension: "volume", toBase: rational(3_785_411_784, 1_000_000_000) },
  qt: { dimension: "volume", toBase: rational(946_352_946, 1_000_000_000) },
  each: { dimension: "count", toBase: rational(1) },
};

export function dimensionOf(unit: PackUnit): Dimension {
  return UNITS[unit].dimension;
}

export type Conversion =
  | { ok: true; value: Rational }
  | { ok: false; reason: "different_dimensions"; from: Dimension; to: Dimension };

/** Converts an amount between units of the same dimension. Never converts across dimensions. */
export function convertUnits(amount: Rational, from: PackUnit, to: PackUnit): Conversion {
  const source = UNITS[from];
  const target = UNITS[to];
  if (source.dimension !== target.dimension) {
    return { ok: false, reason: "different_dimensions", from: source.dimension, to: target.dimension };
  }
  return { ok: true, value: divide(multiply(amount, source.toBase), target.toBase) };
}

export type PackSpec = {
  /** Units per case, e.g. 4 bags per case. */
  packCount: number;
  /** Size of each unit as a plain decimal string, e.g. "10" or "2.500". */
  packSize: string;
  packUnit: PackUnit;
};

export type PricedPack = PackSpec & { casePriceCents: number };

/** Everything inside one case, in the case's own unit: packCount × packSize. */
export function caseContent(pack: PackSpec): Rational {
  return multiply(rational(pack.packCount), parseDecimal(pack.packSize));
}

export type UnitPriceComparison =
  | {
      comparable: true;
      dimension: Dimension;
      /** Both unit prices are expressed per this unit (the unit of the latest purchase). */
      unit: PackUnit;
      /** Content of one case of each purchase, in `unit`. */
      previousContent: Rational;
      latestContent: Rational;
      /** Cents per `unit`, exact. */
      previousUnitPriceCents: Rational;
      latestUnitPriceCents: Rational;
      direction: "up" | "down" | "same";
      /** (latest − previous) ÷ previous × 100, exact. */
      changePercent: Rational;
    }
  | { comparable: false; reason: "different_dimensions"; previousDimension: Dimension; latestDimension: Dimension }
  | { comparable: false; reason: "invalid_pack" }
  | { comparable: false; reason: "no_previous_price" };

/**
 * Compares two purchases of the same product on a per-unit basis (per lb, per gal, per each).
 * A bigger case at the same per-unit price comes back as direction "same".
 */
export function compareUnitPrices(previous: PricedPack, latest: PricedPack): UnitPriceComparison {
  const previousDimension = dimensionOf(previous.packUnit);
  const latestDimension = dimensionOf(latest.packUnit);
  if (previousDimension !== latestDimension) {
    return { comparable: false, reason: "different_dimensions", previousDimension, latestDimension };
  }
  let previousOwnContent: Rational;
  let latestContent: Rational;
  try {
    previousOwnContent = caseContent(previous);
    latestContent = caseContent(latest);
  } catch {
    return { comparable: false, reason: "invalid_pack" };
  }
  if (!isPositive(previousOwnContent) || !isPositive(latestContent)) return { comparable: false, reason: "invalid_pack" };
  if (!Number.isSafeInteger(previous.casePriceCents) || !Number.isSafeInteger(latest.casePriceCents)) {
    return { comparable: false, reason: "invalid_pack" };
  }
  if (previous.casePriceCents <= 0) return { comparable: false, reason: "no_previous_price" };

  const converted = convertUnits(previousOwnContent, previous.packUnit, latest.packUnit);
  if (!converted.ok) {
    return { comparable: false, reason: "different_dimensions", previousDimension, latestDimension };
  }
  const previousContent = converted.value;
  const previousUnitPriceCents = divide(rational(previous.casePriceCents), previousContent);
  const latestUnitPriceCents = divide(rational(latest.casePriceCents), latestContent);
  const order = compare(latestUnitPriceCents, previousUnitPriceCents);
  return {
    comparable: true,
    dimension: latestDimension,
    unit: latest.packUnit,
    previousContent,
    latestContent,
    previousUnitPriceCents,
    latestUnitPriceCents,
    direction: order > 0 ? "up" : order < 0 ? "down" : "same",
    changePercent: multiply(divide(subtract(latestUnitPriceCents, previousUnitPriceCents), previousUnitPriceCents), rational(100)),
  };
}

/**
 * True when the per-unit price rose by at least `thresholdBps` hundredths of a percent
 * (800 = 8%). Exact: 7.99% is below an 8% threshold and 8.00% meets it.
 */
export function roseByAtLeast(
  comparison: Extract<UnitPriceComparison, { comparable: true }>,
  thresholdBps: number,
): boolean {
  if (!Number.isSafeInteger(thresholdBps) || thresholdBps < 0) throw new Error("Threshold must be a whole number of basis points");
  const left = multiply(comparison.latestUnitPriceCents, rational(10_000));
  const right = multiply(comparison.previousUnitPriceCents, rational(10_000 + thresholdBps));
  return comparison.direction === "up" && compare(left, right) >= 0;
}

/**
 * (new unit price − previous unit price) × units billed, in whole cents.
 * Units billed = cases billed × content of one case. Rounded to the nearest cent, halves up.
 */
export function priceDifferenceCents(
  comparison: Extract<UnitPriceComparison, { comparable: true }>,
  casesBilled: number,
): number {
  const unitsBilled = multiply(rational(casesBilled), comparison.latestContent);
  const perUnit = subtract(comparison.latestUnitPriceCents, comparison.previousUnitPriceCents);
  return toWholeCents(multiply(perUnit, unitsBilled));
}
