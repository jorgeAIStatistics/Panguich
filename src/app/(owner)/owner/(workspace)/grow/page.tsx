import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { CAMPAIGN_USE_CASES } from "@/db/schema";
import { can } from "@/lib/auth/permissions";
import { requirePagePermission, toActor } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo";
import { ownerDict } from "@/lib/owner/i18n";
import { getOwnerLocale } from "@/lib/owner/locale";
import { createCampaignAction } from "@/modules/growth/actions";
import { ActivityPanel } from "@/modules/growth/components/ActivityPanel";
import styles from "@/modules/growth/components/grow.module.css";
import { STATUS_BADGE } from "@/modules/growth/components/view";
import { growthDict } from "@/modules/growth/i18n";
import { datesPhrase, daysPhrase } from "@/modules/growth/schedule-text";
import { getGrowthActivity, listCampaigns } from "@/modules/growth/service";
import { USE_CASE_TEMPLATES } from "@/modules/growth/templates";

export const metadata: Metadata = { title: "Grow" };

type Props = { searchParams: Promise<{ notice?: string; error?: string }> };

export default async function GrowPage({ searchParams }: Props) {
  const user = await requirePagePermission("growth.view");
  const locale = await getOwnerLocale(user);
  const t = growthDict(locale);
  const shared = ownerDict(locale);
  const query = await searchParams;
  const db = await getDb();
  const actor = toActor(user);

  const items = await listCampaigns(db, actor);
  const activity = await getGrowthActivity(db, actor);
  const canEdit = can(user.role, "growth.edit");
  // Only known codes are turned into words; nothing from the address is shown as typed.
  const errorText = query.error ? (t.errors[query.error] ?? null) : null;
  const noticeText = query.notice && !errorText ? (t.notices[query.notice] ?? null) : null;

  return (
    <>
      <header className="o-head">
        <p className="o-head__eyebrow">{t.eyebrow}</p>
        <h1>{t.title}</h1>
        <p>{t.lead}</p>
      </header>

      <p className="o-notice" data-testid="grow-nothing-leaves">
        {t.nothingLeaves}
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

      <section className="o-section" aria-labelledby="start-title">
        <h2 id="start-title">{t.index.startTitle}</h2>
        <p className="o-meta" style={{ marginBottom: "var(--s-3)" }}>
          {t.templateNote}
        </p>
        <div className="o-stack">
          {CAMPAIGN_USE_CASES.map((useCase) => (
            <form key={useCase} action={createCampaignAction} className="o-card o-stack o-stack--tight" data-testid={`grow-start-${useCase}`}>
              <input type="hidden" name="useCase" value={useCase} />
              <h3>{t.useCase[useCase].name}</h3>
              <p className="o-muted" style={{ fontSize: "var(--text-sm)" }}>
                {t.useCase[useCase].blurb}
              </p>
              <p className="o-meta">
                {t.index.startGoal}: {t.objective[USE_CASE_TEMPLATES[useCase].objective]} · {daysPhrase(USE_CASE_TEMPLATES[useCase].weekdays, locale)}
              </p>
              {canEdit ? (
                <div>
                  <button className="o-btn o-btn--primary" type="submit">
                    {t.index.startButton}
                  </button>
                </div>
              ) : null}
            </form>
          ))}
          {canEdit ? null : <p className="o-meta">{t.index.startViewOnly}</p>}
        </div>
      </section>

      <section className="o-section" aria-labelledby="list-title">
        <h2 id="list-title">{t.index.listTitle}</h2>
        {items.length === 0 ? (
          <div className="o-empty">
            <strong>{t.index.listEmpty}</strong>
            {t.index.listEmptyBody}
          </div>
        ) : (
          <div className="o-stack" data-testid="campaign-list">
            {items.map(({ campaign, changedSinceApproval }) => (
              <Link
                key={campaign.id}
                href={`/owner/grow/${campaign.id}`}
                className={`o-card o-card--link o-stack o-stack--tight${campaign.isSynthetic ? " o-card--synthetic" : ""}`}
                data-testid="campaign-card"
                data-status={campaign.status}
              >
                <div className={styles.cardTop}>
                  <span className={styles.code}>{campaign.code}</span>
                  <span className="o-row">
                    {campaign.isSynthetic ? <span className="o-badge o-badge--synthetic">{shared.sampleData}</span> : null}
                    <span className={`o-badge ${STATUS_BADGE[campaign.status]}`}>{t.status[campaign.status]}</span>
                  </span>
                </div>
                <h3 className="o-card__title">{campaign.name}</h3>
                <p className="o-muted" style={{ fontSize: "var(--text-sm)" }}>
                  {t.objective[campaign.objective]} · {daysPhrase(campaign.schedule.weekdays, locale)} · {datesPhrase(campaign.schedule, locale)}
                </p>
                {changedSinceApproval ? <p className="o-strong">{t.index.changedSinceApproval}</p> : null}
              </Link>
            ))}
          </div>
        )}
      </section>

      <ActivityPanel activity={activity} t={t} shared={shared} demoMode={isDemoMode()} />
    </>
  );
}
