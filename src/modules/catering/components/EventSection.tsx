import Link from "next/link";
import { formatUsd } from "@/lib/money";
import { formatClockTime, formatInstant, formatIsoDate } from "@/lib/time";
import type { DetailView } from "./detail-view";
import styles from "./owner.module.css";

/** The event as the customer described it, the contact, and what else is saved for that day. */
export function EventSection({ detail, t, locale, perms }: DetailView) {
  const { inquiry, sameDate } = detail;
  const d = t.detail;
  const none = <span className="o-muted">{t.notGiven}</span>;

  return (
    <>
      <section className={`o-section ${styles.anchor}`} id="event" aria-labelledby="event-title">
        <div className={styles.spread} style={{ marginBottom: "var(--s-3)" }}>
          <h2 id="event-title" style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>
            {d.eventTitle}
          </h2>
          {perms.manage && detail.canEditDetails ? (
            <Link className="o-btn o-btn--sm" href={`/owner/catering/${inquiry.id}/edit`}>
              {d.edit}
            </Link>
          ) : null}
        </div>
        <div className="o-card o-stack">
          <dl className="o-facts">
            <dt>{d.date}</dt>
            <dd>{formatIsoDate(inquiry.eventDate, locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</dd>
            <dt>{d.time}</dt>
            <dd>{inquiry.eventTime ? formatClockTime(inquiry.eventTime, locale) : none}</dd>
            <dt>{d.headcount}</dt>
            <dd>{t.guests(inquiry.headcount)}</dd>
            <dt>{d.fulfillment}</dt>
            <dd>{t.fulfillment[inquiry.fulfillment]}</dd>
            <dt>{d.address}</dt>
            <dd className={styles.customerText}>{inquiry.eventAddress ?? none}</dd>
            <dt>{d.occasion}</dt>
            <dd>{inquiry.occasion ?? none}</dd>
            <dt>{d.budget}</dt>
            <dd>{inquiry.budgetCents !== null ? `${formatUsd(inquiry.budgetCents, locale)} (${d.budgetNote})` : none}</dd>
            <dt>{d.dietary}</dt>
            <dd className={styles.customerText}>{inquiry.dietaryNotes ?? none}</dd>
            <dt>{d.message}</dt>
            <dd className={styles.customerText}>{inquiry.message ?? none}</dd>
          </dl>
          <div className="o-evidence">
            <p className="o-evidence__title">{d.source}</p>
            <dl className="o-facts">
              <dt>{d.source}</dt>
              <dd>{t.sources[inquiry.source]}</dd>
              <dt>{d.received}</dt>
              <dd>{formatInstant(inquiry.createdAt, locale, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</dd>
              <dt>{d.language}</dt>
              <dd>{t.languages[inquiry.locale]}</dd>
              {inquiry.campaignCode ? (
                <>
                  <dt>{d.campaign}</dt>
                  <dd>{inquiry.campaignCode}</dd>
                </>
              ) : null}
            </dl>
            {inquiry.source === "website" ? (
              <p className="o-meta" style={{ marginTop: "var(--s-2)" }}>
                {d.customerWords}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className={`o-section ${styles.anchor}`} id="contact" aria-labelledby="contact-title">
        <h2 id="contact-title">{d.contactTitle}</h2>
        <div className="o-card">
          <dl className="o-facts">
            <dt>{d.name}</dt>
            <dd>{inquiry.contactName}</dd>
            <dt>{d.company}</dt>
            <dd>{inquiry.company ?? none}</dd>
            <dt>{d.email}</dt>
            <dd>{inquiry.contactEmail ? <a href={`mailto:${inquiry.contactEmail}`}>{inquiry.contactEmail}</a> : none}</dd>
            <dt>{d.phone}</dt>
            <dd>{inquiry.contactPhone ? <a href={`tel:${inquiry.contactPhone.replace(/[^\d+]/g, "")}`}>{inquiry.contactPhone}</a> : none}</dd>
            <dt>{d.prefers}</dt>
            <dd>{t.preferred[inquiry.preferredContact]}</dd>
          </dl>
        </div>
      </section>

      <section className={`o-section ${styles.anchor}`} id="same-date" aria-labelledby="same-date-title">
        <h2 id="same-date-title">{t.sameDate.title}</h2>
        <div className="o-evidence" data-testid="same-date">
          <p className="o-strong">{sameDate.active === 0 ? t.sameDate.none : t.sameDate.some(sameDate.active, sameDate.confirmed)}</p>
          {sameDate.sample > 0 ? <p>{t.sameDate.sample(sameDate.sample)}</p> : null}
          <p style={{ marginTop: "var(--s-2)" }}>{t.sameDate.noLimit}</p>
          <p className="o-meta">{t.sameDate.explain}</p>
        </div>
      </section>
    </>
  );
}
