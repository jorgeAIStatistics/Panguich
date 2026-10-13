import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HoursTable } from "@/components/site/HoursTable";
import { CallLink, DirectionsLink, OrderLink } from "@/components/site/links";
import { OpenNow } from "@/components/site/OpenNow";
import { PhotoPlaceholder } from "@/components/site/PhotoPlaceholder";
import { BUSINESS } from "@/content/business";
import { MENU_CHECKED_ON } from "@/content/menu";
import { fill, siteCopy } from "@/content/site-copy";
import { isLocale } from "@/lib/i18n";
import { jsonLdScript, pageMetadata, restaurantJsonLd } from "@/lib/seo";
import { formatIsoDate } from "@/lib/time";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = siteCopy(lang);
  return pageMetadata(lang, "/visit", t.visit.title, t.visit.description);
}

export default async function VisitPage({ params }: Props) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = siteCopy(lang);
  const v = t.visit;
  const checked = formatIsoDate(MENU_CHECKED_ON, lang, { month: "long", day: "numeric", year: "numeric" });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(restaurantJsonLd(lang)) }} />
      <div className="s-wrap s-pagehead">
        <p className="s-eyebrow">{v.eyebrow}</p>
        <h1>{v.h1}</h1>
        <div className="s-hero__meta">
          <OpenNow locale={lang} />
        </div>
      </div>

      <section className="s-wrap s-visit" style={{ paddingBottom: "var(--s-7)" }}>
        <div>
          <h2 className="visually-hidden">{v.address}</h2>
          <address className="s-address">
            {BUSINESS.address.street}
            <br />
            {BUSINESS.address.city}, {BUSINESS.address.state} {BUSINESS.address.zip}
          </address>
          <div className="s-hero__cta">
            <DirectionsLink t={t} className="s-btn s-btn--ink" />
            <CallLink t={t} />
          </div>
          <p style={{ marginTop: "var(--s-4)" }}>
            <a className="s-link" href={BUSINESS.links.map} target="_blank" rel="noopener" data-track="directions_click">
              {v.mapCta}
            </a>
          </p>
          <div style={{ marginTop: "var(--s-5)" }}>
            <PhotoPlaceholder t={t} subject={lang === "es" ? "La fachada" : "The storefront"} variant="wide" />
          </div>
        </div>

        <div className="s-card">
          <h2 className="s-h2" style={{ fontSize: "var(--text-xl)", marginBottom: "var(--s-3)" }}>
            {v.hours}
          </h2>
          <HoursTable locale={lang} />
          <p className="s-source" style={{ marginTop: "var(--s-3)" }}>
            {fill(v.hoursSource, { date: checked })}
          </p>

          <h2 className="s-h2" style={{ fontSize: "var(--text-xl)", margin: "var(--s-5) 0 var(--s-2)" }}>
            {v.orderTitle}
          </h2>
          <p className="s-sub" style={{ marginTop: 0 }}>
            {v.orderBody}
          </p>
          <div className="s-hero__cta">
            <OrderLink t={t} />
          </div>
          <p className="s-handoff">{t.handoff}</p>

          <h2 className="s-h2" style={{ fontSize: "var(--text-xl)", margin: "var(--s-5) 0 var(--s-2)" }}>
            {v.follow}
          </h2>
          <p>
            <a className="s-link" href={BUSINESS.links.instagram} target="_blank" rel="noopener">
              Instagram
            </a>
            {" · "}
            <a className="s-link" href={BUSINESS.links.facebook} target="_blank" rel="noopener">
              Facebook
            </a>
          </p>
        </div>
      </section>
    </>
  );
}
