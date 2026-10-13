import type { DepositStatus } from "@/db/schema";
import { setDepositAction } from "../owner-actions";
import { depositPermission } from "../state";
import type { DetailView } from "./detail-view";
import { FlashMessage } from "./FlashMessage";
import styles from "./owner.module.css";

/**
 * Deposit tracking. Nothing is charged here. "Noted as received" is a person's word, shown as
 * unverified everywhere; "verified" is reserved for a payment provider and has no button.
 */
export function DepositSection({ detail, t, perms, flash }: DetailView) {
  const { inquiry } = detail;
  const d = t.depositSection;
  const from = inquiry.depositStatus;

  const allowed = (to: DepositStatus) =>
    depositPermission(from, to) === "catering.deposit.waive" ? perms.waiveDeposit : perms.recordDeposit;
  const choices = detail.depositChoices.filter(allowed);
  const waiveHidden = detail.depositChoices.some((to) => !allowed(to));
  const label = (to: DepositStatus) => (from === "recorded_unverified" && to === "requested" ? d.undoReceived : d.actions[to]);

  return (
    <section className={`o-section ${styles.anchor}`} id="deposit" aria-labelledby="deposit-title">
      <h2 id="deposit-title">{d.title}</h2>
      <div className="o-card o-stack">
        <FlashMessage flash={flash} at="deposit" />
        <div className="o-stack o-stack--tight">
          <p className="o-strong" data-testid="deposit-status">
            {t.deposit[from]}
          </p>
          <p className="o-meta">{d.explain}</p>
        </div>
        {from === "recorded_unverified" ? (
          <p className="o-notice o-notice--warn" data-testid="deposit-unverified">
            {d.unverified}
          </p>
        ) : null}
        {inquiry.depositNote ? (
          <p style={{ fontSize: "var(--text-sm)" }}>
            <span className="o-strong">{d.lastNote}:</span> <span className={styles.customerText}>{inquiry.depositNote}</span>
          </p>
        ) : null}

        {choices.map((to) => (
          <form key={to} action={setDepositAction} className="o-stack o-stack--tight">
            <input type="hidden" name="inquiryId" value={inquiry.id} />
            <input type="hidden" name="to" value={to} />
            {to === "recorded_unverified" ? (
              <div className="o-field">
                <label htmlFor="deposit-note-received">{d.noteRecorded}</label>
                <input className="o-input" id="deposit-note-received" name="note" type="text" required maxLength={500} aria-describedby="deposit-note-hint" />
                <span className="o-hint" id="deposit-note-hint">
                  {d.noteHint}
                </span>
              </div>
            ) : to === "waived" ? (
              <div className="o-field">
                <label htmlFor="deposit-note-waived">{d.noteOptional}</label>
                <input className="o-input" id="deposit-note-waived" name="note" type="text" maxLength={500} />
              </div>
            ) : null}
            <div>
              <button className={`o-btn ${to === "recorded_unverified" ? "o-btn--primary" : ""}`} type="submit" data-testid={`deposit-to-${to}`}>
                {label(to)}
              </button>
            </div>
          </form>
        ))}

        {detail.depositChoices.length === 0 ? <p className="o-meta">{d.locked}</p> : null}
        {waiveHidden && perms.recordDeposit && !perms.waiveDeposit ? <p className="o-meta">{d.ownerOnlyWaive}</p> : null}
        <p className="o-meta">{d.verifiedNote}</p>
      </div>
    </section>
  );
}
