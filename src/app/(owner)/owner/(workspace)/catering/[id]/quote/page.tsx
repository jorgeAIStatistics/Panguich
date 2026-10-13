import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { requirePagePermission, toActor } from "@/lib/auth/session";
import { getOwnerLocale } from "@/lib/owner/locale";
import { formatIsoDate } from "@/lib/time";
import { QuoteForm, type QuoteFormLabels } from "@/modules/catering/components/QuoteForm";
import { emptyQuoteValues, QUOTE_FORM_ROWS, type QuoteFormValues } from "@/modules/catering/form-values";
import { cateringDict } from "@/modules/catering/i18n";
import { getInquiryDetail } from "@/modules/catering/service";

export const metadata: Metadata = { title: "Catering quote" };

/** Cents back to the dollars-and-cents text the form expects ("12.50"). Integer math only. */
function centsToInput(cents: number): string {
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export default async function NewQuoteVersionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("catering.manage");
  const locale = await getOwnerLocale(user);
  const t = cateringDict(locale);
  const { id } = await params;
  const detail = await getInquiryDetail(await getDb(), toActor(user), id);
  const backHref = detail ? `/owner/catering/${detail.inquiry.id}#quote` : "/owner/catering";
  const back = (
    <p>
      <Link className="o-back" href={backHref}>
        ← {detail ? detail.inquiry.reference : t.detail.back}
      </Link>
    </p>
  );

  if (!detail) {
    return (
      <>
        {back}
        <div className="o-empty" role="alert">
          <strong>{t.detail.notFound}</strong>
          {t.detail.notFoundBody}
        </div>
      </>
    );
  }
  const { inquiry, currentQuote } = detail;
  if (!detail.canEditQuote) {
    return (
      <>
        {back}
        <p className="o-notice">{t.quote.locked}</p>
      </>
    );
  }

  // Start from the current version so a small change does not mean retyping everything.
  const initial: QuoteFormValues = emptyQuoteValues();
  if (currentQuote) {
    currentQuote.lines.slice(0, QUOTE_FORM_ROWS).forEach((line, index) => {
      initial.rows[index] = { description: line.description, quantity: String(line.quantity), price: centsToInput(line.unitPriceCents) };
    });
    initial.notes = currentQuote.notes ?? "";
    initial.validUntil = currentQuote.validUntil && currentQuote.validUntil >= detail.today ? currentQuote.validUntil : "";
  }

  const labels: QuoteFormLabels = {
    hint: t.quote.newHint,
    replaces: currentQuote ? t.quote.replaces(currentQuote.version) : null,
    rows: Array.from({ length: QUOTE_FORM_ROWS }, (_, index) => t.quote.row(index + 1)),
    item: t.quote.rowItem,
    quantity: t.quote.rowQuantity,
    price: t.quote.rowPrice,
    notes: t.quote.notesLabel,
    validUntil: t.quote.validUntilLabel,
    save: t.quote.save,
    saving: t.quote.saving,
    checkRows: t.quote.checkRows,
    errors: { ...t.errors, ...t.quoteErrors },
    unknownError: t.errors.unknown,
  };

  return (
    <>
      {back}
      <header className="o-head">
        <p className="o-head__eyebrow">
          {inquiry.reference} · {inquiry.contactName}
        </p>
        <h1>{currentQuote ? t.quote.newTitle : t.quote.firstTitle}</h1>
        <p>
          {formatIsoDate(inquiry.eventDate, locale)} · {t.guests(inquiry.headcount)} · {t.fulfillment[inquiry.fulfillment]}
        </p>
      </header>
      <div className="o-card">
        <QuoteForm inquiryId={inquiry.id} initialValues={initial} labels={labels} />
      </div>
      <p className="o-notice o-notice--warn" style={{ marginTop: "var(--s-4)" }}>
        {t.quote.disclaimer}
      </p>
    </>
  );
}
