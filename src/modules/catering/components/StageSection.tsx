import type { CateringStatus } from "@/db/schema";
import { formatIsoDate } from "@/lib/time";
import { blockText } from "../i18n";
import { changeStageAction } from "../owner-actions";
import type { NextStep } from "../state";
import type { DetailView } from "./detail-view";
import { FlashMessage } from "./FlashMessage";
import styles from "./owner.module.css";

function stepLabel(view: DetailView, from: CateringStatus, to: CateringStatus): string {
  const { t } = view;
  if ((from === "canceled" || from === "lost") && to === "needs_details") return t.stage.reopen;
  if (from === "accepted" && to === "quoted") return t.stage.backToQuoted;
  return t.stage.actions[to];
}

/** Where the request is, and the steps it can take next. Blocked steps say why. */
export function StageSection(view: DetailView) {
  const { detail, t, locale, perms } = view;
  const { inquiry } = detail;
  const eventDateLabel = formatIsoDate(inquiry.eventDate, locale);
  const available = detail.steps.filter((step) => step.blockedBy.length === 0);
  const blocked = detail.steps.filter((step) => step.blockedBy.length > 0);
  const closing = available.filter((step) => step.needsReason);
  // The first step in the pipeline's order is the way forward; it gets the main button when it is open.
  const [mainPath] = detail.steps;
  const primary = mainPath && mainPath.blockedBy.length === 0 && !mainPath.needsReason ? mainPath : null;
  const others = available.filter((step) => !step.needsReason && step !== primary);

  const stepForm = (step: NextStep, primary: boolean) => (
    <form action={changeStageAction} className="o-stack o-stack--tight">
      <input type="hidden" name="inquiryId" value={inquiry.id} />
      <input type="hidden" name="to" value={step.to} />
      {step.needsReason ? (
        <div className="o-field">
          <label htmlFor={`reason-${step.to}`}>{t.stage.reason}</label>
          <input className="o-input" id={`reason-${step.to}`} name="reason" type="text" required maxLength={500} aria-describedby={`reason-${step.to}-hint`} />
          <span className="o-hint" id={`reason-${step.to}-hint`}>
            {t.stage.reasonHint}
          </span>
        </div>
      ) : null}
      <div>
        <button
          className={`o-btn ${step.needsReason ? "o-btn--danger" : primary ? "o-btn--primary" : ""}`}
          type="submit"
          data-testid={`stage-to-${step.to}`}
        >
          {stepLabel(view, inquiry.status, step.to)}
        </button>
      </div>
    </form>
  );

  return (
    <section className={`o-section ${styles.anchor}`} id="stage" aria-labelledby="stage-title">
      <h2 id="stage-title">{t.stage.title}</h2>
      <div className="o-card o-stack">
        <FlashMessage flash={view.flash} at="stage" />
        <div>
          <p className="o-meta">{t.stage.current}</p>
          <p className="o-big" data-testid="current-stage">
            {t.status[inquiry.status]}
          </p>
          <p className="o-muted" style={{ fontSize: "var(--text-sm)" }}>
            {t.statusMeaning[inquiry.status]}
          </p>
          {inquiry.closedReason && (inquiry.status === "canceled" || inquiry.status === "lost") ? (
            <p style={{ fontSize: "var(--text-sm)", marginTop: "var(--s-2)" }}>
              <span className="o-strong">{t.detail.closedReason}:</span> <span className={styles.customerText}>{inquiry.closedReason}</span>
            </p>
          ) : null}
        </div>

        {perms.manage ? (
          <>
            <hr className="o-divider" style={{ margin: 0 }} />
            <p className="o-label">{t.stage.next}</p>
            {detail.steps.length === 0 ? <p className="o-muted">{t.stage.none}</p> : null}
            {primary ? (
              <div className="o-stack o-stack--tight">
                {stepForm(primary, true)}
                {primary.to === "quoted" ? <p className="o-meta">{t.stage.quotedHint}</p> : null}
              </div>
            ) : null}

            {blocked.length > 0 ? (
              <div className="o-evidence" data-testid="stage-blocked">
                <p className="o-evidence__title">{t.stage.blockedTitle}</p>
                <ul className={styles.blocked}>
                  {blocked.map((step) => (
                    <li key={step.to}>
                      <span className="o-strong">{stepLabel(view, inquiry.status, step.to)}:</span>{" "}
                      {step.blockedBy.map((block) => blockText(t, block, eventDateLabel)).join(" ")}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {others.length > 0 ? (
              <ul className={styles.steps}>
                {others.map((step) => (
                  <li key={step.to}>
                    {stepForm(step, false)}
                    {step.to === "quoted" && inquiry.status !== "accepted" ? <p className="o-meta">{t.stage.quotedHint}</p> : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {closing.length > 0 ? (
              <details className={styles.earlier}>
                <summary>{closing.map((step) => stepLabel(view, inquiry.status, step.to)).join(" / ")}</summary>
                <ul className={styles.steps} style={{ marginTop: "var(--s-2)" }}>
                  {closing.map((step) => (
                    <li key={step.to}>{stepForm(step, false)}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        ) : (
          <p className="o-notice">{t.detail.staffNote}</p>
        )}
      </div>
    </section>
  );
}
