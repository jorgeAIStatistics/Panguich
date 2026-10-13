import Link from "next/link";
import { CHECKLIST_KINDS } from "@/db/schema";
import { formatClockTime, formatInstant, formatIsoDate } from "@/lib/time";
import { rebuildChecklistAction, tickChecklistAction } from "../owner-actions";
import { checklistLabel, checklistProgress, purchasingDraft } from "../pack";
import { personName, type DetailView } from "./detail-view";
import { FlashMessage } from "./FlashMessage";
import styles from "./owner.module.css";

/** Who, when, where and what, for the people preparing and handing over the order. */
export function EventSummary(view: DetailView) {
  const { detail, t, locale } = view;
  const { inquiry, packQuote } = detail;
  const p = t.pack;
  const when = [formatIsoDate(inquiry.eventDate, locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" })];
  if (inquiry.eventTime) when.push(formatClockTime(inquiry.eventTime, locale));
  const contact = [inquiry.contactPhone, inquiry.contactEmail].filter(Boolean).join(" · ");

  return (
    <div className="o-card o-stack o-stack--tight" data-testid="event-summary">
      <h3>{p.summary}</h3>
      <dl className="o-facts">
        <dt>{p.who}</dt>
        <dd>
          {inquiry.contactName}
          {inquiry.company ? ` · ${inquiry.company}` : ""} · {inquiry.reference}
        </dd>
        <dt>{p.when}</dt>
        <dd>{when.join(", ")}</dd>
        <dt>{p.where}</dt>
        <dd className={styles.customerText}>
          {t.fulfillment[inquiry.fulfillment]}
          {inquiry.fulfillment !== "pickup" && inquiry.eventAddress ? `: ${inquiry.eventAddress}` : ""}
        </dd>
        <dt>{t.detail.headcount}</dt>
        <dd>{t.guests(inquiry.headcount)}</dd>
        <dt>{t.detail.dietary}</dt>
        <dd className={styles.customerText}>{inquiry.dietaryNotes ?? t.notGiven}</dd>
        <dt>{p.contact}</dt>
        <dd>
          {contact || t.notGiven} ({t.detail.prefers.toLowerCase()}: {t.preferred[inquiry.preferredContact].toLowerCase()})
        </dd>
        <dt>{p.depositLine}</dt>
        <dd>{t.deposit[inquiry.depositStatus]}</dd>
      </dl>
      <p className="o-label">
        {p.whatTitle}
        {packQuote ? ` (${t.quote.version(packQuote.version).toLowerCase()})` : ""}
      </p>
      {packQuote && packQuote.lines.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: "var(--s-5)", fontSize: "var(--text-sm)" }}>
          {packQuote.lines.map((line, index) => (
            <li key={index}>
              {line.quantity} × {line.description}
            </li>
          ))}
        </ul>
      ) : (
        <p className="o-muted">{p.noLines}</p>
      )}
    </div>
  );
}

/** Purchasing draft: the quoted items only. No amounts are calculated and nothing is ordered. */
export function PurchasingDraft({ detail, t }: DetailView) {
  const items = purchasingDraft(detail.packQuote?.lines ?? []);
  if (items.length === 0) return null;
  return (
    <div className="o-card o-stack o-stack--tight" data-testid="purchasing-draft">
      <h3>{t.pack.purchasingTitle}</h3>
      <p className="o-notice o-notice--warn">{t.pack.purchasingNote}</p>
      <ul style={{ margin: 0, paddingLeft: "var(--s-5)", fontSize: "var(--text-sm)" }}>
        {items.map((item) => (
          <li key={item}>
            {t.pack.purchasingFor}: {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The fulfillment pack: event summary, the three checklists, and a purchasing draft.
 * Built by fixed rules from the accepted quote. Anyone who helps fulfill events can tick items.
 */
export function PackSection(view: DetailView) {
  const { detail, t, locale, perms } = view;
  const { inquiry, currentQuote, packQuote } = detail;
  const p = t.pack;

  if (!detail.hasPack) {
    if (inquiry.status === "canceled" || inquiry.status === "lost") return null;
    return (
      <section className={`o-section ${styles.anchor}`} id="pack" aria-labelledby="pack-title">
        <h2 id="pack-title">{p.title}</h2>
        <div className="o-stack">
          <FlashMessage flash={view.flash} at="pack" />
          <p className="o-empty">{p.notReady}</p>
        </div>
      </section>
    );
  }

  const canTick = perms.fulfill && detail.canTickChecklist;
  const draftPending = currentQuote && packQuote && currentQuote.id !== packQuote.id;

  return (
    <section className={`o-section ${styles.anchor}`} id="pack" aria-labelledby="pack-title">
      <div className={styles.spread} style={{ marginBottom: "var(--s-3)" }}>
        <h2 id="pack-title" style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>
          {p.title}
        </h2>
        <Link className="o-btn o-btn--sm" href={`/owner/catering/${inquiry.id}/pack`}>
          {p.print}
        </Link>
      </div>
      <div className="o-stack">
        <FlashMessage flash={view.flash} at="pack" />
        {inquiry.status === "accepted" ? <p className="o-notice o-notice--warn">{p.notConfirmed}</p> : null}
        {draftPending ? <p className="o-notice o-notice--warn">{p.pendingDraft(packQuote.version)}</p> : null}

        <EventSummary {...view} />

        <p className="o-meta">{canTick ? p.tickHint : detail.canTickChecklist ? null : p.tickLocked}</p>
        {CHECKLIST_KINDS.map((kind) => {
          const items = detail.checklist.filter((item) => item.kind === kind);
          const progress = checklistProgress(items);
          return (
            <div key={kind} className="o-card o-stack o-stack--tight" data-testid={`checklist-${kind}`}>
              <div className={styles.spread}>
                <h3>{p.kinds[kind]}</h3>
                <span className={`o-badge ${progress.open === 0 && progress.total > 0 ? "o-badge--ok" : "o-badge--outline"}`}>
                  {p.progress(progress.done, progress.total)}
                </span>
              </div>
              <ul className={styles.checklist}>
                {items.map((item) => {
                  const label = checklistLabel(item.label, locale);
                  return (
                    <li key={item.id} className={`${styles.checkItem}${item.done ? ` ${styles.checkDone}` : ""}`} data-done={item.done}>
                      {canTick ? (
                        <form action={tickChecklistAction}>
                          <input type="hidden" name="inquiryId" value={inquiry.id} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <input type="hidden" name="done" value={item.done ? "0" : "1"} />
                          <button className={styles.tick} type="submit" aria-pressed={item.done} aria-label={`${item.done ? p.undo : p.markDone}: ${label}`}>
                            {item.done ? "✓" : ""}
                          </button>
                        </form>
                      ) : (
                        <span className={`${styles.tick} ${styles.tickStatic}`} data-done={item.done} aria-hidden="true">
                          {item.done ? "✓" : ""}
                        </span>
                      )}
                      <div className={styles.checkBody}>
                        <p className={styles.checkLabel}>{label}</p>
                        <p className="o-meta">
                          {item.done
                            ? `${p.done} · ${p.doneBy(personName(view, item.doneBy), item.doneAt ? formatInstant(item.doneAt, locale) : "")}`
                            : p.notDone}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        <PurchasingDraft {...view} />

        {perms.manage && (inquiry.status === "accepted" || inquiry.status === "confirmed") ? (
          <form action={rebuildChecklistAction} className="o-stack o-stack--tight">
            <input type="hidden" name="inquiryId" value={inquiry.id} />
            <div>
              <button className="o-btn o-btn--sm" type="submit">
                {p.rebuild}
              </button>
            </div>
            <span className="o-meta">{p.rebuildHint}</span>
          </form>
        ) : null}
      </div>
    </section>
  );
}
