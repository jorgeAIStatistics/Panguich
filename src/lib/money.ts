import { intlLocale, type Locale } from "./i18n";

/**
 * All money is stored and calculated as integer US cents. Never use floats for money.
 */
export type Cents = number;

export function assertCents(value: number, label = "amount"): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a whole number of cents, got ${value}`);
  }
  return value;
}

export function formatUsd(cents: Cents, locale: Locale = "en"): string {
  assertCents(cents);
  return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: "USD" }).format(cents / 100);
}

/**
 * Strictly parses a user-typed dollar amount ("1,250", "$18.50", "18.5") into cents.
 * Returns null for anything ambiguous instead of guessing.
 */
export function parseUsdToCents(input: string): Cents | null {
  const cleaned = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((total, value) => total + assertCents(value), 0);
}

/** Multiplies a unit price by a whole quantity. Quantities with fractions must be handled explicitly. */
export function multiplyCents(unitCents: Cents, quantity: number): Cents {
  if (!Number.isSafeInteger(quantity)) throw new Error(`quantity must be a whole number, got ${quantity}`);
  return assertCents(unitCents * quantity);
}
