"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { siteCopy } from "@/content/site-copy";
import type { Locale } from "@/lib/i18n";
import { OrderLink } from "./links";

export function SiteHeader({ locale }: { locale: Locale }) {
  const t = siteCopy(locale);
  const pathname = usePathname() ?? `/${locale}`;
  const other: Locale = locale === "en" ? "es" : "en";
  const rest = pathname.replace(/^\/(en|es)(?=\/|$)/, "");
  const items = [
    { href: `/${locale}/menu`, label: t.nav.menu },
    { href: `/${locale}/catering`, label: t.nav.catering },
    { href: `/${locale}/visit`, label: t.nav.visit },
  ];
  const links = items.map((item) => (
    <Link key={item.href} href={item.href} aria-current={pathname.startsWith(item.href) ? "page" : undefined}>
      {item.label}
    </Link>
  ));

  return (
    <header className="s-header">
      <div className="s-wrap">
        <div className="s-header__row">
          {/* Placeholder wordmark. The official logo replaces it once the owner supplies the file. */}
          <Link className="s-wordmark" href={`/${locale}`} aria-label={`Panguich · ${t.nav.home}`}>
            Panguich
          </Link>
          <nav className="s-nav" aria-label={locale === "es" ? "Principal" : "Main"}>
            {links}
          </nav>
          <a className="s-lang" href={`/${other}${rest}`} hrefLang={other} lang={other} aria-label={t.switchLabel}>
            {other.toUpperCase()}
          </a>
          <OrderLink t={t} className="s-btn s-btn--order s-btn--sm s-header__order" />
        </div>
        <nav className="s-subnav" aria-label={locale === "es" ? "Secciones" : "Sections"}>
          {links}
        </nav>
      </div>
    </header>
  );
}
