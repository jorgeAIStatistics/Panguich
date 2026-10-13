import type { Bilingual } from "@/lib/i18n";
import type { WeeklyHours } from "@/lib/time";

/**
 * Business facts for Panguich, each tied to the public page it was read from.
 *
 * Nothing in this file is invented. Facts were read from the restaurant's own public pages
 * on the dates below and still need the owner's confirmation before a live launch.
 * See docs/SOURCES.md for the full record.
 */

export type SourceId = "toast" | "panguich_us" | "panguichfl";

export const SOURCES: Record<SourceId, { label: Bilingual; url: string; checkedOn: string }> = {
  toast: {
    label: { en: "Toast online ordering page", es: "Página de pedidos en Toast" },
    url: "https://www.toasttab.com/local/order/panguich",
    checkedOn: "2026-10-13",
  },
  panguich_us: {
    label: { en: "panguich.us (current website, by SpotHopper)", es: "panguich.us (sitio actual, de SpotHopper)" },
    url: "https://panguich.us/",
    checkedOn: "2026-10-13",
  },
  panguichfl: {
    label: { en: "panguichfl.com (second ordering website)", es: "panguichfl.com (segundo sitio de pedidos)" },
    url: "https://panguichfl.com/",
    checkedOn: "2026-10-13",
  },
};

export const BUSINESS = {
  name: "Panguich",
  tagline: {
    en: "Peruvian sánguches, breakfast and pollo a la brasa",
    es: "Sánguches peruanos, desayunos y pollo a la brasa",
  } satisfies Bilingual,
  address: {
    street: "10215 Stirling Road",
    city: "Cooper City",
    state: "FL",
    zip: "33328",
    country: "US",
  },
  phone: { display: "(954) 883-9366", e164: "+19548839366" },
  /**
   * Hours as shown on Toast and on panguich.us (both agree). panguichfl.com shows a
   * different Sunday closing time; see KNOWN_CONFLICTS.
   */
  hours: {
    0: { open: "08:00", close: "17:00" },
    1: { open: "08:00", close: "19:00" },
    2: { open: "08:00", close: "19:00" },
    3: { open: "08:00", close: "19:00" },
    4: { open: "08:00", close: "19:00" },
    5: { open: "08:00", close: "19:00" },
    6: { open: "08:00", close: "19:00" },
  } satisfies WeeklyHours,
  hoursSources: ["toast", "panguich_us"] satisfies SourceId[],
  ordering: {
    provider: "Toast",
    /**
     * The link the restaurant's own website uses for "Order". It is a plain link to Toast's
     * hosted ordering page. We never build links that pretend to pre-fill a cart.
     */
    url: "https://www.toasttab.com/local/order/panguich",
    pickup: true,
    delivery: true,
    /** Shown on the Toast page on the check date. */
    notes: {
      rewards: {
        en: "Toast shows a rewards program: 1 point per $5 spent, 25 points for signing up.",
        es: "Toast muestra un programa de recompensas: 1 punto por cada $5, 25 puntos al registrarse.",
      },
      cardSurcharge: {
        en: "Toast states a 3% surcharge applies when paying by credit card.",
        es: "Toast indica un recargo de 3% al pagar con tarjeta de crédito.",
      },
    },
    source: "toast" satisfies SourceId,
  },
  links: {
    /** Google Maps "directions" URL (official Maps URL format). */
    directions:
      "https://www.google.com/maps/dir/?api=1&destination=Panguich%2C%2010215%20Stirling%20Rd%2C%20Cooper%20City%2C%20FL%2033328",
    map: "https://www.google.com/maps/search/?api=1&query=Panguich%2C%2010215%20Stirling%20Rd%2C%20Cooper%20City%2C%20FL%2033328",
    instagram: "https://www.instagram.com/panguich",
    facebook: "https://www.facebook.com/116533124743914",
  },
  /** The restaurant's own allergy notice, from its website menu. */
  allergyNotice: {
    en: "Food allergies or dietary needs? Please tell a team member before ordering.",
    es: "¿Alergias o necesidades alimentarias? Avísale al equipo antes de ordenar.",
  } satisfies Bilingual,
} as const;

export type KnownConflict = {
  id: string;
  topic: Bilingual;
  detail: Bilingual;
  observations: Array<{ source: SourceId; value: string }>;
  ownerQuestion: Bilingual;
};

/**
 * Places where the restaurant's public pages disagree with each other. These are observed
 * facts, not judgments: a different price per channel may be intentional.
 */
export const KNOWN_CONFLICTS: KnownConflict[] = [
  {
    id: "sunday-close",
    topic: { en: "Sunday closing time", es: "Hora de cierre del domingo" },
    detail: {
      en: "Two of your pages say Sunday closes at 5:00 PM and one says 4:00 PM. A guest who trusts the wrong one may arrive to a closed door.",
      es: "Dos de tus páginas dicen que el domingo cierran a las 5:00 PM y una dice 4:00 PM. Un cliente que confíe en la equivocada puede llegar con el local cerrado.",
    },
    observations: [
      { source: "toast", value: "8:00 AM – 5:00 PM" },
      { source: "panguich_us", value: "8:00 AM – 5:00 PM" },
      { source: "panguichfl", value: "8:00 AM – 4:00 PM" },
    ],
    ownerQuestion: {
      en: "Which Sunday closing time is correct?",
      es: "¿Cuál es la hora correcta de cierre del domingo?",
    },
  },
  {
    id: "channel-prices",
    topic: { en: "Prices differ between your two ordering sites", es: "Los precios difieren entre tus dos sitios de pedidos" },
    detail: {
      en: "The same dishes show different prices on Toast and on panguichfl.com, in both directions. This may be intentional; it is listed so you can confirm.",
      es: "Los mismos platos muestran precios distintos en Toast y en panguichfl.com, en ambos sentidos. Puede ser intencional; se muestra para que lo confirmes.",
    },
    observations: [
      { source: "toast", value: "Pan con Chicharrón $13.99 · Lomo Saltado bowl $17.99 · Pan con Pollo $12.99" },
      { source: "panguichfl", value: "Pan con Chicharrón $15.64 · Lomo Saltado bowl $13.45 · Pan con Pollo $13.54" },
    ],
    ownerQuestion: {
      en: "Are the panguichfl.com prices intentional, and should that site stay active?",
      es: "¿Los precios de panguichfl.com son intencionales? ¿Ese sitio debe seguir activo?",
    },
  },
  {
    id: "website-vs-toast-prices",
    topic: { en: "A few website menu prices differ from Toast", es: "Algunos precios del sitio web difieren de Toast" },
    detail: {
      en: "Five items show one price on the panguich.us menu and another on Toast. This site shows the Toast price, because that is what a guest is charged when ordering.",
      es: "Cinco productos muestran un precio en el menú de panguich.us y otro en Toast. Este sitio muestra el precio de Toast, porque es lo que se cobra al ordenar.",
    },
    observations: [
      { source: "panguich_us", value: "Pavo $12.99 · Asado $12.99 · Espresso $3.25 · Cortadito $3.50 · Iced Americano $5.75" },
      { source: "toast", value: "Pan con Pavo $13.99 · Asado $13.99 · Espresso $3.00 · Cortadito $3.20 · Americano helado $5.50" },
    ],
    ownerQuestion: {
      en: "Which price list should be treated as the official one?",
      es: "¿Qué lista de precios debe tratarse como la oficial?",
    },
  },
];

export function fullAddress(): string {
  const a = BUSINESS.address;
  return `${a.street}, ${a.city}, ${a.state} ${a.zip}`;
}

/** Canonical origin for metadata. Local unless the owner approves a real domain. */
export function siteUrl(): string {
  return (process.env.PANGUICH_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
