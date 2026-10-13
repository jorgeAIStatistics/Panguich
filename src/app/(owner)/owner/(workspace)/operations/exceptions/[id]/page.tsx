import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { requirePagePermission, toActor } from "@/lib/auth/session";
import { formatUsd } from "@/lib/money";
import { ownerDict } from "@/lib/owner/i18n";
import { getOwnerLocale } from "@/lib/owner/locale";
import { ActionsSection, HistorySection, QuestionSection } from "@/modules/operations/components/ActionsSection";
import { EvidenceSection } from "@/modules/operations/components/EvidenceSection";
import { opsPermissions, STATUS_BADGE, type OpsView } from "@/modules/operations/components/view";
import { operationsDict } from "@/modules/operations/i18n";
import { getExceptionDetail } from "@/modules/operations/service";

export const metadata: Metadata = { title: "Invoice question" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> };

export default async function ExceptionPage({ params, searchParams }: Props) {
  // Staff do not see financial documents: they are sent away here, and the refusal is recorded.
  const user = await requirePagePermission("operations.view");
  const locale = await getOwnerLocale(user);
  const t = operationsDict(locale);
  const shared = ownerDict(locale);
  const { id } = await params;
  const query = await searchParams;

  const detail = await getExceptionDetail(await getDb(), toActor(user), id);
  const back = (
    <p>
      <Link className="o-back" href="/owner/operations">
        ← {t.detail.back}
      </Link>
    </p>
  );
  if (!detail) {
    return (
      <>
        {back}
        <div className="o-empty" role="alert">
          <strong>{t.errors.not_found}</strong>
        </div>
      </>
    );
  }

  const { exception, supplier, assignee } = detail;
  const view: OpsView = { detail, t, shared, locale, perms: opsPermissions(user.role) };
  // Only known codes are turned into words; nothing from the address is shown as typed.
  const errorText = query.error ? (t.errors[query.error] ?? null) : null;
  const noticeText = query.notice && !errorText ? (t.notices[query.notice] ?? null) : null;
  const credited = exception.status === "credit_received" || exception.status === "cash_recovered";

  return (
    <>
      {back}
      <header className="o-head">
        <p className="o-head__eyebrow">{t.eyebrow}</p>
        <h1 data-testid="exception-title">{exception.evidence.summary[locale]}</h1>
        <div className="o-row" style={{ marginTop: "var(--s-3)" }}>
          {exception.isSynthetic ? <span className="o-badge o-badge--synthetic">{shared.sampleData}</span> : null}
          <span className={`o-badge ${STATUS_BADGE[exception.status]}`} data-testid="exception-status" data-status={exception.status}>
            {t.status[exception.status]}
          </span>
        </div>
      </header>

      {exception.isSynthetic ? (
        <div className="o-notice o-notice--synthetic" role="note" data-testid="ops-sample-banner">
          <strong>{t.sampleBanner.title}</strong> {t.sampleBanner.body}
        </div>
      ) : null}
      {errorText ? (
        <p className="o-notice o-notice--danger" role="alert" data-testid="ops-error" style={{ marginTop: "var(--s-3)" }}>
          {errorText}
        </p>
      ) : null}
      {noticeText ? (
        <p className="o-notice o-notice--ok" role="status" data-testid="ops-notice" style={{ marginTop: "var(--s-3)" }}>
          {noticeText}
        </p>
      ) : null}

      <section className="o-section" aria-labelledby="noticed-title">
        <h2 id="noticed-title">{t.detail.whatWeNoticed}</h2>
        <div className={`o-card o-stack o-stack--tight${exception.isSynthetic ? " o-card--synthetic" : ""}`}>
          <dl className="o-facts">
            <dt>{t.detail.supplier}</dt>
            <dd>{supplier?.name ?? exception.supplierId}</dd>
            <dt>{t.detail.stage}</dt>
            <dd>{t.status[exception.status]}</dd>
            <dt>{t.detail.amount}</dt>
            <dd data-testid="suspected-amount">
              <span className="o-num">{exception.suspectedAmountCents === null ? t.queue.amountUnknown : formatUsd(exception.suspectedAmountCents, locale)}</span>
              <span className="o-badge o-badge--warn" style={{ marginLeft: "var(--s-2)" }}>
                {shared.estimate}
              </span>
            </dd>
            {credited && exception.creditAmountCents !== null ? (
              <>
                <dt>{t.detail.credit}</dt>
                <dd className="o-num" data-testid="credit-amount">
                  {formatUsd(exception.creditAmountCents, locale)}
                </dd>
              </>
            ) : null}
            <dt>{t.detail.assignedTo}</dt>
            <dd>{assignee?.name ?? t.detail.nobody}</dd>
            {exception.status === "dismissed" && exception.resolutionNote ? (
              <>
                <dt>{t.detail.closedReason}</dt>
                {/* A reason typed by a person. Shown as plain text. */}
                <dd>{exception.resolutionNote}</dd>
              </>
            ) : null}
          </dl>
          <p className="o-meta">{t.detail.amountHint}</p>
        </div>
      </section>

      <EvidenceSection {...view} />
      <QuestionSection {...view} />
      <ActionsSection {...view} />
      <HistorySection {...view} />
    </>
  );
}
