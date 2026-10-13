import type { PackUnit } from "@/db/schema";
import type { Bilingual } from "@/lib/i18n";
import { bilingual, describeCase, formatInvoiceDate, formatMoney, formatUnitPrice, perUnit, productLabel } from "./format";
import { canonicalJson, sha256Hex } from "./hash";
import type { PackSpec, Rational } from "./units";

/**
 * Draft questions for a supplier.
 *
 * They are built from a fixed template and the stored invoice numbers only. They ask the
 * supplier to confirm what was billed; they never state that the supplier made a mistake.
 * A draft is only a draft: nothing in this system sends it.
 */

export type PriceQuestionFacts = {
  productKey: string;
  unit: PackUnit;
  previous: { invoiceNumber: string; invoiceDate: string; pack: PackSpec; casePriceCents: number; unitPriceCents: Rational };
  latest: { invoiceNumber: string; invoiceDate: string; pack: PackSpec; casePriceCents: number; unitPriceCents: Rational };
};

export function draftPriceQuestion(facts: PriceQuestionFacts): Bilingual {
  return bilingual((locale) => {
    const product = productLabel(facts.productKey, locale);
    const side = (purchase: PriceQuestionFacts["latest"]) => ({
      number: purchase.invoiceNumber,
      date: formatInvoiceDate(purchase.invoiceDate, locale),
      casePrice: formatMoney(purchase.casePriceCents, locale),
      pack: describeCase(purchase.pack, locale),
      unitPrice: `${formatUnitPrice(purchase.unitPriceCents, locale)} ${perUnit(facts.unit, locale)}`,
    });
    const latest = side(facts.latest);
    const previous = side(facts.previous);
    if (locale === "es") {
      return [
        "Hola:",
        "",
        `¿Nos pueden confirmar el precio de ${product} en la factura ${latest.number} (${latest.date})?`,
        "",
        `En esa factura figura ${latest.casePrice} por ${latest.pack}, es decir, ${latest.unitPrice}. En nuestra factura anterior, ${previous.number} (${previous.date}), figuraba ${previous.casePrice} por ${previous.pack}, es decir, ${previous.unitPrice}.`,
        "",
        "Si el precio cambió, ¿nos pueden indicar desde qué fecha y el motivo? Si se trata de un error de facturación, por favor indíquennos cómo se corregiría.",
        "",
        "Gracias.",
      ].join("\n");
    }
    return [
      "Hello,",
      "",
      `Could you confirm the price for ${product} on invoice ${latest.number} (${latest.date})?`,
      "",
      `That invoice shows ${latest.casePrice} per ${latest.pack}, which is ${latest.unitPrice}. Our previous invoice, ${previous.number} (${previous.date}), showed ${previous.casePrice} per ${previous.pack}, which is ${previous.unitPrice}.`,
      "",
      "If the price changed, could you tell us the date it changed and the reason? If it was billed in error, please let us know how it would be corrected.",
      "",
      "Thank you.",
    ].join("\n");
  });
}

export type DuplicateQuestionFacts = {
  reason: "same_number" | "same_date_total";
  earlier: { invoiceNumber: string; invoiceDate: string; totalCents: number };
  later: { invoiceNumber: string; invoiceDate: string; totalCents: number };
};

export function draftDuplicateQuestion(facts: DuplicateQuestionFacts): Bilingual {
  return bilingual((locale) => {
    const earlierDate = formatInvoiceDate(facts.earlier.invoiceDate, locale);
    const laterDate = formatInvoiceDate(facts.later.invoiceDate, locale);
    const earlierTotal = formatMoney(facts.earlier.totalCents, locale);
    const laterTotal = formatMoney(facts.later.totalCents, locale);
    if (locale === "es") {
      const what =
        facts.reason === "same_number"
          ? `Tenemos dos documentos con el número de factura ${facts.later.invoiceNumber}: uno con fecha ${earlierDate} por ${earlierTotal} y otro con fecha ${laterDate} por ${laterTotal}.`
          : `Tenemos dos facturas con la misma fecha (${laterDate}) y el mismo total (${laterTotal}): ${facts.earlier.invoiceNumber} y ${facts.later.invoiceNumber}.`;
      return [
        "Hola:",
        "",
        what,
        "",
        "¿Nos pueden confirmar si corresponden a dos entregas distintas o si es la misma factura emitida dos veces?",
        "",
        "Gracias.",
      ].join("\n");
    }
    const what =
      facts.reason === "same_number"
        ? `We have two documents with invoice number ${facts.later.invoiceNumber}: one dated ${earlierDate} for ${earlierTotal} and one dated ${laterDate} for ${laterTotal}.`
        : `We have two invoices with the same date (${laterDate}) and the same total (${laterTotal}): ${facts.earlier.invoiceNumber} and ${facts.later.invoiceNumber}.`;
    return [
      "Hello,",
      "",
      what,
      "",
      "Could you confirm whether these are two separate deliveries, or the same invoice issued twice?",
      "",
      "Thank you.",
    ].join("\n");
  });
}

/** Identifies the exact wording of a draft, so an approval can be tied to the text that was on screen. */
export function hashQuestion(question: Bilingual): string {
  return sha256Hex(canonicalJson({ en: question.en, es: question.es }));
}
