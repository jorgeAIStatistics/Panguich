import { formatInstant } from "@/lib/time";
import {
  approveCampaignAction,
  archiveCampaignAction,
  requestChangesAction,
  revokeApprovalAction,
  submitForApprovalAction,
} from "../actions";
import { shortReference } from "../approval";
import type { GrowView } from "./view";

const WHEN: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };

/**
 * Send for approval, approve, ask for changes, withdraw. What is offered depends on the role,
 * but the server decides: every one of these actions checks the permission again.
 */
export function DecisionSection({ view, t, perms }: GrowView) {
  const { campaign, blocked, approvalCurrent, payloadHash } = view;
  const d = t.detail;
  if (campaign.status === "archived") return null;

  // Waiting for a decision: a draft, a pending request, or an approval that no longer matches the content.
  const canBeApproved = campaign.status !== "approved" || !approvalCurrent;

  const approveForm = (
    <form action={approveCampaignAction} className="o-stack o-stack--tight">
      <input type="hidden" name="campaignId" value={campaign.id} />
      {/* The fingerprint of what is on this page. If the content changed meanwhile, the server refuses. */}
      <input type="hidden" name="expectedHash" value={payloadHash} />
      <div className="o-field">
        <label htmlFor="approve-note">{d.approvalNote}</label>
        <input className="o-input" id="approve-note" name="note" maxLength={1000} />
      </div>
      <button className="o-btn o-btn--approve o-btn--block" type="submit" data-testid="approve-button">
        {d.approve}
      </button>
      <p className="o-meta">{d.approveHint}</p>
    </form>
  );

  return (
    <section className="o-section" id="decision" aria-labelledby="decision-title">
      <h2 id="decision-title">{d.decisionTitle}</h2>
      <div className="o-card o-stack">
        {canBeApproved && perms.approve ? (
          blocked ? (
            <p className="o-notice o-notice--danger" data-testid="approve-blocked">
              {d.approveBlocked}
            </p>
          ) : (
            approveForm
          )
        ) : null}

        {canBeApproved && !perms.approve ? (
          <>
            {campaign.status === "draft" && perms.edit ? (
              blocked ? (
                <p className="o-notice o-notice--danger" data-testid="submit-blocked">
                  {d.submitBlocked}
                </p>
              ) : (
                <form action={submitForApprovalAction}>
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <button className="o-btn o-btn--primary o-btn--block" type="submit" data-testid="submit-button">
                    {d.submit}
                  </button>
                </form>
              )
            ) : null}
            {campaign.status === "pending_approval" ? <p className="o-strong">{d.state.pending}</p> : null}
            <p className="o-notice" data-testid="owner-only-note">
              {d.ownerOnly}
            </p>
          </>
        ) : null}

        {campaign.status === "pending_approval" && perms.approve ? (
          <>
            <hr className="o-divider" />
            <form action={requestChangesAction} className="o-stack o-stack--tight">
              <input type="hidden" name="campaignId" value={campaign.id} />
              <div className="o-field">
                <label htmlFor="changes-note">{d.changesNote}</label>
                <textarea className="o-textarea" id="changes-note" name="note" maxLength={1000} rows={3} required />
              </div>
              <div>
                <button className="o-btn" type="submit" data-testid="request-changes-button">
                  {d.requestChanges}
                </button>
              </div>
            </form>
          </>
        ) : null}

        {campaign.status === "approved" && approvalCurrent ? (
          perms.approve ? (
            <form action={revokeApprovalAction} className="o-stack o-stack--tight">
              <input type="hidden" name="campaignId" value={campaign.id} />
              <div className="o-field">
                <label htmlFor="revoke-note">{d.revokeNote}</label>
                <input className="o-input" id="revoke-note" name="note" maxLength={1000} />
              </div>
              <div>
                <button className="o-btn o-btn--danger" type="submit" data-testid="revoke-button">
                  {d.revoke}
                </button>
              </div>
            </form>
          ) : (
            <p className="o-notice" data-testid="owner-only-note">
              {d.ownerOnly}
            </p>
          )
        ) : null}

        {perms.edit && (campaign.status === "draft" || campaign.status === "pending_approval") ? (
          <form action={archiveCampaignAction}>
            <input type="hidden" name="campaignId" value={campaign.id} />
            <button className="o-btn o-btn--quiet" type="submit" data-testid="archive-button">
              {d.archive}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}

/** Every decision ever recorded: who, when, what they decided, and on which exact version. */
export function HistorySection({ view, t, shared, locale }: GrowView) {
  const d = t.detail;
  return (
    <section className="o-section" id="history" aria-labelledby="history-title">
      <h2 id="history-title">{d.historyTitle}</h2>
      {view.approvals.length === 0 ? (
        <p className="o-meta" data-testid="history-empty">
          {d.historyEmpty}
        </p>
      ) : (
        <ol className="o-timeline" data-testid="approval-history">
          {view.approvals.map((approval) => {
            const role = approval.actorRole === "owner" || approval.actorRole === "manager" || approval.actorRole === "staff" ? shared.roles[approval.actorRole] : approval.actorRole;
            return (
              <li key={approval.id} data-decision={approval.decision}>
                <strong>{d.decision[approval.decision]}</strong> · {approval.actorName ?? approval.actorId} ({role})
                <br />
                <span className="o-meta">
                  {formatInstant(approval.decidedAt, locale, WHEN)} · {approval.payloadHash === view.payloadHash ? d.thisVersion : d.earlierVersion} ·{" "}
                  <span className="o-num">{shortReference(approval.payloadHash)}</span>
                </span>
                {approval.note ? (
                  <>
                    <br />
                    {/* A note typed by a person. Shown as plain text. */}
                    <span>“{approval.note}”</span>
                  </>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** The download. The file itself says whether its exact content is approved. */
export function ExportSection({ view, t }: GrowView) {
  const d = t.detail;
  return (
    <section className="o-section" id="export" aria-labelledby="export-title">
      <h2 id="export-title">{d.exportTitle}</h2>
      <div className="o-card o-stack o-stack--tight">
        <p className="o-muted" style={{ fontSize: "var(--text-sm)" }}>
          {t.nothingLeaves}
        </p>
        <p className="o-meta" data-testid="export-state">
          {view.approvalCurrent ? d.exportApproved : d.exportDraft}
        </p>
        <div>
          {/* A file download from a route handler, so a plain link rather than client navigation. */}
          <a className="o-btn" href={`/owner/grow/${view.campaign.id}/export`} download data-testid="export-link">
            {d.exportButton}
          </a>
        </div>
      </div>
    </section>
  );
}
