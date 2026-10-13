import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { CHECKLIST_KINDS } from "@/db/schema";
import { requirePagePermission, toActor } from "@/lib/auth/session";
import { ownerDict } from "@/lib/owner/i18n";
import { getOwnerLocale } from "@/lib/owner/locale";
import { detailPermissions, type DetailView } from "@/modules/catering/components/detail-view";
import styles from "@/modules/catering/components/owner.module.css";
import { EventSummary, PurchasingDraft } from "@/modules/catering/components/PackSection";
import { PrintButton } from "@/modules/catering/components/PrintButton";
import { cateringDict } from "@/modules/catering/i18n";
import { checklistLabel, checklistProgress } from "@/modules/catering/pack";
import { getInquiryDetail } from "@/modules/catering/service";

export const metadata: Metadata = { title: "Event sheet" };

/** A print-friendly event sheet: summary and the three checklists with boxes to tick on paper. */
export default async function EventSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("catering.view");
  const locale = await getOwnerLocale(user);
  const t = cateringDict(locale);
  const shared = ownerDict(locale);
  const { id } = await params;
  const detail = await getInquiryDetail(await getDb(), toActor(user), id);
  const backHref = detail ? `/owner/catering/${detail.inquiry.id}#pack` : "/owner/catering";
  const back = (
    <p className="no-print">
      <Link className="o-back" href={backHref}>
        ← {detail ? t.pack.backToRequest : t.detail.back}
      </Link>
    </p>
  );

  if (!detail) {
    return (
      <>
        {back}
        <div className="o-empty" role="alert">
          <strong>{t.detail.notFound}</strong>
          {t.detail.notFoundBody}
        </div>
      </>
    );
  }
  if (!detail.hasPack) {
    return (
      <>
        {back}
        <p className="o-empty">{t.pack.notReady}</p>
      </>
    );
  }

  const { inquiry } = detail;
  const view: DetailView = { detail, t, locale, perms: detailPermissions(user.role) };

  return (
    <>
      {back}
      <div className={styles.sheet}>
        <header className="o-head" style={{ marginBottom: 0 }}>
          <p className="o-head__eyebrow">
            {t.pack.title} · {inquiry.reference}
          </p>
          <h1>{inquiry.contactName}</h1>
          <div className="o-row" style={{ marginTop: "var(--s-3)" }}>
            <span className="o-badge o-badge--outline">{t.status[inquiry.status]}</span>
            {inquiry.isSynthetic ? <span className="o-badge o-badge--synthetic">{shared.sampleData}</span> : null}
            <PrintButton label={t.pack.printNow} />
          </div>
        </header>

        {inquiry.isSynthetic ? <p className="o-notice o-notice--synthetic">{shared.sampleDataHint}</p> : null}
        {inquiry.status === "accepted" ? <p className="o-notice o-notice--warn">{t.pack.notConfirmed}</p> : null}

        <EventSummary {...view} />

        {CHECKLIST_KINDS.map((kind) => {
          const items = detail.checklist.filter((item) => item.kind === kind);
          const progress = checklistProgress(items);
          return (
            <div key={kind} className="o-card o-stack o-stack--tight">
              <div className={styles.spread}>
                <h2 className="o-card__title">{t.pack.kinds[kind]}</h2>
                <span className="o-meta">{t.pack.progress(progress.done, progress.total)}</span>
              </div>
              <div>
                {items.map((item) => (
                  <div key={item.id} className={styles.printItem}>
                    <span className={styles.printBox} aria-hidden="true">
                      {item.done ? "✓" : ""}
                    </span>
                    <span>
                      {checklistLabel(item.label, locale)}
                      <span className="visually-hidden"> ({item.done ? t.pack.done : t.pack.notDone})</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <PurchasingDraft {...view} />
      </div>
    </>
  );
}
