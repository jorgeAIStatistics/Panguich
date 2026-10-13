import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { fontVariables } from "@/app/fonts";
import { ActionBar } from "@/components/site/ActionBar";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Tracker } from "@/components/site/Tracker";
import { siteUrl } from "@/content/business";
import { siteCopy } from "@/content/site-copy";
import { isDemoMode } from "@/lib/demo";
import { isLocale, LOCALES } from "@/lib/i18n";
import "@/styles/tokens.css";
import "@/styles/site.css";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export const dynamicParams = false;

export const metadata: Metadata = { metadataBase: new URL(siteUrl()) };

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#faf3e7" };

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = siteCopy(lang);
  const demo = isDemoMode();

  return (
    <html lang={lang} className={fontVariables}>
      <body>
        <a className="skip-link" href="#main">
          {t.skip}
        </a>
        <div className="s-page">
          <div className="manta" aria-hidden="true" />
          {demo ? (
            <p className="s-preview" role="note">
              {t.preview}
            </p>
          ) : null}
          <SiteHeader locale={lang} />
          <main id="main">{children}</main>
          <SiteFooter locale={lang} t={t} demo={demo} />
        </div>
        <ActionBar t={t} />
        <Tracker locale={lang} />
      </body>
    </html>
  );
}
