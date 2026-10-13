import { LOCALES } from "@/lib/i18n";
import { formatInstant } from "@/lib/time";
import {
  approveQuestionAction,
  assignExceptionAction,
  dismissExceptionAction,
  recordCashAction,
  recordCreditAction,
  saveQuestionAction,
  validateExceptionAction,
} from "../actions";
import { CopyButton } from "./CopyButton";
import styles from "./ops.module.css";
import type { OpsView } from "./view";

/** The draft question for the supplier, in both languages. A draft: nothing is ever sent from here. */
export function QuestionSection({ detail, t, perms }: OpsView) {
  const d = t.detail;
  const { exception, questionHash } = detail;
  const editable = perms.act && (exception.status === "suspected" || exception.status === "validated");
  const approved = exception.status === "dispute_approved" || exception.status === "credit_received" || exception.status === "cash_recovered";
  const labels = { en: d.questionEn, es: d.questionEs };

  return (
    <section className="o-section" id="question" aria-labelledby="question-title">
      <h2 id="question-title">{d.questionTitle}</h2>
      <p className="o-meta" style={{ marginBottom: "var(--s-3)" }}>
        {d.questionLead}
      </p>
      <div className="o-card o-stack">
        <p className="o-notice" data-testid="nothing-sent">
          <strong>{d.nothingSent}</strong>
        </p>

        {editable ? (
          <form action={saveQuestionAction} className="o-stack">
            <input type="hidden" name="exceptionId" value={exception.id} />
            <div className="o-grid-2">
              {LOCALES.map((language) => (
                <div className="o-field" key={language}>
                  <label htmlFor={`question-${language}`}>{labels[language]}</label>
                  <textarea
                    className={`o-textarea ${styles.questionBox}`}
                    id={`question-${language}`}
                    name={language === "en" ? "questionEn" : "questionEs"}
                    defaultValue={exception.draftQuestion[language]}
                    lang={language}
                    maxLength={4000}
                    required
                    data-testid={`question-${language}`}
                  />
                  <CopyButton text={exception.draftQuestion[language]} label={d.copy} copied={d.copied} />
                </div>
              ))}
            </div>
            <div>
              <button className="o-btn" type="submit" data-testid="save-question">
                {d.saveQuestion}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="o-grid-2">
              {LOCALES.map((language) => (
                <div className="o-stack o-stack--tight" key={language}>
                  <p className="o-label">{labels[language]}</p>
                  <pre className="o-pre" lang={language} data-testid={`question-${language}`}>
                    {exception.draftQuestion[language]}
                  </pre>
                  <CopyButton text={exception.draftQuestion[language]} label={d.copy} copied={d.copied} />
                </div>
              ))}
            </div>
            {approved ? <p className="o-meta">{d.questionLocked}</p> : null}
          </>
        )}

        {exception.status === "validated" ? (
          perms.approve ? (
            <form action={approveQuestionAction} className="o-stack o-stack--tight">
              <input type="hidden" name="exceptionId" value={exception.id} />
              {/* The wording saved above. If it was edited meanwhile, the server refuses. */}
              <input type="hidden" name="expectedHash" value={questionHash} />
              <button className="o-btn o-btn--approve o-btn--block" type="submit" data-testid="approve-question-button">
                {d.approveQuestion}
              </button>
              <p className="o-meta">{d.nothingSent}</p>
            </form>
          ) : (
            <p className="o-notice" data-testid="owner-only-approve">
              {d.ownerOnlyApprove}
            </p>
          )
        ) : null}
        {exception.status === "suspected" ? <p className="o-meta">{d.validateFirst}</p> : null}
      </div>
    </section>
  );
}

/** What can be done next, by role and by stage. */
export function ActionsSection({ detail, t, perms }: OpsView) {
  const d = t.detail;
  const { exception, assignable } = detail;
  const { status } = exception;
  const closed = status === "dismissed" || status === "cash_recovered";
  const reviewable = status === "suspected" || status === "validated";
  // After the question is approved it can still be closed, e.g. the supplier confirms the price.
  const dismissable = reviewable || status === "dispute_approved";

  return (
    <section className="o-section" id="actions" aria-labelledby="actions-title">
      <h2 id="actions-title">{d.actionsTitle}</h2>
      <div className="o-card o-stack">
        {closed ? (
          <p className="o-strong" data-testid="exception-closed">
            {d.closed}
          </p>
        ) : null}

        {status === "suspected" && perms.act ? (
          <form action={validateExceptionAction} className={styles.actionBlock}>
            <input type="hidden" name="exceptionId" value={exception.id} />
            <button className="o-btn o-btn--primary o-btn--block" type="submit" data-testid="validate-button">
              {d.validate}
            </button>
            <p className="o-meta">{d.validateHint}</p>
          </form>
        ) : null}

        {status === "dispute_approved" ? (
          perms.approve ? (
            <form action={recordCreditAction} className={styles.actionBlock}>
              <input type="hidden" name="exceptionId" value={exception.id} />
              <div className={styles.inline}>
                <div className={`o-field ${styles.grow}`}>
                  <label htmlFor="credit-amount">{d.creditAmount}</label>
                  <input className="o-input" id="credit-amount" name="amount" inputMode="decimal" required aria-describedby="credit-amount-hint" />
                </div>
                <button className="o-btn o-btn--primary" type="submit" data-testid="record-credit-button">
                  {d.recordCredit}
                </button>
              </div>
              <span className="o-meta" id="credit-amount-hint">
                {d.creditAmountHint}
              </span>
            </form>
          ) : (
            <p className="o-notice" data-testid="owner-only-money">
              {d.ownerOnlyMoney}
            </p>
          )
        ) : null}

        {status === "credit_received" ? (
          perms.approve ? (
            <form action={recordCashAction} className={styles.actionBlock}>
              <input type="hidden" name="exceptionId" value={exception.id} />
              <button className="o-btn o-btn--primary o-btn--block" type="submit" data-testid="record-cash-button">
                {d.recordCash}
              </button>
              <p className="o-meta">{d.recordCashHint}</p>
            </form>
          ) : (
            <p className="o-notice" data-testid="owner-only-money">
              {d.ownerOnlyMoney}
            </p>
          )
        ) : null}

        {dismissable && perms.act ? (
          <form action={dismissExceptionAction} className={styles.actionBlock}>
            <input type="hidden" name="exceptionId" value={exception.id} />
            <div className="o-field">
              <label htmlFor="dismiss-reason">{d.dismissReason}</label>
              <textarea className="o-textarea" id="dismiss-reason" name="reason" rows={2} maxLength={500} required aria-describedby="dismiss-reason-hint" />
              <span className="o-hint" id="dismiss-reason-hint">
                {d.dismissReasonHint}
              </span>
            </div>
            <div>
              <button className="o-btn" type="submit" data-testid="dismiss-button">
                {d.dismiss}
              </button>
            </div>
          </form>
        ) : null}

        {!closed && perms.act ? (
          <form action={assignExceptionAction} className={styles.actionBlock}>
            <input type="hidden" name="exceptionId" value={exception.id} />
            <div className={styles.inline}>
              <div className={`o-field ${styles.grow}`}>
                <label htmlFor="assignee">{d.assign}</label>
                <select className="o-select" id="assignee" name="assigneeId" defaultValue={exception.assigneeId ?? ""} data-testid="assign-select">
                  <option value="">{d.assignNobody}</option>
                  {assignable.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </div>
              <button className="o-btn" type="submit" data-testid="assign-button">
                {d.assignSave}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </section>
  );
}

/** Who did what, and when. */
export function HistorySection({ detail, t, shared, locale }: OpsView) {
  const d = t.detail;
  return (
    <section className="o-section" id="history" aria-labelledby="history-title">
      <h2 id="history-title">{d.historyTitle}</h2>
      <ol className="o-timeline" data-testid="history">
        {detail.events.map((event) => {
          const role = event.actorRole === "owner" || event.actorRole === "manager" || event.actorRole === "staff" ? shared.roles[event.actorRole] : null;
          const who = event.actorId ? `${event.actorName ?? event.actorId}${role ? ` (${role})` : ""}` : d.system;
          const label = t.events[event.action] ?? event.action;
          // For these steps the note is a name or an amount written by the system.
          const inlineNote = event.action === "assigned" || event.action === "credit_recorded" ? event.note : null;
          return (
            <li key={event.id} data-action={event.action}>
              <strong>
                {label}
                {inlineNote ? `: ${inlineNote}` : ""}
              </strong>
              <br />
              <span className="o-meta">
                {formatInstant(event.at, locale, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {who}
              </span>
              {event.note && !inlineNote ? (
                <>
                  <br />
                  {/* A reason typed by a person. Shown as plain text. */}
                  <span>“{event.note}”</span>
                </>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
