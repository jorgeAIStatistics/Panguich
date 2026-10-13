import { formatInstant } from "@/lib/time";
import { addNoteAction } from "../owner-actions";
import { describeActivity } from "../timeline";
import type { DetailView } from "./detail-view";
import { FlashMessage } from "./FlashMessage";
import styles from "./owner.module.css";

/** Notes from the team and the full record of what happened to this request. */
export function HistorySection({ detail, t, locale, perms, flash }: DetailView) {
  const { inquiry } = detail;
  return (
    <section className={`o-section ${styles.anchor}`} id="history" aria-labelledby="history-title">
      <h2 id="history-title">{t.notes.title}</h2>
      <div className="o-stack">
        <FlashMessage flash={flash} at="history" />
        {perms.manage ? (
          <form action={addNoteAction} className="o-card o-stack o-stack--tight">
            <input type="hidden" name="inquiryId" value={inquiry.id} />
            <div className="o-field">
              <label htmlFor="note">{t.notes.add}</label>
              <textarea className="o-textarea" id="note" name="note" required maxLength={2000} aria-describedby="note-hint" />
              <span className="o-hint" id="note-hint">
                {t.notes.addHint}
              </span>
            </div>
            <div>
              <button className="o-btn" type="submit">
                {t.notes.save}
              </button>
            </div>
          </form>
        ) : null}

        {detail.activities.length === 0 ? (
          <p className="o-muted">{t.notes.empty}</p>
        ) : (
          <ol className="o-timeline" data-testid="timeline">
            {detail.activities.map((activity) => {
              const line = describeActivity(activity, t, locale, detail.people);
              return (
                <li key={activity.id} data-kind={activity.kind}>
                  <p className="o-strong">{line.headline}</p>
                  {line.detail ? <p className={styles.customerText}>{line.detail}</p> : null}
                  <p className="o-meta">
                    <time dateTime={activity.at.toISOString()}>{formatInstant(activity.at, locale)}</time>
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
