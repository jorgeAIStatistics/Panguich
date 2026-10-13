import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { ownerDict } from "@/lib/owner/i18n";
import { getOwnerLocale } from "@/lib/owner/locale";

export default async function NotAllowedPage() {
  const user = await requireUser();
  const t = ownerDict(await getOwnerLocale(user));
  return (
    <div className="o-empty" role="alert">
      <strong>{t.notAllowedTitle}</strong>
      {t.notAllowedBody}
      <p style={{ marginTop: "var(--s-4)" }}>
        <Link className="o-btn" href="/owner">
          {t.nav.today}
        </Link>
      </p>
    </div>
  );
}
