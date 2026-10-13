import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { requirePagePermission, toActor } from "@/lib/auth/session";
import { ownerDict } from "@/lib/owner/i18n";
import { getOwnerLocale } from "@/lib/owner/locale";
import { formatIsoDate } from "@/lib/time";
import { AssignSection } from "@/modules/catering/components/AssignSection";
import { ConsentSection } from "@/modules/catering/components/ConsentSection";
import { DepositSection } from "@/modules/catering/components/DepositSection";
import { detailPermissions, toDetailSection, type DetailView, type Flash } from "@/modules/catering/components/detail-view";
import { EventSection } from "@/modules/catering/components/EventSection";
import { FlashMessage } from "@/modules/catering/components/FlashMessage";
import { HistorySection } from "@/modules/catering/components/HistorySection";
import { PackSection } from "@/modules/catering/components/PackSection";
import { QuoteSection } from "@/modules/catering/components/QuoteSection";
import { StageSection } from "@/modules/catering/components/StageSection";
import { cateringDict, cateringErrorText } from "@/modules/catering/i18n";
import { getInquiryDetail } from "@/modules/catering/service";
import { DEPOSIT_BADGE, STAGE_BADGE } from "../badges";

export const metadata: Metadata = { title: "Catering request" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string; at?: string }> };

export default async function CateringRequestPage({ params, searchParams }: Props) {
  const user = await requirePagePermission("catering.view");
  const locale = await getOwnerLocale(user);
  const t = cateringDict(locale);
  const shared = ownerDict(locale);
  const { id } = await params;
  const query = await searchParams;

  const detail = await getInquiryDetail(await getDb(), toActor(user), id);
  const back = (
    <p>
      <Link className="o-back" href="/owner/catering">
        ← {t.detail.back}
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

  const { inquiry } = detail;
  // Only known codes are turned into words; nothing from the address is shown as typed.
  const errorText = cateringErrorText(t, query.error);
  const noticeText = query.notice && !errorText ? (t.notices[query.notice] ?? null) : null;
  const flash: Flash | null = errorText
    ? { tone: "danger", text: errorText, at: toDetailSection(query.at) }
    : noticeText
      ? { tone: "ok", text: noticeText, at: toDetailSection(query.at) }
      : null;
  const view: DetailView = { detail, t, locale, perms: detailPermissions(user.role), flash };

  return (
    <>
      {back}
      <header className="o-head">
        <p className="o-head__eyebrow" data-testid="catering-reference">
          {inquiry.reference}
        </p>
        <h1>{inquiry.contactName}</h1>
        <p>
          {formatIsoDate(inquiry.eventDate, locale)} · {t.guests(inquiry.headcount)} · {t.fulfillment[inquiry.fulfillment]}
        </p>
        <div className="o-row" style={{ marginTop: "var(--s-3)" }}>
          <span className={`o-badge ${STAGE_BADGE[inquiry.status]}`}>{t.status[inquiry.status]}</span>
          <span className={`o-badge ${DEPOSIT_BADGE[inquiry.depositStatus]}`}>{t.deposit[inquiry.depositStatus]}</span>
          {inquiry.isSynthetic ? <span className="o-badge o-badge--synthetic">{shared.sampleData}</span> : null}
        </div>
      </header>

      {inquiry.isSynthetic ? <p className="o-notice o-notice--synthetic">{shared.sampleDataHint}</p> : null}
      <FlashMessage flash={flash} at={null} />

      <StageSection {...view} />
      <EventSection {...view} />
      <QuoteSection {...view} />
      <DepositSection {...view} />
      <AssignSection {...view} />
      <PackSection {...view} />
      <ConsentSection {...view} />
      <HistorySection {...view} />
    </>
  );
}
