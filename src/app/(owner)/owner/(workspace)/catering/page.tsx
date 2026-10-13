import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { CATERING_STATUSES, type CateringStatus } from "@/db/schema";
import { can } from "@/lib/auth/permissions";
import { requirePagePermission, toActor } from "@/lib/auth/session";
import { ownerDict } from "@/lib/owner/i18n";
import { getOwnerLocale } from "@/lib/owner/locale";
import { daysBetweenIsoDates, formatIsoDate } from "@/lib/time";
import styles from "@/modules/catering/components/owner.module.css";
import { cateringDict, cateringErrorText } from "@/modules/catering/i18n";
import { listInquiries } from "@/modules/catering/service";
import { OPEN_STATUSES } from "@/modules/catering/state";
import { STAGE_BADGE } from "./badges";

export const metadata: Metadata = { title: "Catering" };

type Props = { searchParams: Promise<{ stage?: string; error?: string }> };

export default async function CateringPipelinePage({ searchParams }: Props) {
  const user = await requirePagePermission("catering.view");
  const locale = await getOwnerLocale(user);
  const t = cateringDict(locale);
  const shared = ownerDict(locale);
  const params = await searchParams;
  const stage: CateringStatus | null = CATERING_STATUSES.find((status) => status === params.stage) ?? null;

  const pipeline = await listInquiries(await getDb(), toActor(user), { stage });
  const { today } = pipeline;
  const canManage = can(user.role, "catering.manage");
  const errorText = cateringErrorText(t, params.error);

  return (
    <>
      <header className="o-head">
        <h1>{t.title}</h1>
        <p>{t.lead}</p>
      </header>

      {errorText ? (
        <p className="o-notice o-notice--danger" role="alert" style={{ marginBottom: "var(--s-4)" }}>
          {errorText}
        </p>
      ) : null}

      {canManage ? (
        <div className="o-row" style={{ marginBottom: "var(--s-4)" }}>
          <Link className="o-btn o-btn--primary" href="/owner/catering/new">
            {t.add}
          </Link>
          <span className="o-meta">{t.addHint}</span>
        </div>
      ) : null}

      <nav aria-label={t.list.stages}>
        <div className="o-pills">
          <Link className="o-pill" href="/owner/catering" aria-current={stage === null ? "true" : undefined}>
            {t.list.all} <span className="o-num">{pipeline.total}</span>
          </Link>
          {CATERING_STATUSES.map((status) => (
            <Link key={status} className="o-pill" href={`/owner/catering?stage=${status}`} aria-current={stage === status ? "true" : undefined}>
              {t.status[status]} <span className="o-num">{pipeline.counts[status]}</span>
            </Link>
          ))}
        </div>
      </nav>

      <section className="o-section o-stack" aria-label={stage ? t.status[stage] : t.list.all} data-testid="catering-pipeline">
        {pipeline.rows.length === 0 ? (
          <div className="o-empty">
            <strong>{stage ? t.list.emptyStage : t.list.emptyAll}</strong>
            {stage ? t.list.emptyStageBody : t.list.emptyAllBody}
          </div>
        ) : (
          <p className="o-meta">{t.list.order}</p>
        )}

        {pipeline.rows.map((row) => {
          const daysUntil = daysBetweenIsoDates(today, row.eventDate);
          const overdueDays = row.followUpOn ? daysBetweenIsoDates(row.followUpOn, today) : 0;
          const assignee = row.assigneeId ? pipeline.people.find((person) => person.id === row.assigneeId) : undefined;
          return (
            <Link
              key={row.id}
              href={`/owner/catering/${row.id}`}
              className={`o-card o-card--link o-stack o-stack--tight${row.isSynthetic ? " o-card--synthetic" : ""}`}
              data-testid="catering-card"
              data-status={row.status}
            >
              <div className={styles.cardTop}>
                <span className={styles.reference}>{row.reference}</span>
                <span className="o-row">
                  {row.isSynthetic ? <span className="o-badge o-badge--synthetic">{shared.sampleData}</span> : null}
                  <span className={`o-badge ${STAGE_BADGE[row.status]}`}>{t.status[row.status]}</span>
                </span>
              </div>
              <h2 className="o-card__title">
                {row.contactName}
                {row.company ? <span className="o-muted"> · {row.company}</span> : null}
              </h2>
              <p className="o-muted" style={{ fontSize: "var(--text-sm)" }}>
                {formatIsoDate(row.eventDate, locale)} · {t.guests(row.headcount)} · {t.fulfillment[row.fulfillment]}
              </p>
              <div className="o-row">
                {row.status === "new" ? <span className={styles.flag}>{t.list.waiting}</span> : null}
                {row.followUp === "due" ? <span className={styles.flag}>{t.list.followUpDue}</span> : null}
                {row.followUp === "overdue" ? <span className={styles.flag}>{t.list.followUpOverdue(overdueDays)}</span> : null}
                {row.followUp === "upcoming" && row.followUpOn ? (
                  <span className="o-meta">{t.list.followUpOn(formatIsoDate(row.followUpOn, locale, { month: "short", day: "numeric" }))}</span>
                ) : null}
                {OPEN_STATUSES.includes(row.status) && daysUntil >= 0 && daysUntil <= 7 ? (
                  <span className="o-badge o-badge--outline">{t.list.eventIn(daysUntil)}</span>
                ) : null}
                {row.openChecklistItems > 0 && row.status !== "follow_up" ? (
                  <span className="o-meta">{t.list.openItems(row.openChecklistItems)}</span>
                ) : null}
              </div>
              <p className="o-meta">
                {t.deposit[row.depositStatus]}
                {assignee ? ` · ${t.assign.assignee}: ${assignee.name}` : ""}
              </p>
            </Link>
          );
        })}
      </section>
    </>
  );
}
