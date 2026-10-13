import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/session";
import { ownerDict } from "@/lib/owner/i18n";
import { getOwnerLocale } from "@/lib/owner/locale";
import { TeamInquiryForm } from "@/modules/catering/components/TeamInquiryForm";
import { EMPTY_INQUIRY_VALUES } from "@/modules/catering/form-values";
import { cateringDict } from "@/modules/catering/i18n";

export const metadata: Metadata = { title: "Add a catering request" };

export default async function NewCateringRequestPage() {
  const user = await requirePagePermission("catering.manage");
  const locale = await getOwnerLocale(user);
  const t = cateringDict(locale);
  const shared = ownerDict(locale);

  return (
    <>
      <p>
        <Link className="o-back" href="/owner/catering">
          ← {t.detail.back}
        </Link>
      </p>
      <header className="o-head">
        <h1>{t.add}</h1>
        <p>{t.addHint}</p>
      </header>
      <TeamInquiryForm
        locale={locale}
        initialValues={EMPTY_INQUIRY_VALUES}
        customerLocale={locale}
        cancelHref="/owner/catering"
        cancelLabel={shared.cancel}
      />
    </>
  );
}
