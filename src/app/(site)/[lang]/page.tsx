import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HoursTable } from "@/components/site/HoursTable";
import { BagIcon, PhoneIcon, PlatterIcon, ScooterIcon } from "@/components/site/icons";
import { CallLink, DirectionsLink, MoreArrow, OrderLink } from "@/components/site/links";
import { OpenNow } from "@/components/site/OpenNow";
import { PhotoPlaceholder } from "@/components/site/PhotoPlaceholder";
import { BUSINESS, fullAddress } from "@/content/business";
import { featuredItems, MENU_CATEGORIES, MENU_CHECKED_ON } from "@/content/menu";
import { fill, siteCopy } from "@/content/site-copy";
import { isDemoMode } from "@/lib/demo";
import { isLocale } from "@/lib/i18n";
import { formatUsd } from "@/lib/money";
import { jsonLdScript, pageMetadata, restaurantJsonLd } from "@/lib/seo";
import { formatIsoDate } from "@/lib/time";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = siteCopy(lang);
  return pageMetadata(lang, "", t.home.title, t.home.description);
}

export default async function HomePage({ params }: Props) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = siteCopy(lang);
  const h = t.home;
  const featured = featuredItems();
  const checked = formatIsoDate(MENU_CHECKED_ON, lang, { month: "long", day: "numeric", year: "numeric" });
  const demo = isDemoMode();

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(restaurantJsonLd(lang)) }} />

      <section className="s-wrap s-hero">
        <div className="s-rise">
          <p className="s-eyebrow">{h.eyebrow}</p>
          <h1>
            {h.h1a} <em>{h.h1b}</em> {h.h1and}
            <br />
            <span style={{ whiteSpace: "nowrap" }}>{h.h1c}</span>
          </h1>
          <p className="s-hero__lead">{h.lead}</p>
          <div className="s-hero__meta">
            <OpenNow locale={lang} />
            <span>{fullAddress()}</span>
          </div>
          <div className="s-hero__cta">
            <OrderLink t={t} />
            <DirectionsLink t={t} />
          </div>
          <p className="s-handoff">{t.handoff}</p>
        </div>

        <div className="s-hero__visual">
          <PhotoPlaceholder t={t} subject="Pan con Chicharrón" />
          <div className="s-ticket">
            <p className="s-ticket__title">{h.ticketTitle}</p>
            <ul>
              {featured.map((item) => (
                <li key={item.id}>
                  <span>{item.name}</span>
                  <span>{formatUsd(item.priceCents, lang)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="s-section s-section--deep" aria-labelledby="first-title">
        <div className="s-wrap">
          <div className="s-section__head">
            <div>
              <h2 className="s-h2" id="first-title">
                {h.firstTitle}
              </h2>
              <p className="s-sub">{h.firstSub}</p>
            </div>
          </div>
          <div className="s-firsts">
            {featured.map((item) => (
              <article className="s-first" key={item.id}>
                <PhotoPlaceholder t={t} subject={item.name} />
                <div className="s-first__body">
                  <h3 className="s-first__name">{item.name}</h3>
                  <p>{item.description?.[lang]}</p>
                  <p className="s-first__price">{formatUsd(item.priceCents, lang)}</p>
                  <Link className="s-link" href={`/${lang}/menu#${item.id}`} style={{ marginTop: "auto" }}>
                    {h.seeOnMenu}
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <p className="s-source" style={{ marginTop: "var(--s-3)" }}>
            {fill(h.firstSource, { date: checked })}
          </p>
        </div>
      </section>

      <section className="s-section" aria-labelledby="ways-title">
        <div className="s-wrap">
          <h2 className="s-h2" id="ways-title" style={{ marginBottom: "var(--s-5)" }}>
            {h.waysTitle}
          </h2>
          <div className="s-ways">
            <a className="s-way" href={BUSINESS.ordering.url} target="_blank" rel="noopener" data-track="order_handoff">
              <span className="s-way__icon">
                <BagIcon />
              </span>
              <span>
                <strong>{h.ways.pickup.title}</strong>
                <span>{h.ways.pickup.body}</span>
              </span>
              <span className="s-way__go" aria-hidden="true">
                ↗
              </span>
              <span className="visually-hidden">({t.newTab})</span>
            </a>
            <a className="s-way" href={BUSINESS.ordering.url} target="_blank" rel="noopener" data-track="delivery_handoff">
              <span className="s-way__icon">
                <ScooterIcon />
              </span>
              <span>
                <strong>{h.ways.delivery.title}</strong>
                <span>{h.ways.delivery.body}</span>
              </span>
              <span className="s-way__go" aria-hidden="true">
                ↗
              </span>
              <span className="visually-hidden">({t.newTab})</span>
            </a>
            <Link className="s-way" href={`/${lang}/catering`}>
              <span className="s-way__icon">
                <PlatterIcon />
              </span>
              <span>
                <strong>{h.ways.catering.title}</strong>
                <span>{h.ways.catering.body}</span>
              </span>
              <span className="s-way__go" aria-hidden="true">
                →
              </span>
            </Link>
            <a className="s-way" href={`tel:${BUSINESS.phone.e164}`} data-track="call_click">
              <span className="s-way__icon">
                <PhoneIcon />
              </span>
              <span>
                <strong>{h.ways.call.title}</strong>
                <span>{fill(h.ways.call.body, { phone: BUSINESS.phone.display })}</span>
              </span>
              <span className="s-way__go" aria-hidden="true">
                →
              </span>
            </a>
          </div>
          <p className="s-handoff">{t.handoff}</p>
        </div>
      </section>

      <section className="s-section s-section--ink" aria-labelledby="menu-title">
        <div className="s-wrap">
          <div className="s-section__head">
            <div>
              <h2 className="s-h2" id="menu-title">
                {h.menuTitle}
              </h2>
              <p className="s-sub">{h.menuSub}</p>
            </div>
            <Link className="s-btn s-btn--sm" href={`/${lang}/menu`} style={{ borderColor: "var(--paper)", color: "var(--paper)" }}>
              {h.menuCta} <MoreArrow />
            </Link>
          </div>
          <div className="s-chips">
            {MENU_CATEGORIES.map((category) => (
              <Link className="s-chip" key={category.id} href={`/${lang}/menu#${category.id}`}>
                {category.name[lang]}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="s-section" id="story" aria-labelledby="story-title">
        <div className="s-wrap s-story">
          <div>
            <h2 className="s-h2" id="story-title">
              {h.storyTitle}
            </h2>
            <div className="s-sub">
              {h.storyBody.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            {demo ? (
              <p className="s-source" style={{ marginTop: "var(--s-4)", maxWidth: "52ch" }}>
                <span className="s-draft">{h.storyDraft}</span> {h.storyDraftNote}
              </p>
            ) : null}
          </div>
          <PhotoPlaceholder t={t} subject={lang === "es" ? "El local" : "The dining room"} variant="wide" />
        </div>
      </section>

      <section className="s-section s-section--deep" aria-labelledby="visit-title">
        <div className="s-wrap s-visit">
          <div>
            <h2 className="s-h2" id="visit-title">
              {h.visitTitle}
            </h2>
            <address className="s-address" style={{ marginTop: "var(--s-4)" }}>
              {BUSINESS.address.street}
              <br />
              {BUSINESS.address.city}, {BUSINESS.address.state} {BUSINESS.address.zip}
            </address>
            <div className="s-hero__cta">
              <DirectionsLink t={t} className="s-btn s-btn--ink" />
              <CallLink t={t} />
            </div>
          </div>
          <div className="s-card">
            <HoursTable locale={lang} />
            <p className="s-source" style={{ marginTop: "var(--s-3)" }}>
              {fill(t.visit.hoursSource, { date: checked })}
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
