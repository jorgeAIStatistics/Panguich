import type { Metadata } from "next";
import { BUSINESS, siteUrl } from "@/content/business";
import { isIndexingAllowed } from "@/lib/demo";
import { LOCALES, type Locale } from "@/lib/i18n";
import type { Weekday } from "@/lib/time";

/** Public pages, without the language prefix. Used for metadata, the sitemap and the URL inventory. */
export const SITE_PATHS = ["", "/menu", "/catering", "/visit"] as const;
export type SitePath = (typeof SITE_PATHS)[number];

/** Title, description, canonical URL and language alternates for one public page. */
export function pageMetadata(locale: Locale, path: SitePath, title: string, description: string): Metadata {
  const languages = Object.fromEntries(LOCALES.map((l) => [l, `/${l}${path}`]));
  return {
    title,
    description,
    alternates: { canonical: `/${locale}${path}`, languages: { ...languages, "x-default": `/en${path}` } },
    openGraph: {
      type: "website",
      siteName: BUSINESS.name,
      title,
      description,
      url: `/${locale}${path}`,
      locale: locale === "es" ? "es_US" : "en_US",
    },
    // The preview build must not compete with the restaurant's live pages in search results.
    robots: isIndexingAllowed() ? { index: true, follow: true } : { index: false, follow: false },
  };
}

const SCHEMA_DAYS: Record<Weekday, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

/**
 * schema.org Restaurant data built only from verified business facts.
 * Deliberately has no ratings or reviews: we do not mark up our own praise.
 */
export function restaurantJsonLd(locale: Locale): Record<string, unknown> {
  const origin = siteUrl();
  const groups = new Map<string, string[]>();
  for (const [weekday, hours] of Object.entries(BUSINESS.hours)) {
    if (!hours) continue;
    const key = `${hours.open}-${hours.close}`;
    groups.set(key, [...(groups.get(key) ?? []), SCHEMA_DAYS[Number(weekday) as Weekday]]);
  }
  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": `${origin}/#restaurant`,
    name: BUSINESS.name,
    url: `${origin}/${locale}`,
    telephone: BUSINESS.phone.e164,
    servesCuisine: "Peruvian",
    address: {
      "@type": "PostalAddress",
      streetAddress: BUSINESS.address.street,
      addressLocality: BUSINESS.address.city,
      addressRegion: BUSINESS.address.state,
      postalCode: BUSINESS.address.zip,
      addressCountry: BUSINESS.address.country,
    },
    openingHoursSpecification: [...groups.entries()].map(([key, days]) => {
      const [opens, closes] = key.split("-");
      return { "@type": "OpeningHoursSpecification", dayOfWeek: days, opens, closes };
    }),
    hasMenu: `${origin}/${locale}/menu`,
    hasMap: BUSINESS.links.map,
    sameAs: [BUSINESS.links.instagram, BUSINESS.links.facebook],
    potentialAction: {
      "@type": "OrderAction",
      target: BUSINESS.ordering.url,
      deliveryMethod: ["http://purl.org/goodrelations/v1#DeliveryModePickUp", "http://purl.org/goodrelations/v1#DeliveryModeOwnFleet"],
    },
  };
}

/** Serializes JSON-LD safely for a <script> tag. */
export function jsonLdScript(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
