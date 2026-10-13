import Link from "next/link";
import { OwnerNav } from "@/components/owner/OwnerNav";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { NAV_ITEMS, ownerDict } from "@/lib/owner/i18n";
import { getOwnerLocale } from "@/lib/owner/locale";
import { setOwnerLanguage, signOut } from "../actions";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const locale = await getOwnerLocale(user);
  const t = ownerDict(locale);
  const items = NAV_ITEMS.filter((item) => can(user.role, item.permission)).map((item) => ({
    key: item.key,
    href: item.href,
    label: t.nav[item.key],
  }));
  const other = locale === "en" ? "es" : "en";

  return (
    <div className="o-app">
      <a className="skip-link" href="#main">
        {locale === "es" ? "Saltar al contenido" : "Skip to content"}
      </a>
      <header className="o-top">
        <div className="o-top__row">
          <Link className="o-top__brand" href="/owner">
            Panguich <small>{t.roles[user.role]}</small>
          </Link>
          <form action={setOwnerLanguage}>
            <button className="o-top__btn" name="locale" value={other} lang={other} aria-label={`${t.language}: ${other === "es" ? "Español" : "English"}`}>
              {other === "es" ? "Español" : "English"}
            </button>
          </form>
          <form action={signOut}>
            <button className="o-top__btn">{t.signOut}</button>
          </form>
        </div>
      </header>
      {user.isDemo ? (
        <p className="o-demo" role="note">
          {t.demoBanner}
        </p>
      ) : null}
      <div className="o-shell">
        <OwnerNav items={items} label={t.workspace} />
        <main className="o-main" id="main">
          {children}
        </main>
      </div>
    </div>
  );
}
