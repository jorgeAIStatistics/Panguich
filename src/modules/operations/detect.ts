import { asc, eq } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db/client";
import {
  exceptionEvents,
  financialExceptions,
  importBatches,
  supplierInvoiceLines,
  supplierInvoices,
  type ExceptionEvidence,
  type ExceptionKind,
  type PackUnit,
} from "@/db/schema";
import { authorize, writeAudit, type Actor } from "@/lib/audit";
import { newId } from "@/lib/ids";
import type { Bilingual } from "@/lib/i18n";
import {
  bilingual,
  capitalize,
  describeCase,
  formatInvoiceDate,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatUnitPrice,
  perUnit,
  productLabel,
  unitLabel,
} from "./format";
import { draftDuplicateQuestion, draftPriceQuestion } from "./question";
import {
  compare,
  compareUnitPrices,
  multiply,
  priceDifferenceCents,
  rational,
  roseByAtLeast,
  subtract,
  type PackSpec,
  type UnitPriceComparison,
} from "./units";

/**
 * Deterministic checks over stored supplier invoice lines.
 *
 * These functions only ever see structured fields: numbers, dates, units, a product key.
 * They are never given the free text of a document (`rawText`, `rawDescription`), so nothing
 * written inside an invoice can change what is found, what it is worth, or what happens next.
 */

/**
 * A per-unit price rise below this is not raised as a question.
 * 800 basis points = 8%. Compared exactly: 7.99% is below, 8.00% is flagged.
 */
export const UNIT_PRICE_INCREASE_THRESHOLD_BPS = 800;

export type DetectLine = {
  id: string;
  invoiceId: string;
  lineNo: number;
  productKey: string;
  /** Cases billed. Zero or negative lines are never used for price comparison. */
  quantity: number;
  packCount: number;
  packSize: string;
  packUnit: PackUnit;
  casePriceCents: number;
  isCredit: boolean;
};

export type DetectInvoice = {
  id: string;
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalCents: number;
  importedAt: Date | null;
  isSynthetic: boolean;
  lines: DetectLine[];
};

export type Finding = {
  /** The same finding always maps to the same key, so it is stored once. */
  dedupeKey: string;
  kind: ExceptionKind;
  supplierId: string;
  productKey: string | null;
  /** A question to verify, not money owed. */
  suspectedAmountCents: number;
  evidence: ExceptionEvidence;
  draftQuestion: Bilingual;
  isSynthetic: boolean;
};

export type CheckedOutcome =
  | "larger_case_same_unit_price"
  | "smaller_case_same_unit_price"
  | "same_price"
  | "lower_unit_price"
  | "below_threshold"
  | "not_comparable"
  | "nothing_to_compare";

/** A product that was looked at and did not produce a question, with the reason. */
export type CheckedProduct = {
  supplierId: string;
  productKey: string;
  outcome: CheckedOutcome;
  summary: Bilingual;
  lineIds: string[];
  invoiceIds: string[];
  isSynthetic: boolean;
};

export type Analysis = { findings: Finding[]; checked: CheckedProduct[] };

type Purchase = { line: DetectLine; invoice: DetectInvoice };

function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function invoiceOrder(a: DetectInvoice, b: DetectInvoice): number {
  return (
    byText(a.invoiceDate, b.invoiceDate) ||
    (a.importedAt?.getTime() ?? 0) - (b.importedAt?.getTime() ?? 0) ||
    byText(a.invoiceNumber, b.invoiceNumber) ||
    byText(a.id, b.id)
  );
}

function purchaseOrder(a: Purchase, b: Purchase): number {
  return invoiceOrder(a.invoice, b.invoice) || a.line.lineNo - b.line.lineNo || byText(a.line.id, b.line.id);
}

function packOf(line: DetectLine): PackSpec {
  return { packCount: line.packCount, packSize: line.packSize, packUnit: line.packUnit };
}

/* ------------------------------------------------------------------ */
/* Possible duplicate invoices                                         */
/* ------------------------------------------------------------------ */

export type DuplicatePair = { earlier: DetectInvoice; later: DetectInvoice; reason: "same_number" | "same_date_total" };

/**
 * Two stored invoices from one supplier that look like the same bill:
 * the same invoice number, or the same date and total under different numbers.
 */
export function findDuplicatePairs(invoices: readonly DetectInvoice[]): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  const firstByNumber = new Map<string, DetectInvoice>();
  const firstByDateTotal = new Map<string, DetectInvoice>();
  for (const invoice of [...invoices].sort(invoiceOrder)) {
    const numberKey = `${invoice.supplierId}\u0000${invoice.invoiceNumber.trim().toUpperCase()}`;
    const dateTotalKey = `${invoice.supplierId}\u0000${invoice.invoiceDate}\u0000${invoice.totalCents}`;
    const sameNumber = firstByNumber.get(numberKey);
    const sameDateTotal = invoice.totalCents > 0 ? firstByDateTotal.get(dateTotalKey) : undefined;
    // A second document with a zero or negative total is not a second charge.
    if (sameNumber && invoice.totalCents > 0) {
      pairs.push({ earlier: sameNumber, later: invoice, reason: "same_number" });
    } else if (sameDateTotal) {
      pairs.push({ earlier: sameDateTotal, later: invoice, reason: "same_date_total" });
    }
    if (!sameNumber) firstByNumber.set(numberKey, invoice);
    if (invoice.totalCents > 0 && !firstByDateTotal.has(dateTotalKey)) firstByDateTotal.set(dateTotalKey, invoice);
  }
  return pairs;
}

function duplicateFinding(pair: DuplicatePair): Finding {
  const { earlier, later, reason } = pair;
  const summary = bilingual((locale) =>
    reason === "same_number"
      ? locale === "es"
        ? `El número de factura ${later.invoiceNumber} aparece dos veces`
        : `Invoice number ${later.invoiceNumber} appears twice`
      : locale === "es"
        ? `Dos facturas con la misma fecha y el mismo total (${formatMoney(later.totalCents, locale)})`
        : `Two invoices with the same date and the same total (${formatMoney(later.totalCents, locale)})`,
  );
  const describe = (invoice: DetectInvoice) =>
    bilingual((locale) =>
      locale === "es"
        ? `Factura ${invoice.invoiceNumber}, ${formatInvoiceDate(invoice.invoiceDate, locale)}, total ${formatMoney(invoice.totalCents, locale)}`
        : `Invoice ${invoice.invoiceNumber}, ${formatInvoiceDate(invoice.invoiceDate, locale)}, total ${formatMoney(invoice.totalCents, locale)}`,
    );
  return {
    dedupeKey: `possible_duplicate:${later.supplierId}:${earlier.id}:${later.id}`,
    kind: "possible_duplicate",
    supplierId: later.supplierId,
    productKey: null,
    suspectedAmountCents: later.totalCents,
    isSynthetic: earlier.isSynthetic || later.isSynthetic,
    evidence: {
      lineIds: [...earlier.lines, ...later.lines].map((line) => line.id),
      invoiceIds: [earlier.id, later.id],
      flaggedLineId: null,
      summary,
      calculation: [
        { label: { en: "First document", es: "Primer documento" }, value: describe(earlier) },
        { label: { en: "Second document", es: "Segundo documento" }, value: describe(later) },
        {
          label: { en: "What matches", es: "Qué coincide" },
          value:
            reason === "same_number"
              ? { en: "Same supplier and same invoice number", es: "Mismo proveedor y mismo número de factura" }
              : { en: "Same supplier, same date and same total", es: "Mismo proveedor, misma fecha y mismo total" },
        },
        {
          label: { en: "Amount to ask about", es: "Monto por consultar" },
          value: bilingual((locale) =>
            locale === "es"
              ? `${formatMoney(later.totalCents, locale)} (el total del segundo documento)`
              : `${formatMoney(later.totalCents, locale)} (the total of the second document)`,
          ),
        },
      ],
      caveats: [
        {
          en: "It may be a legitimate repeat order: two real deliveries can look alike.",
          es: "Puede ser un pedido repetido legítimo: dos entregas reales pueden parecerse.",
        },
        {
          en: "A corrected or reissued invoice can reuse a number. Check which one was actually paid.",
          es: "Una factura corregida o reemitida puede repetir el número. Revisa cuál se pagó realmente.",
        },
        {
          en: "This system does not see payments, so it cannot tell whether either one was paid.",
          es: "Este sistema no ve los pagos, así que no puede saber si alguna de las dos se pagó.",
        },
      ],
    },
    draftQuestion: draftDuplicateQuestion({ reason, earlier, later }),
  };
}

/* ------------------------------------------------------------------ */
/* Per-unit price increases                                            */
/* ------------------------------------------------------------------ */

type Comparable = Extract<UnitPriceComparison, { comparable: true }>;

function priceFinding(previous: Purchase, latest: Purchase, comparison: Comparable, purchaseCount: number, thresholdBps: number): Finding {
  const unit = comparison.unit;
  const amountCents = priceDifferenceCents(comparison, latest.line.quantity);
  const perUnitRise = subtract(comparison.latestUnitPriceCents, comparison.previousUnitPriceCents);
  const unitsBilled = multiply(rational(latest.line.quantity), comparison.latestContent);
  const thresholdText = formatPercent(rational(thresholdBps, 100));
  const productKey = latest.line.productKey;

  const purchaseText = (purchase: Purchase, unitPrice: Comparable["latestUnitPriceCents"]) =>
    bilingual((locale) =>
      locale === "es"
        ? `Factura ${purchase.invoice.invoiceNumber} (${formatInvoiceDate(purchase.invoice.invoiceDate, locale)}): ${describeCase(packOf(purchase.line), locale)} a ${formatMoney(purchase.line.casePriceCents, locale)} = ${formatUnitPrice(unitPrice, locale)} ${perUnit(unit, locale)}`
        : `Invoice ${purchase.invoice.invoiceNumber} (${formatInvoiceDate(purchase.invoice.invoiceDate, locale)}): ${describeCase(packOf(purchase.line), locale)} at ${formatMoney(purchase.line.casePriceCents, locale)} = ${formatUnitPrice(unitPrice, locale)} ${perUnit(unit, locale)}`,
    );

  const caveats: Bilingual[] = [
    {
      en: "The market price may have changed. A higher price is not necessarily a billing mistake.",
      es: "El precio de mercado puede haber cambiado. Un precio más alto no es necesariamente un error de facturación.",
    },
    {
      en: "No contract or agreed price is on file, so there is nothing to compare against except the previous invoice.",
      es: "No hay contrato ni precio acordado registrado, así que solo se puede comparar con la factura anterior.",
    },
  ];
  if (purchaseCount <= 2) {
    caveats.push({
      en: "Only two purchases to compare. That is too little history to know what the usual price is.",
      es: "Solo hay dos compras para comparar. Es muy poco historial para saber cuál es el precio habitual.",
    });
  }
  caveats.push({
    en: "The product may have changed (grade, cut or brand) even though it is filed under the same name.",
    es: "El producto puede haber cambiado (calidad, corte o marca) aunque esté registrado con el mismo nombre.",
  });

  return {
    dedupeKey: `unit_price_increase:${latest.invoice.supplierId}:${productKey}:${latest.line.id}`,
    kind: "unit_price_increase",
    supplierId: latest.invoice.supplierId,
    productKey,
    suspectedAmountCents: amountCents,
    isSynthetic: previous.invoice.isSynthetic || latest.invoice.isSynthetic,
    evidence: {
      lineIds: [previous.line.id, latest.line.id],
      invoiceIds: [previous.invoice.id, latest.invoice.id],
      flaggedLineId: latest.line.id,
      summary: bilingual((locale) =>
        locale === "es"
          ? `${capitalize(productLabel(productKey, locale))}: el precio ${perUnit(unit, locale)} subió ${formatPercent(comparison.changePercent)}`
          : `${capitalize(productLabel(productKey, locale))}: the price ${perUnit(unit, locale)} went up ${formatPercent(comparison.changePercent)}`,
      ),
      calculation: [
        { label: { en: "Previous purchase", es: "Compra anterior" }, value: purchaseText(previous, comparison.previousUnitPriceCents) },
        { label: { en: "Latest purchase", es: "Compra más reciente" }, value: purchaseText(latest, comparison.latestUnitPriceCents) },
        {
          label: bilingual((locale) => (locale === "es" ? `Cambio ${perUnit(unit, locale)}` : `Change ${perUnit(unit, locale)}`)),
          value: bilingual((locale) =>
            locale === "es"
              ? `${formatUnitPrice(comparison.latestUnitPriceCents, locale)} − ${formatUnitPrice(comparison.previousUnitPriceCents, locale)} = ${formatUnitPrice(perUnitRise, locale)} más ${perUnit(unit, locale)} (+${formatPercent(comparison.changePercent)})`
              : `${formatUnitPrice(comparison.latestUnitPriceCents, locale)} − ${formatUnitPrice(comparison.previousUnitPriceCents, locale)} = ${formatUnitPrice(perUnitRise, locale)} more ${perUnit(unit, locale)} (+${formatPercent(comparison.changePercent)})`,
          ),
        },
        {
          label: { en: "Why it is listed", es: "Por qué aparece" },
          value: {
            en: `The rise is ${thresholdText} or more. Smaller changes are not raised.`,
            es: `La subida es de ${thresholdText} o más. Los cambios menores no se señalan.`,
          },
        },
        {
          label: { en: "Quantity billed at the new price", es: "Cantidad facturada al precio nuevo" },
          value: bilingual((locale) => {
            const cases = latest.line.quantity;
            const total = `${formatQuantity(unitsBilled, locale)} ${unitLabel(unit, locale, true)}`;
            return locale === "es"
              ? `${cases} ${cases === 1 ? "caja" : "cajas"} × ${formatQuantity(comparison.latestContent, locale)} ${unitLabel(unit, locale, true)} = ${total}`
              : `${cases} ${cases === 1 ? "case" : "cases"} × ${formatQuantity(comparison.latestContent, locale)} ${unitLabel(unit, locale, true)} = ${total}`;
          }),
        },
        {
          label: { en: "Amount to ask about", es: "Monto por consultar" },
          value: bilingual((locale) =>
            locale === "es"
              ? `${formatUnitPrice(perUnitRise, locale)} × ${formatQuantity(unitsBilled, locale)} ${unitLabel(unit, locale, true)} = ${formatMoney(amountCents, locale)} (redondeado al centavo más cercano)`
              : `${formatUnitPrice(perUnitRise, locale)} × ${formatQuantity(unitsBilled, locale)} ${unitLabel(unit, locale, true)} = ${formatMoney(amountCents, locale)} (rounded to the nearest cent)`,
          ),
        },
      ],
      caveats,
    },
    draftQuestion: draftPriceQuestion({
      productKey,
      unit,
      previous: {
        invoiceNumber: previous.invoice.invoiceNumber,
        invoiceDate: previous.invoice.invoiceDate,
        pack: packOf(previous.line),
        casePriceCents: previous.line.casePriceCents,
        unitPriceCents: comparison.previousUnitPriceCents,
      },
      latest: {
        invoiceNumber: latest.invoice.invoiceNumber,
        invoiceDate: latest.invoice.invoiceDate,
        pack: packOf(latest.line),
        casePriceCents: latest.line.casePriceCents,
        unitPriceCents: comparison.latestUnitPriceCents,
      },
    }),
  };
}

function checkedSummary(
  outcome: CheckedOutcome,
  productKey: string,
  previous: Purchase | null,
  latest: Purchase,
  comparison: UnitPriceComparison | null,
  thresholdBps: number,
): Bilingual {
  return bilingual((locale) => {
    const product = capitalize(productLabel(productKey, locale));
    const es = locale === "es";
    if (outcome === "nothing_to_compare" || !previous || !comparison) {
      return es ? `${product}: solo hay una compra registrada, todavía no hay con qué comparar` : `${product}: only one purchase on file, nothing to compare yet`;
    }
    if (!comparison.comparable) {
      if (comparison.reason === "different_dimensions") {
        const kinds: Record<string, [string, string]> = {
          weight: ["weight", "peso"],
          volume: ["volume", "volumen"],
          count: ["count", "unidad"],
        };
        return es
          ? `${product}: no se puede comparar. La compra anterior se facturó por ${kinds[comparison.previousDimension][1]} y la más reciente por ${kinds[comparison.latestDimension][1]}`
          : `${product}: cannot be compared. The previous purchase was billed by ${kinds[comparison.previousDimension][0]} and the latest by ${kinds[comparison.latestDimension][0]}`;
      }
      return es
        ? `${product}: no se puede comparar porque falta el tamaño de la caja o el precio anterior`
        : `${product}: cannot be compared because a case size or the previous price is missing`;
    }
    const per = perUnit(comparison.unit, locale);
    const price = formatUnitPrice(comparison.latestUnitPriceCents, locale);
    const sizes = `${describeCase(packOf(previous.line), locale)} → ${describeCase(packOf(latest.line), locale)}`;
    switch (outcome) {
      case "larger_case_same_unit_price":
        return es ? `${product}: caja más grande, mismo precio ${per} (${sizes}, ${price} ${per})` : `${product}: larger case, same price ${per} (${sizes}, ${price} ${per})`;
      case "smaller_case_same_unit_price":
        return es ? `${product}: caja más chica, mismo precio ${per} (${sizes}, ${price} ${per})` : `${product}: smaller case, same price ${per} (${sizes}, ${price} ${per})`;
      case "same_price":
        return es ? `${product}: mismo precio ${per} que la compra anterior (${price})` : `${product}: same price ${per} as the previous purchase (${price})`;
      case "lower_unit_price":
        return es
          ? `${product}: el precio ${per} bajó (de ${formatUnitPrice(comparison.previousUnitPriceCents, locale)} a ${price})`
          : `${product}: the price ${per} went down (from ${formatUnitPrice(comparison.previousUnitPriceCents, locale)} to ${price})`;
      default:
        return es
          ? `${product}: el precio ${per} subió ${formatPercent(comparison.changePercent)}, menos del ${formatPercent(rational(thresholdBps, 100))} que se señala`
          : `${product}: the price ${per} went up ${formatPercent(comparison.changePercent)}, below the ${formatPercent(rational(thresholdBps, 100))} that gets raised`;
    }
  });
}

/**
 * For each supplier + product: compares the latest purchase with the previous one, per unit.
 * Credit lines and lines with a zero or negative quantity or price are left out.
 */
function analyzePrices(invoices: readonly DetectInvoice[], duplicates: readonly DuplicatePair[], thresholdBps: number): Analysis {
  const duplicateOf = new Map<string, Set<string>>();
  for (const pair of duplicates) {
    for (const [a, b] of [
      [pair.earlier.id, pair.later.id],
      [pair.later.id, pair.earlier.id],
    ]) {
      if (!duplicateOf.has(a)) duplicateOf.set(a, new Set());
      duplicateOf.get(a)!.add(b);
    }
  }

  const groups = new Map<string, Purchase[]>();
  for (const invoice of invoices) {
    for (const line of invoice.lines) {
      if (line.isCredit || line.quantity <= 0 || line.casePriceCents <= 0) continue;
      const key = `${invoice.supplierId}\u0000${line.productKey}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ line, invoice });
    }
  }

  const findings: Finding[] = [];
  const checked: CheckedProduct[] = [];
  for (const key of [...groups.keys()].sort()) {
    const purchases = groups.get(key)!.sort(purchaseOrder);
    const latest = purchases[purchases.length - 1];
    const productKey = latest.line.productKey;
    // The previous purchase is the most recent one on a different invoice. A document that
    // looks like a second copy of the same bill is not a previous purchase.
    const previous =
      [...purchases]
        .reverse()
        .find((p) => p.invoice.id !== latest.invoice.id && !duplicateOf.get(latest.invoice.id)?.has(p.invoice.id)) ?? null;

    const record = (outcome: CheckedOutcome, comparison: UnitPriceComparison | null) => {
      checked.push({
        supplierId: latest.invoice.supplierId,
        productKey,
        outcome,
        summary: checkedSummary(outcome, productKey, previous, latest, comparison, thresholdBps),
        lineIds: previous ? [previous.line.id, latest.line.id] : [latest.line.id],
        invoiceIds: previous ? [previous.invoice.id, latest.invoice.id] : [latest.invoice.id],
        isSynthetic: latest.invoice.isSynthetic || Boolean(previous?.invoice.isSynthetic),
      });
    };

    if (!previous) {
      record("nothing_to_compare", null);
      continue;
    }
    const comparison = compareUnitPrices(
      { ...packOf(previous.line), casePriceCents: previous.line.casePriceCents },
      { ...packOf(latest.line), casePriceCents: latest.line.casePriceCents },
    );
    if (!comparison.comparable) {
      record("not_comparable", comparison);
      continue;
    }
    if (roseByAtLeast(comparison, thresholdBps)) {
      const invoiceCount = new Set(purchases.map((p) => p.invoice.id)).size;
      findings.push(priceFinding(previous, latest, comparison, invoiceCount, thresholdBps));
      continue;
    }
    if (comparison.direction === "up") record("below_threshold", comparison);
    else if (comparison.direction === "down") record("lower_unit_price", comparison);
    else {
      const size = compare(comparison.latestContent, comparison.previousContent);
      record(size > 0 ? "larger_case_same_unit_price" : size < 0 ? "smaller_case_same_unit_price" : "same_price", comparison);
    }
  }
  return { findings, checked };
}

/** Runs every detector over a set of invoices. Pure: same input, same output. */
export function analyzeInvoices(
  invoices: readonly DetectInvoice[],
  options: { thresholdBps?: number } = {},
): Analysis {
  const thresholdBps = options.thresholdBps ?? UNIT_PRICE_INCREASE_THRESHOLD_BPS;
  const duplicates = findDuplicatePairs(invoices);
  const prices = analyzePrices(invoices, duplicates, thresholdBps);
  return {
    findings: [...prices.findings, ...duplicates.map(duplicateFinding)],
    checked: prices.checked,
  };
}

/* ------------------------------------------------------------------ */
/* Stored data                                                         */
/* ------------------------------------------------------------------ */

/**
 * Reads what the detectors need and nothing else. The document text columns are
 * deliberately not selected.
 */
export async function loadDetectionInput(db: DbOrTx): Promise<DetectInvoice[]> {
  const invoiceRows = await db
    .select({
      id: supplierInvoices.id,
      supplierId: supplierInvoices.supplierId,
      invoiceNumber: supplierInvoices.invoiceNumber,
      invoiceDate: supplierInvoices.invoiceDate,
      totalCents: supplierInvoices.totalCents,
      isSynthetic: supplierInvoices.isSynthetic,
      importedAt: importBatches.importedAt,
    })
    .from(supplierInvoices)
    .leftJoin(importBatches, eq(supplierInvoices.importBatchId, importBatches.id))
    .orderBy(asc(supplierInvoices.invoiceDate), asc(supplierInvoices.id));
  const lineRows = await db
    .select({
      id: supplierInvoiceLines.id,
      invoiceId: supplierInvoiceLines.invoiceId,
      lineNo: supplierInvoiceLines.lineNo,
      productKey: supplierInvoiceLines.productKey,
      quantity: supplierInvoiceLines.quantity,
      packCount: supplierInvoiceLines.packCount,
      packSize: supplierInvoiceLines.packSize,
      packUnit: supplierInvoiceLines.packUnit,
      casePriceCents: supplierInvoiceLines.casePriceCents,
      isCredit: supplierInvoiceLines.isCredit,
    })
    .from(supplierInvoiceLines)
    .orderBy(asc(supplierInvoiceLines.invoiceId), asc(supplierInvoiceLines.lineNo));
  const linesByInvoice = new Map<string, DetectLine[]>();
  for (const line of lineRows) {
    if (!linesByInvoice.has(line.invoiceId)) linesByInvoice.set(line.invoiceId, []);
    linesByInvoice.get(line.invoiceId)!.push(line);
  }
  return invoiceRows.map((invoice) => ({ ...invoice, lines: linesByInvoice.get(invoice.id) ?? [] }));
}

export type DetectionRun = { findings: number; created: number; alreadyKnown: number };

/**
 * Runs the detectors over everything stored and saves new findings.
 *
 * Safe to run again and again: a finding that is already stored (same dedupe key) is left
 * exactly as it is, including a status someone has already changed. `actor` is the person
 * who asked for the run, or null when the system runs it (after an import, in the seed).
 */
export async function runDetection(db: Db, actor: Actor = null): Promise<DetectionRun> {
  if (actor) await authorize(db, actor, "operations.act", { action: "operations.detect" });
  const { findings } = analyzeInvoices(await loadDetectionInput(db));
  let created = 0;
  for (const finding of findings) {
    await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(financialExceptions)
        .values({
          id: newId(),
          dedupeKey: finding.dedupeKey,
          kind: finding.kind,
          status: "suspected",
          supplierId: finding.supplierId,
          productKey: finding.productKey,
          evidence: finding.evidence,
          suspectedAmountCents: finding.suspectedAmountCents,
          draftQuestion: finding.draftQuestion,
          isSynthetic: finding.isSynthetic,
        })
        .onConflictDoNothing({ target: financialExceptions.dedupeKey })
        .returning({ id: financialExceptions.id });
      if (inserted.length === 0) return;
      created += 1;
      await tx.insert(exceptionEvents).values({
        id: newId(),
        exceptionId: inserted[0].id,
        actorId: null,
        actorRole: null,
        action: "detected",
        fromStatus: null,
        toStatus: "suspected",
      });
    });
  }
  const run = { findings: findings.length, created, alreadyKnown: findings.length - created };
  await writeAudit(db, { actor, action: "operations.detect", permission: actor ? "operations.act" : undefined, outcome: "ok", detail: run });
  return run;
}
