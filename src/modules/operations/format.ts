import type { PackUnit } from "@/db/schema";
import type { Bilingual, Locale } from "@/lib/i18n";
import { LOCALES } from "@/lib/i18n";
import { formatUsd } from "@/lib/money";
import { formatIsoDate } from "@/lib/time";
import { caseContent, equals, parseDecimal, rational, toFixed, type PackSpec, type Rational } from "./units";

/** Builds the same sentence in both languages from one function. */
export function bilingual(build: (locale: Locale) => string): Bilingual {
  return Object.fromEntries(LOCALES.map((locale) => [locale, build(locale)])) as Bilingual;
}

const UNIT_LABELS: Record<PackUnit, { en: [one: string, many: string]; es: [one: string, many: string] }> = {
  lb: { en: ["lb", "lb"], es: ["lb", "lb"] },
  oz: { en: ["oz", "oz"], es: ["oz", "oz"] },
  kg: { en: ["kg", "kg"], es: ["kg", "kg"] },
  g: { en: ["g", "g"], es: ["g", "g"] },
  gal: { en: ["gal", "gal"], es: ["gal", "gal"] },
  qt: { en: ["qt", "qt"], es: ["qt", "qt"] },
  l: { en: ["L", "L"], es: ["L", "L"] },
  each: { en: ["unit", "units"], es: ["unidad", "unidades"] },
};

export function unitLabel(unit: PackUnit, locale: Locale, plural = false): string {
  return UNIT_LABELS[unit][locale][plural ? 1 : 0];
}

/** "per lb" / "por lb" */
export function perUnit(unit: PackUnit, locale: Locale): string {
  return `${locale === "es" ? "por" : "per"} ${unitLabel(unit, locale)}`;
}

/** A quantity without trailing zeros: 40, 2.5, 0.125. Marked "about" only if it had to be rounded. */
export function formatQuantity(value: Rational, locale: Locale): string {
  const fixed = toFixed(value, 3);
  const text = fixed.text.includes(".") ? fixed.text.replace(/0+$/, "").replace(/\.$/, "") : fixed.text;
  return fixed.exact ? text : `${locale === "es" ? "aprox." : "about"} ${text}`;
}

/**
 * A per-unit price given in exact cents. Shows whole cents when that is exact ($2.10), four
 * decimals when needed ($0.6533), and says "about" when even that had to be rounded.
 */
export function formatUnitPrice(cents: Rational, locale: Locale): string {
  const dollars: Rational = { n: cents.n, d: cents.d * BigInt(100) };
  const twoPlaces = toFixed(dollars, 2);
  if (twoPlaces.exact) return `$${twoPlaces.text}`;
  const fourPlaces = toFixed(dollars, 4);
  return fourPlaces.exact ? `$${fourPlaces.text}` : `${locale === "es" ? "aprox." : "about"} $${fourPlaces.text}`;
}

/** "18.1%" — one decimal, rounded half up. */
export function formatPercent(percent: Rational): string {
  return `${toFixed(percent, 1).text}%`;
}

/** "40 lb case" / "caja de 40 lb"; "4 × 10 lb case (40 lb)" / "caja de 4 × 10 lb (40 lb)". */
export function describeCase(pack: PackSpec, locale: Locale): string {
  const amount = (value: Rational) =>
    `${formatQuantity(value, locale)} ${unitLabel(pack.packUnit, locale, !equals(value, rational(1)))}`;
  const total = amount(caseContent(pack));
  if (pack.packCount === 1) return locale === "es" ? `caja de ${total}` : `${total} case`;
  const each = amount(parseDecimal(pack.packSize));
  return locale === "es" ? `caja de ${pack.packCount} × ${each} (${total})` : `${pack.packCount} × ${each} case (${total})`;
}

export function formatMoney(cents: number, locale: Locale): string {
  return formatUsd(cents, locale);
}

/** "Oct 8, 2026" / "8 oct 2026" */
export function formatInvoiceDate(isoDate: string, locale: Locale): string {
  return formatIsoDate(isoDate, locale, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Plain names for product keys. A product key is assigned when an invoice is imported; it is
 * never taken from the free text of a document. Unknown keys fall back to the key itself.
 */
const PRODUCT_LABELS: Record<string, Bilingual> = {
  "pork-shoulder": { en: "pork shoulder", es: "paleta de cerdo" },
  "yellow-onions": { en: "yellow onions", es: "cebolla amarilla" },
  "frying-oil": { en: "frying oil", es: "aceite para freír" },
};

export function productLabel(productKey: string, locale: Locale): string {
  return PRODUCT_LABELS[productKey]?.[locale] ?? productKey.replace(/-/g, " ");
}

export function capitalize(text: string): string {
  return text.length ? text[0].toLocaleUpperCase() + text.slice(1) : text;
}
