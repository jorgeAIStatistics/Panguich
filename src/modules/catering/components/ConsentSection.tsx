import { formatInstant } from "@/lib/time";
import { recordUnsubscribeAction } from "../owner-actions";
import type { DetailView } from "./detail-view";
import { FlashMessage } from "./FlashMessage";
import styles from "./owner.module.css";

/**
 * The evidence behind each permission: which channel, whether it was granted, when, and the
 * exact words the person saw. One kind of permission never stands in for another.
 */
export function ConsentSection({ detail, t, locale, perms, flash }: DetailView) {
  const { inquiry } = detail;
  // "Contact about this request" first, then anything optional the person also agreed to.
  const consent = [...detail.consent].sort(
    (a, b) => Number(b.channel === "transactional_contact") - Number(a.channel === "transactional_contact"),
  );
  const c = t.consent;
  const when = (date: Date) => formatInstant(date, locale, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const hasNews = consent.some((record) => record.channel === "email_marketing" && record.granted);
  const canStopNews = consent.some((record) => record.channel === "email_marketing" && record.canMessageNow);
  const canStopContact = consent.some((record) => record.channel === "transactional_contact" && record.canMessageNow);

  return (
    <section className={`o-section ${styles.anchor}`} id="consent" aria-labelledby="consent-title">
      <h2 id="consent-title">{c.title}</h2>
      <div className="o-stack">
        <FlashMessage flash={flash} at="consent" />
        {consent.length === 0 ? (
          <p className="o-notice" data-testid="consent-none">
            {inquiry.isSynthetic ? c.noneSample : inquiry.source === "website" ? c.noneOther : c.noneTeam}
          </p>
        ) : null}

        {consent.map((record) => (
          <div key={record.id} className="o-evidence" data-testid="consent-record" data-channel={record.channel}>
            <div className="o-row o-row--between" style={{ marginBottom: "var(--s-2)" }}>
              <span className="o-evidence__title" style={{ marginBottom: 0 }}>
                {c.channel[record.channel]}
              </span>
              <span className={`o-badge ${record.granted ? "o-badge--ok" : ""}`}>{record.granted ? c.granted : c.notGranted}</span>
            </div>
            <dl className="o-facts">
              <dt>{c.appliesTo}</dt>
              <dd>{record.contactKey}</dd>
              <dt>{c.when}</dt>
              <dd>{when(record.capturedAt)}</dd>
              <dt>{c.wording}</dt>
              <dd lang={record.locale}>“{record.disclosureText}”</dd>
              <dt>{c.version}</dt>
              <dd>{record.disclosureVersion}</dd>
              <dt>{c.source}</dt>
              <dd>{c.sources[record.source] ?? record.source}</dd>
            </dl>
            <p className="o-strong" style={{ fontSize: "var(--text-sm)", marginTop: "var(--s-2)" }} data-testid="consent-status">
              {record.canMessageNow ? c.canMessage : record.suppressedAt ? c.suppressed(when(record.suppressedAt)) : c.cannotMessage}
            </p>
          </div>
        ))}

        {consent.length > 0 && !hasNews ? <p className="o-meta">{c.noMarketing}</p> : null}
        <p className="o-meta">{c.noSms}</p>

        {perms.manage && (canStopNews || canStopContact) ? (
          <div className="o-row">
            {canStopNews ? (
              <form action={recordUnsubscribeAction}>
                <input type="hidden" name="inquiryId" value={inquiry.id} />
                <input type="hidden" name="channel" value="email_marketing" />
                <button className="o-btn o-btn--sm" type="submit">
                  {c.stopNews}
                </button>
              </form>
            ) : null}
            {canStopContact ? (
              <form action={recordUnsubscribeAction}>
                <input type="hidden" name="inquiryId" value={inquiry.id} />
                <input type="hidden" name="channel" value="transactional_contact" />
                <button className="o-btn o-btn--sm" type="submit">
                  {c.stopContact}
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
