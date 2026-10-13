import Link from "next/link";
import { BUSINESS, fullAddress } from "@/content/business";
import { formatUsd } from "@/lib/money";
import { formatInstant, formatIsoDate } from "@/lib/time";
import { approveQuoteAction } from "../owner-actions";
import { buildQuoteMessage, lineTotalCents } from "../quote";
import type { Quote } from "../service";
import { CopyText } from "./CopyText";
import { personName, type DetailView } from "./detail-view";
import { FlashMessage } from "./FlashMessage";
import styles from "./owner.module.css";

/** Quote lines as a list that stays readable on a phone: item, "qty × unit price", line total. */
function QuoteLines({ quote, view }: { quote: Quote; view: DetailView }) {
  const { t, locale } = view;
  return (
    <div className={styles.quoteLines}>
      <ul>
        {quote.lines.map((line, index) => (
          <li key={index}>
            <span className={styles.quoteLineName}>{line.description}</span>
            <span className={`${styles.quoteLineTotal} o-num`}>
              <span className="visually-hidden">{t.quote.lineTotal}: </span>
              {formatUsd(lineTotalCents(line), locale)}
            </span>
            <span className={`${styles.quoteLineCalc} o-num`}>
              <span className="visually-hidden">{t.quote.quantity}: </span>
              {line.quantity} × <span className="visually-hidden">{t.quote.unitPrice}: </span>
              {formatUsd(line.unitPriceCents, locale)}
            </span>
          </li>
        ))}
      </ul>
      <p className={styles.quoteSubtotal}>
        <span>{t.quote.subtotal}</span>
        <span className="o-num" data-testid="quote-subtotal">
          {formatUsd(quote.subtotalCents, locale)}
        </span>
      </p>
    </div>
  );
}

/**
 * Quote versions. A quote is an estimate: no tax is calculated (the rules are not known here)
 * and it is never a booking. The owner approves a version before its message can be copied.
 */
export function QuoteSection(view: DetailView) {
  const { detail, t, locale, perms } = view;
  const { inquiry, currentQuote } = detail;
  const q = t.quote;
  const earlier = detail.quotes.slice(1);
  const when = (date: Date) => formatInstant(date, locale);

  const message =
    currentQuote?.status === "approved"
      ? buildQuoteMessage({
          locale: inquiry.locale,
          restaurantName: BUSINESS.name,
          restaurantPhone: BUSINESS.phone.display,
          restaurantAddress: fullAddress(),
          reference: inquiry.reference,
          contactName: inquiry.contactName,
          eventDate: inquiry.eventDate,
          eventTime: inquiry.eventTime,
          headcount: inquiry.headcount,
          fulfillment: inquiry.fulfillment,
          eventAddress: inquiry.eventAddress,
          version: currentQuote.version,
          lines: currentQuote.lines,
          notes: currentQuote.notes,
          validUntil: currentQuote.validUntil,
        })
      : null;

  return (
    <section className={`o-section ${styles.anchor}`} id="quote" aria-labelledby="quote-title">
      <h2 id="quote-title">{q.title}</h2>
      <div className="o-stack">
        <FlashMessage flash={view.flash} at="quote" />
        {currentQuote ? (
          <div className="o-card o-stack" data-testid="current-quote" data-quote-status={currentQuote.status}>
            <div className={styles.spread}>
              <span className="o-card__title">{q.version(currentQuote.version)}</span>
              <span className={`o-badge ${currentQuote.status === "approved" ? "o-badge--ok" : "o-badge--warn"}`}>{q.status[currentQuote.status]}</span>
            </div>
            <p className="o-meta">
              {q.createdBy(personName(view, currentQuote.createdBy), when(currentQuote.createdAt))}
              {currentQuote.approvedAt ? ` · ${q.approvedBy(personName(view, currentQuote.approvedBy), when(currentQuote.approvedAt))}` : ""}
            </p>
            <QuoteLines quote={currentQuote} view={view} />
            <p className="o-notice o-notice--warn">{q.disclaimer}</p>
            {currentQuote.notes ? (
              <p style={{ fontSize: "var(--text-sm)" }}>
                <span className="o-strong">{q.notes}:</span> <span className={styles.customerText}>{currentQuote.notes}</span>
              </p>
            ) : null}
            {currentQuote.validUntil ? (
              <p style={{ fontSize: "var(--text-sm)" }}>
                <span className="o-strong">{q.validUntil}:</span> {formatIsoDate(currentQuote.validUntil, locale)}
              </p>
            ) : null}

            {currentQuote.status === "draft" && detail.canEditQuote ? (
              perms.approveQuote ? (
                <form action={approveQuoteAction}>
                  <input type="hidden" name="inquiryId" value={inquiry.id} />
                  <input type="hidden" name="quoteId" value={currentQuote.id} />
                  <button className="o-btn o-btn--approve" type="submit" data-testid="approve-quote">
                    {q.approve}
                  </button>
                </form>
              ) : (
                <p className="o-notice" data-testid="approve-owner-only">
                  {q.ownerOnly}
                </p>
              )
            ) : null}

            {message ? (
              <div className="o-stack o-stack--tight">
                <CopyText id="quote-message" label={q.messageTitle} text={message} copy={q.copy} copied={q.copied} failed={q.copyFailed} />
                <p className="o-meta">
                  {q.messageHint} {q.messageLanguage(t.languages[inquiry.locale])}
                </p>
              </div>
            ) : (
              <p className="o-meta">{q.messageAfterApproval}</p>
            )}
          </div>
        ) : (
          <div className="o-empty">
            <strong>{q.none}</strong>
            {perms.manage && detail.canEditQuote ? q.noneBody : null}
          </div>
        )}

        {perms.manage ? (
          detail.canEditQuote ? (
            <div>
              <Link className="o-btn" href={`/owner/catering/${inquiry.id}/quote`} data-testid="new-quote-version">
                {currentQuote ? q.newTitle : q.firstTitle}
              </Link>
            </div>
          ) : (
            <p className="o-meta">{q.locked}</p>
          )
        ) : null}

        {earlier.length > 0 ? (
          <details className={styles.earlier}>
            <summary>{q.earlier(earlier.length)}</summary>
            <div className="o-stack" style={{ marginTop: "var(--s-2)" }}>
              {earlier.map((quote) => (
                <div key={quote.id} className="o-card o-card--flat o-stack o-stack--tight">
                  <div className={styles.spread}>
                    <span className="o-strong">{q.version(quote.version)}</span>
                    <span className="o-badge">{q.status[quote.status]}</span>
                  </div>
                  <p className="o-meta">
                    {q.createdBy(personName(view, quote.createdBy), when(quote.createdAt))}
                    {quote.approvedAt ? ` · ${q.approvedBy(personName(view, quote.approvedBy), when(quote.approvedAt))}` : ""}
                  </p>
                  <QuoteLines quote={quote} view={view} />
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </section>
  );
}
