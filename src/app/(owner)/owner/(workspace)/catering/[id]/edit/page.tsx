import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { requirePagePermission, toActor } from "@/lib/auth/session";
import { ownerDict } from "@/lib/owner/i18n";
import { getOwnerLocale } from "@/lib/owner/locale";
import { TeamInquiryForm } from "@/modules/catering/components/TeamInquiryForm";
import type { InquiryFormValues } from "@/modules/catering/form-values";
import { cateringDict } from "@/modules/catering/i18n";
import { getInquiryDetail } from "@/modules/catering/service";

export const metadata: Metadata = { title: "Edit catering request" };

/** Cents back to the dollars-and-cents text the form expects ("1250.00"). Integer math only. */
function centsToInput(cents: number): string {
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export default async function EditCateringRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("catering.manage");
  const locale = await getOwnerLocale(user);
  const t = cateringDict(locale);
  const shared = ownerDict(locale);
  const { id } = await params;
  const detail = await getInquiryDetail(await getDb(), toActor(user), id);
  const backHref = detail ? `/owner/catering/${detail.inquiry.id}` : "/owner/catering";
  const back = (
    <p>
      <Link className="o-back" href={backHref}>
        ← {detail ? detail.inquiry.reference : t.detail.back}
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
  if (!detail.canEditDetails) {
    return (
      <>
        {back}
        <p className="o-notice">{t.detail.editLocked}</p>
      </>
    );
  }

  const values: InquiryFormValues = {
    name: inquiry.contactName,
    email: inquiry.contactEmail ?? "",
    phone: inquiry.contactPhone ?? "",
    preferredContact: inquiry.preferredContact,
    company: inquiry.company ?? "",
    eventDate: inquiry.eventDate,
    eventTime: inquiry.eventTime ?? "",
    headcount: String(inquiry.headcount),
    budget: inquiry.budgetCents !== null ? centsToInput(inquiry.budgetCents) : "",
    fulfillment: inquiry.fulfillment,
    address: inquiry.eventAddress ?? "",
    occasion: inquiry.occasion ?? "",
    dietary: inquiry.dietaryNotes ?? "",
    message: inquiry.message ?? "",
    source: inquiry.source,
    consentContact: false,
    consentNews: false,
  };

  return (
    <>
      {back}
      <header className="o-head">
        <p className="o-head__eyebrow">{inquiry.reference}</p>
        <h1>{t.detail.editTitle}</h1>
      </header>
      <TeamInquiryForm
        locale={locale}
        inquiryId={inquiry.id}
        initialValues={values}
        customerLocale={inquiry.locale}
        cancelHref={backHref}
        cancelLabel={shared.cancel}
      />
    </>
  );
}
