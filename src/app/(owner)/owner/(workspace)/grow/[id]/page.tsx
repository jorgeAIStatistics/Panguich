import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { requirePagePermission, toActor } from "@/lib/auth/session";
import { ownerDict } from "@/lib/owner/i18n";
import { getOwnerLocale } from "@/lib/owner/locale";
import { formatInstant } from "@/lib/time";
import { ApprovalPreview } from "@/modules/growth/components/ApprovalPreview";
import { DecisionSection, ExportSection, HistorySection } from "@/modules/growth/components/DecisionSection";
import { PlanSection } from "@/modules/growth/components/PlanSection";
import { ChecksSection, TextsSection } from "@/modules/growth/components/TextsSection";
import { growPermissions, STATUS_BADGE, type GrowView } from "@/modules/growth/components/view";
import { growthDict } from "@/modules/growth/i18n";
import { getCampaignView } from "@/modules/growth/service";

export const metadata: Metadata = { title: "Campaign" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> };

export default async function CampaignPage({ params, searchParams }: Props) {
  const user = await requirePagePermission("growth.view");
  const locale = await getOwnerLocale(user);
  const t = growthDict(locale);
  const shared = ownerDict(locale);
  const { id } = await params;
  const query = await searchParams;

  const view = await getCampaignView(await getDb(), toActor(user), id, { locale });
  const back = (
    <p>
      <Link className="o-back" href="/owner/grow">
        ← {t.detail.back}
      </Link>
    </p>
  );
  if (!view) {
    return (
      <>
        {back}
        <div className="o-empty" role="alert">
          <strong>{t.errors.not_found}</strong>
        </div>
      </>
    );
  }

  const { campaign, latestApproval } = view;
  const grow: GrowView = { view, t, shared, locale, perms: growPermissions(user.role) };
  // Only known codes are turned into words; nothing from the address is shown as typed.
  const errorText = query.error ? (t.errors[query.error] ?? null) : null;
  const noticeText = query.notice && !errorText ? (t.notices[query.notice] ?? null) : null;

  // One sentence saying where the campaign stands, in words as well as color.
  let state: { text: string; tone: string; testId: string };
  if (campaign.status === "archived") {
    state = { text: t.detail.state.archived, tone: "o-notice", testId: "state-archived" };
  } else if (view.approvalCurrent && latestApproval) {
    const when = formatInstant(latestApproval.decidedAt, locale, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    state = { text: t.detail.state.approved(latestApproval.actorName ?? shared.roles.owner, when), tone: "o-notice o-notice--ok", testId: "state-approved" };
  } else if (view.changedSinceApproval) {
    // Either someone edited it (it is a draft again) or the menu facts behind it changed.
    state = {
      text: campaign.status === "approved" ? t.detail.state.stale : t.detail.state.changed,
      tone: "o-notice o-notice--warn",
      testId: "changed-since-approval",
    };
  } else if (campaign.status === "pending_approval") {
    state = { text: t.detail.state.pending, tone: "o-notice o-notice--warn", testId: "state-pending" };
  } else {
    state = { text: t.detail.state.draft, tone: "o-notice", testId: "state-draft" };
  }

  return (
    <>
      {back}
      <header className="o-head">
        <p className="o-head__eyebrow" data-testid="campaign-code">
          {t.detail.code} · {campaign.code}
        </p>
        <h1>{campaign.name}</h1>
        <p>
          {t.useCase[campaign.useCase].name} · {t.objective[campaign.objective]}
        </p>
        <div className="o-row" style={{ marginTop: "var(--s-3)" }}>
          <span className={`o-badge ${STATUS_BADGE[campaign.status]}`} data-testid="campaign-status" data-status={campaign.status}>
            {t.status[campaign.status]}
          </span>
          {campaign.isSynthetic ? <span className="o-badge o-badge--synthetic">{shared.sampleData}</span> : null}
        </div>
      </header>

      {campaign.isSynthetic ? <p className="o-notice o-notice--synthetic">{t.sampleCampaign}</p> : null}
      <p className={state.tone} role="status" data-testid={state.testId} style={{ marginTop: "var(--s-3)" }}>
        <strong>{state.text}</strong>
      </p>
      {errorText ? (
        <p className="o-notice o-notice--danger" role="alert" data-testid="grow-error" style={{ marginTop: "var(--s-3)" }}>
          {errorText}
        </p>
      ) : null}
      {noticeText ? (
        <p className="o-notice o-notice--ok" role="status" data-testid="grow-notice" style={{ marginTop: "var(--s-3)" }}>
          {noticeText}
        </p>
      ) : null}

      <PlanSection {...grow} />
      <ChecksSection {...grow} />
      <TextsSection {...grow} />
      <ApprovalPreview {...grow} />
      <DecisionSection {...grow} />
      <HistorySection {...grow} />
      <ExportSection {...grow} />
    </>
  );
}
