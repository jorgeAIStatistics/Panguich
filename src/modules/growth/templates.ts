import { BUSINESS } from "@/content/business";
import { getMenuItem, MENU_CATEGORIES, MENU_CHECKED_ON, type MenuItem } from "@/content/menu";
import {
  CREATIVE_KINDS,
  type CampaignObjective,
  type CampaignUseCase,
  type CreativeKind,
} from "@/db/schema";
import { LOCALES, type Bilingual, type Locale } from "@/lib/i18n";
import { formatUsd } from "@/lib/money";
import { addDaysToIsoDate, formatClockTime, weekdayOfIsoDate, type Weekday } from "@/lib/time";
import { daysPhrase, joinList, longDate, sortWeekdays } from "./schedule-text";
import type { CampaignContent, CreativeContent } from "./types";

/**
 * Campaign templates.
 *
 * No AI writes these. Every draft is a fixed template filled in with facts this project has
 * verified: dish names, descriptions and prices from content/menu, the address, phone and
 * opening hours from content/business. The templates never say "best", "famous" or "#1",
 * never invent a discount or a deadline, and make no health, allergen or portion claim.
 * They are a starting point for the owner to edit, and are labeled that way.
 */

/** Pages on the public website a campaign link may point at. */
export const LANDING_PATHS = ["/menu", "/catering", "/visit", "/"] as const;
export type LandingPath = (typeof LANDING_PATHS)[number];

export const MAX_FEATURED_ITEMS = 6;

/**
 * Stands in for the campaign link inside a draft. The website's public address is not decided
 * yet, so drafts carry this marker and the export swaps in the full link.
 */
export const LINK_PLACEHOLDER: Bilingual = { en: "[campaign link]", es: "[enlace de campaña]" };

export type UseCaseTemplate = {
  useCase: CampaignUseCase;
  codePrefix: string;
  objective: CampaignObjective;
  landingPath: LandingPath;
  weekdays: Weekday[];
  startTime: string;
  endTime: string;
  /** How long the first test runs, in days. */
  runDays: number;
  featuredItemIds: string[];
  name: Bilingual;
  audience: Bilingual;
};

export const USE_CASE_TEMPLATES: Record<CampaignUseCase, UseCaseTemplate> = {
  weekday_lunch: {
    useCase: "weekday_lunch",
    codePrefix: "LUNCH",
    objective: "order_pickup",
    landingPath: "/menu",
    weekdays: [1, 2, 3, 4, 5],
    startTime: "11:00",
    endTime: "14:00",
    runDays: 28,
    // The three sánguches the restaurant itself features on its ordering page.
    featuredItemIds: ["pan-con-chicharron", "pan-con-pollo", "butifarra"],
    name: { en: "Weekday lunch", es: "Almuerzo entre semana" },
    audience: {
      en: "People who work or live near Stirling Road in Cooper City and want lunch on a weekday.",
      es: "Personas que trabajan o viven cerca de Stirling Road, en Cooper City, y buscan almuerzo entre semana.",
    },
  },
  weekend_breakfast: {
    useCase: "weekend_breakfast",
    codePrefix: "BFAST",
    objective: "order_pickup",
    landingPath: "/menu",
    weekdays: [6, 0],
    startTime: "08:00",
    endTime: "12:00",
    runDays: 28,
    featuredItemIds: ["desayuno-lurin", "desayuno-huachano", "desayuno-panguich"],
    name: { en: "Weekend breakfast", es: "Desayuno de fin de semana" },
    audience: {
      en: "Families and friends in and around Cooper City looking for breakfast on a Saturday or Sunday.",
      es: "Familias y amigos de Cooper City y alrededores que buscan dónde desayunar un sábado o domingo.",
    },
  },
  catering: {
    useCase: "catering",
    codePrefix: "CATER",
    objective: "catering_quote",
    landingPath: "/catering",
    weekdays: [1, 2, 3, 4, 5],
    startTime: "09:00",
    endTime: "17:00",
    runDays: 28,
    // No dishes by default: what is offered for catering has not been confirmed by the owner.
    featuredItemIds: [],
    name: { en: "Office and family catering", es: "Catering para oficinas y familias" },
    audience: {
      en: "Offices and families near Cooper City planning a lunch, a meeting or a celebration.",
      es: "Oficinas y familias cerca de Cooper City que organizan un almuerzo, una reunión o una celebración.",
    },
  },
};

/** A new draft for one use case. `today` is the Cooper City calendar date. */
export function buildDraft(useCase: CampaignUseCase, options: { code: string; today: string; locale: Locale }): CampaignContent {
  const template = USE_CASE_TEMPLATES[useCase];
  // Start on the next selected weekday after today, and run for four weeks.
  let startsOn = addDaysToIsoDate(options.today, 1);
  for (let step = 0; step < 7 && !template.weekdays.includes(weekdayOfIsoDate(startsOn)); step += 1) {
    startsOn = addDaysToIsoDate(startsOn, 1);
  }
  return {
    code: options.code,
    name: template.name[options.locale],
    useCase,
    objective: template.objective,
    audience: template.audience[options.locale],
    offer: { type: "none" },
    schedule: {
      startsOn,
      endsOn: addDaysToIsoDate(startsOn, template.runDays - 1),
      weekdays: sortWeekdays(template.weekdays),
      startTime: template.startTime,
      endTime: template.endTime,
    },
    featuredItemIds: [...template.featuredItemIds],
    landingPath: template.landingPath,
    budgetCents: 0,
  };
}

/** Where the campaign link lands, with the tracking code: "/en/menu?c=LUNCH-AB12". */
export function landingUrlPath(campaign: Pick<CampaignContent, "landingPath" | "code">, locale: Locale): string {
  const page = campaign.landingPath === "/" ? "" : campaign.landingPath;
  return `/${locale}${page}?c=${encodeURIComponent(campaign.code)}`;
}

/* ------------------------------------------------------------------ */
/* Draft text                                                          */
/* ------------------------------------------------------------------ */

type Context = {
  locale: Locale;
  es: boolean;
  items: MenuItem[];
  /** "Pan con Chicharrón, Pan con Pollo, and Butifarra" */
  itemNames: string;
  /** One line per dish: name and the menu's own description. */
  dishLines: string[];
  /** The same with the listed price, for email. */
  pricedDishLines: string[];
  allSanguches: boolean;
  days: string;
  link: string;
  /** "Stirling Road" */
  road: string;
  place: string;
  fullAddress: string;
  phone: string;
  cta: string;
  /** True only when the goal is pickup orders and every dish shown was listed for online ordering. */
  orderAhead: boolean;
  /** "We open at 8:00 AM, Saturday and Sunday." when every chosen day opens at the same time. */
  opensLine: string | null;
  breakfastNote: string | null;
  priceNote: string | null;
};

function context(campaign: CampaignContent, locale: Locale): Context {
  const es = locale === "es";
  const items = campaign.featuredItemIds.map(getMenuItem).filter((item): item is MenuItem => Boolean(item));
  const days = daysPhrase(campaign.schedule.weekdays, locale);
  const link = LINK_PLACEHOLDER[locale];
  const allOnline = items.every((item) => item.availability === "online");

  // The call to action follows the campaign's one goal. It only says "order ahead" when every
  // dish shown was actually listed for online ordering.
  const orderAhead = campaign.objective === "order_pickup" && allOnline;
  let cta: string;
  if (campaign.objective === "catering_quote") {
    cta = es ? `Pide tu cotización de catering: ${link}` : `Ask for a catering quote: ${link}`;
  } else if (orderAhead) {
    cta = es ? `Haz tu pedido y pasa a recogerlo, ${days}: ${link}` : `Order ahead and pick up, ${days}: ${link}`;
  } else {
    cta = es ? `Mira la carta y cómo llegar: ${link}` : `See the menu and how to find us: ${link}`;
  }

  const openTimes = new Set(sortWeekdays(campaign.schedule.weekdays).map((day) => BUSINESS.hours[day]?.open ?? "closed"));
  const [openTime] = [...openTimes];
  const opensLine =
    openTimes.size === 1 && openTime !== "closed"
      ? es
        ? `Abrimos a las ${formatClockTime(openTime, locale)}, ${days}.`
        : `We open at ${formatClockTime(openTime, locale)}, ${days}.`
      : null;

  const breakfasts = MENU_CATEGORIES.find((category) => category.id === "desayunos");
  const { street, city, state, zip } = BUSINESS.address;
  return {
    locale,
    es,
    items,
    itemNames: joinList(
      items.map((item) => item.name),
      locale,
    ),
    dishLines: items.map((item) => (item.description ? `${item.name} — ${item.description[locale]}` : item.name)),
    pricedDishLines: items.map((item) => {
      const head = `• ${item.name} (${formatUsd(item.priceCents, locale)})`;
      return item.description ? `${head} — ${item.description[locale]}` : head;
    }),
    allSanguches: items.length > 0 && items.every((item) => item.categoryId === "sanguches"),
    days,
    link,
    road: street.replace(/^\d+\s+/, ""),
    place: `${BUSINESS.name} · ${street}, ${city}`,
    fullAddress: `${street}, ${city}, ${state} ${zip}`,
    phone: BUSINESS.phone.display,
    cta,
    orderAhead,
    opensLine,
    // The restaurant's own menu note, used only when a breakfast dish is shown.
    breakfastNote: items.some((item) => item.categoryId === "desayunos") ? (breakfasts?.blurb?.[locale] ?? null) : null,
    priceNote:
      items.length > 0
        ? es
          ? `Precios según la carta al ${longDate(MENU_CHECKED_ON, locale)}; pueden cambiar.`
          : `Prices as listed on ${longDate(MENU_CHECKED_ON, locale)}; they may change.`
        : null,
  };
}

/** Joins blocks with a blank line between them, skipping empty ones. */
function blocks(...parts: Array<string | null | false | undefined | string[]>): string {
  return parts
    .map((part) => (Array.isArray(part) ? part.join("\n") : part))
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join("\n\n");
}

function signature(c: Context): string {
  return [BUSINESS.name, c.fullAddress, c.phone].join("\n");
}

function filmingNote(c: Context): string {
  return c.es
    ? "Antes de grabar: muestra los platos tal como se sirven, y pide permiso antes de grabar a alguien del equipo o a un cliente."
    : "Before you film: show the dishes exactly as they are served, and ask before filming anyone on the team or any guest.";
}

function reelOutro(c: Context): string {
  return c.es ? `Publícalo con el texto de la publicación y este enlace: ${c.link}` : `Post it with the caption and this link: ${c.link}`;
}

type Writer = (c: Context) => string;

const LUNCH: Record<CreativeKind, Writer> = {
  caption: (c) =>
    blocks(
      c.es
        ? `¿Y el almuerzo de hoy? ${c.allSanguches ? "Sánguches peruanos" : "Comida peruana"} en ${c.road}.`
        : `Lunch today? ${c.allSanguches ? "Peruvian sánguches" : "Peruvian food"} on ${c.road}.`,
      c.dishLines,
      c.cta,
      c.place,
    ),
  reel_script: (c) =>
    blocks(
      c.es ? "Reel · unos 20 segundos · video vertical" : "Reel · about 20 seconds · vertical video",
      c.es
        ? [`0–3 s · Primer plano de ${c.items[0]?.name ?? "un plato"} sobre el mostrador.`, "Texto en pantalla: «¿Y el almuerzo de hoy?»"]
        : [`0–3 s · Close-up of ${c.items[0]?.name ?? "a dish"} on the counter.`, "Text on screen: “Lunch today?”"],
      c.items.length > 0
        ? c.es
          ? `3–10 s · Un plato a la vez: ${c.itemNames}. Pon el nombre de cada uno en pantalla.`
          : `3–10 s · One dish at a time: ${c.itemNames}. Show each name on screen.`
        : c.es
          ? "3–10 s · Un plato a la vez, con su nombre en pantalla."
          : "3–10 s · One dish at a time, each with its name on screen.",
      c.orderAhead
        ? c.es
          ? ["10–15 s · Un pedido para recoger, entregado en el mostrador.", "Texto en pantalla: «Pide antes · pasa a recoger»"]
          : ["10–15 s · A pickup order handed over the counter.", "Text on screen: “Order ahead · pick up”"]
        : c.es
          ? ["10–15 s · Un plato llegando a la mesa.", "Texto en pantalla: «Te esperamos»"]
          : ["10–15 s · A plate arriving at the table.", "Text on screen: “See you at lunch”"],
      c.es
        ? ["15–20 s · La fachada y el letrero.", `Texto en pantalla: «${c.place}»`]
        : ["15–20 s · The storefront and the sign.", `Text on screen: “${c.place}”`],
      c.es
        ? `Voz (opcional): «¿Y el almuerzo de hoy? Te esperamos en ${BUSINESS.name}, en ${c.road}.»`
        : `Voice (optional): “Lunch today? Come see us at ${BUSINESS.name}, on ${c.road}.”`,
      reelOutro(c),
    ),
  shot_list: (c) =>
    blocks(
      c.es ? "Lista de tomas · graba en el restaurante, con tu propia comida" : "Shot list · film at the restaurant, with your own food",
      c.es
        ? [
            `1. Cada plato solo, cerca de una ventana o con buena luz${c.items.length ? `: ${c.itemNames}` : ""}.`,
            "2. Primer plano de unas manos armando un sánguche.",
            c.orderAhead ? "3. Un pedido para recoger, empacado y listo en el mostrador." : "3. Un plato llegando a la mesa.",
            `4. La fachada y el letrero en ${BUSINESS.address.street}.`,
            "5. Una toma amplia del salón a la hora del almuerzo.",
          ]
        : [
            `1. Each dish on its own, near a window or in good light${c.items.length ? `: ${c.itemNames}` : ""}.`,
            "2. Close-up of hands putting a sánguche together.",
            c.orderAhead ? "3. A pickup order, packed and ready on the counter." : "3. A plate arriving at the table.",
            `4. The storefront and the sign at ${BUSINESS.address.street}.`,
            "5. A wide shot of the room at lunchtime.",
          ],
      filmingNote(c),
    ),
  email: (c) =>
    blocks(
      c.es ? `Asunto: Almuerzo entre semana en ${BUSINESS.name}` : `Subject: Weekday lunch at ${BUSINESS.name}`,
      c.es ? "Hola:" : "Hello,",
      c.items.length > 0
        ? c.es
          ? `Si andas cerca de ${c.road} a la hora del almuerzo, aquí va algo de nuestra carta:`
          : `If you are near ${c.road} around lunchtime, here is something from our menu:`
        : c.es
          ? `Si andas cerca de ${c.road} a la hora del almuerzo, pasa por ${BUSINESS.name}.`
          : `If you are near ${c.road} around lunchtime, come by ${BUSINESS.name}.`,
      c.pricedDishLines,
      c.cta,
      c.priceNote,
      signature(c),
    ),
};

const BREAKFAST: Record<CreativeKind, Writer> = {
  caption: (c) =>
    blocks(
      c.es ? "Desayuno de fin de semana, a la peruana." : "Weekend breakfast, Peruvian style.",
      c.dishLines,
      [c.breakfastNote, c.opensLine].filter(Boolean).join(" "),
      c.cta,
      c.place,
    ),
  reel_script: (c) =>
    blocks(
      c.es ? "Reel · unos 20 segundos · video vertical" : "Reel · about 20 seconds · vertical video",
      c.es
        ? ["0–3 s · Una taza de café servida junto a un plato de desayuno.", "Texto en pantalla: «Desayuno de fin de semana»"]
        : ["0–3 s · A cup of coffee being poured next to a breakfast plate.", "Text on screen: “Weekend breakfast”"],
      c.items.length > 0
        ? c.es
          ? `3–11 s · Un plato a la vez: ${c.itemNames}. Pon el nombre de cada uno en pantalla.`
          : `3–11 s · One dish at a time: ${c.itemNames}. Show each name on screen.`
        : c.es
          ? "3–11 s · Un plato a la vez, con su nombre en pantalla."
          : "3–11 s · One dish at a time, each with its name on screen.",
      c.es
        ? ["11–15 s · La mesa servida, con pan y café.", c.opensLine ? `Texto en pantalla: «${c.opensLine}»` : ""].filter(Boolean)
        : ["11–15 s · The table set, with bread and coffee.", c.opensLine ? `Text on screen: “${c.opensLine}”` : ""].filter(Boolean),
      c.es
        ? ["15–20 s · La fachada y el letrero.", `Texto en pantalla: «${c.place}»`]
        : ["15–20 s · The storefront and the sign.", `Text on screen: “${c.place}”`],
      c.es
        ? `Voz (opcional): «Desayuno de fin de semana, a la peruana. ${BUSINESS.name}, en ${c.road}.»`
        : `Voice (optional): “Weekend breakfast, Peruvian style. ${BUSINESS.name}, on ${c.road}.”`,
      reelOutro(c),
    ),
  shot_list: (c) =>
    blocks(
      c.es ? "Lista de tomas · graba en el restaurante, con tu propia comida" : "Shot list · film at the restaurant, with your own food",
      c.es
        ? [
            `1. Cada plato solo, con luz de la mañana${c.items.length ? `: ${c.itemNames}` : ""}.`,
            "2. El café sirviéndose en la taza.",
            "3. La mesa completa vista desde arriba, con el pan.",
            `4. La fachada y el letrero en ${BUSINESS.address.street}.`,
            "5. Una toma amplia del salón por la mañana.",
          ]
        : [
            `1. Each dish on its own, in morning light${c.items.length ? `: ${c.itemNames}` : ""}.`,
            "2. Coffee being poured into the cup.",
            "3. The whole table from above, with the bread.",
            `4. The storefront and the sign at ${BUSINESS.address.street}.`,
            "5. A wide shot of the room in the morning.",
          ],
      filmingNote(c),
    ),
  email: (c) =>
    blocks(
      c.es ? `Asunto: Desayuno de fin de semana en ${BUSINESS.name}` : `Subject: Weekend breakfast at ${BUSINESS.name}`,
      c.es ? "Hola:" : "Hello,",
      c.items.length > 0
        ? c.es
          ? "Para el fin de semana, desayuno a la peruana:"
          : "For the weekend, breakfast Peruvian style:"
        : c.es
          ? `Este fin de semana, desayuna en ${BUSINESS.name}.`
          : `This weekend, have breakfast at ${BUSINESS.name}.`,
      c.pricedDishLines,
      [c.breakfastNote, c.opensLine].filter(Boolean).join(" "),
      c.cta,
      c.priceNote,
      signature(c),
    ),
};

const CATERING: Record<CreativeKind, Writer> = {
  caption: (c) =>
    blocks(
      c.es ? "¿Organizas un almuerzo de oficina o una reunión familiar?" : "Planning an office lunch or a family get-together?",
      c.es
        ? `Cuéntale a ${BUSINESS.name} la fecha, cuántas personas son y qué tienes en mente.`
        : `Tell ${BUSINESS.name} the date, how many people and what you have in mind.`,
      c.items.length > 0 ? [c.es ? "De nuestra carta:" : "From our menu:", ...c.dishLines] : null,
      c.cta,
      `${c.place} · ${c.phone}`,
    ),
  reel_script: (c) =>
    blocks(
      c.es ? "Reel · unos 15 segundos · video vertical" : "Reel · about 15 seconds · vertical video",
      c.es
        ? ["0–4 s · Comida que de verdad preparas para grupos, empacada y lista para salir.", `Texto en pantalla: «Catering de ${BUSINESS.name}»`]
        : ["0–4 s · Food you really prepare for groups, packed and ready to go.", `Text on screen: “Catering from ${BUSINESS.name}”`],
      c.es
        ? ["4–10 s · El pedido armándose, tal como sale del restaurante.", "Texto en pantalla: «Almuerzos de oficina · reuniones familiares»"]
        : ["4–10 s · The order being put together, the way it really leaves the restaurant.", "Text on screen: “Office lunches · family gatherings”"],
      c.es
        ? ["10–15 s · La fachada y el letrero.", "Texto en pantalla: «Pide tu cotización»"]
        : ["10–15 s · The storefront and the sign.", "Text on screen: “Ask for a quote”"],
      c.es
        ? `Voz (opcional): «¿Tienes que dar de comer a un grupo? Pide tu cotización de catering en ${BUSINESS.name}.»`
        : `Voice (optional): “Feeding a group? Ask ${BUSINESS.name} for a catering quote.”`,
      reelOutro(c),
    ),
  shot_list: (c) =>
    blocks(
      c.es ? "Lista de tomas · graba en el restaurante, con tu propia comida" : "Shot list · film at the restaurant, with your own food",
      c.es
        ? [
            `1. Los platos que de verdad ofreces para grupos, empacados como salen${c.items.length ? `: ${c.itemNames}` : ""}.`,
            "2. Las manos del equipo armando el pedido.",
            "3. El pedido completo, listo para entregar o recoger.",
            `4. La fachada y el letrero en ${BUSINESS.address.street}.`,
          ]
        : [
            `1. The dishes you really offer for groups, packed the way they go out${c.items.length ? `: ${c.itemNames}` : ""}.`,
            "2. The team's hands putting the order together.",
            "3. The complete order, ready to hand over or pick up.",
            `4. The storefront and the sign at ${BUSINESS.address.street}.`,
          ],
      c.es
        ? "Si todavía no tienes fotos de un pedido de catering real, no uses fotos de otro lugar: espera al próximo pedido y grábalo."
        : "If you do not have photos of a real catering order yet, do not use photos from somewhere else: wait for the next order and film it.",
      filmingNote(c),
    ),
  email: (c) =>
    blocks(
      c.es ? `Asunto: Catering de ${BUSINESS.name}` : `Subject: Catering from ${BUSINESS.name}`,
      c.es ? "Hola:" : "Hello,",
      c.es
        ? `Si estás organizando un almuerzo de oficina, una reunión o una celebración familiar, puedes pedirle una cotización de catering a ${BUSINESS.name}.`
        : `If you are planning an office lunch, a meeting or a family celebration, you can ask ${BUSINESS.name} for a catering quote.`,
      c.es
        ? ["Cuéntanos:", "• la fecha y la hora,", "• cuántas personas son,", "• si prefieres recoger o entrega,", "• cualquier cosa que debamos saber del grupo."]
        : ["Tell us:", "• the date and time,", "• how many people,", "• whether you prefer pickup or delivery,", "• anything we should know about the group."],
      c.items.length > 0 ? [c.es ? "De nuestra carta:" : "From our menu:", ...c.pricedDishLines] : null,
      c.cta,
      c.es
        ? "Una cotización es un estimado. Tu pedido queda confirmado solo cuando el restaurante te lo confirma."
        : "A quote is an estimate. Your order is confirmed only when the restaurant confirms it with you.",
      c.priceNote,
      signature(c),
    ),
};

const WRITERS: Record<CampaignUseCase, Record<CreativeKind, Writer>> = {
  weekday_lunch: LUNCH,
  weekend_breakfast: BREAKFAST,
  catering: CATERING,
};

/** One template draft: a kind of text in one language, from the campaign as it stands now. */
export function writeCreative(campaign: CampaignContent, kind: CreativeKind, locale: Locale): string {
  return WRITERS[campaign.useCase][kind](context(campaign, locale));
}

/** All eight template drafts (caption, reel script, shot list, email × English, Spanish). */
export function generateCreatives(campaign: CampaignContent): CreativeContent[] {
  return CREATIVE_KINDS.flatMap((kind) =>
    LOCALES.map((locale): CreativeContent => ({ kind, locale, body: writeCreative(campaign, kind, locale), origin: "template" })),
  );
}
