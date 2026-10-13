import { describe, expect, it } from "vitest";
import { BUSINESS } from "@/content/business";
import { getMenuItem, MENU_ITEMS } from "@/content/menu";
import { CAMPAIGN_USE_CASES, CREATIVE_KINDS } from "@/db/schema";
import { LOCALES } from "@/lib/i18n";
import { weekdayOfIsoDate } from "@/lib/time";
import { CAMPAIGN_CODE_PATTERN } from "@/modules/tracking/service";
import { hasBlockingCheck, runCampaignChecks } from "./checks";
import { daysPhrase } from "./schedule-text";
import { buildDraft, generateCreatives, landingUrlPath, LINK_PLACEHOLDER, USE_CASE_TEMPLATES } from "./templates";

const TODAY = "2026-10-13"; // a Tuesday

function draftFor(useCase: (typeof CAMPAIGN_USE_CASES)[number], locale: "en" | "es" = "en") {
  return buildDraft(useCase, { code: `${USE_CASE_TEMPLATES[useCase].codePrefix}-AB12`, today: TODAY, locale });
}

describe("campaign templates", () => {
  it("sets up each of the three use cases with one goal, no discount and no spend", () => {
    expect(draftFor("weekday_lunch")).toMatchObject({
      objective: "order_pickup",
      landingPath: "/menu",
      offer: { type: "none" },
      budgetCents: 0,
      featuredItemIds: ["pan-con-chicharron", "pan-con-pollo", "butifarra"],
      schedule: { weekdays: [1, 2, 3, 4, 5], startTime: "11:00", endTime: "14:00", startsOn: "2026-10-14", endsOn: "2026-11-10" },
    });
    expect(draftFor("weekend_breakfast")).toMatchObject({
      objective: "order_pickup",
      landingPath: "/menu",
      offer: { type: "none" },
      budgetCents: 0,
      schedule: { weekdays: [6, 0], startTime: "08:00", endTime: "12:00", startsOn: "2026-10-17" },
    });
    expect(draftFor("catering")).toMatchObject({
      objective: "catering_quote",
      landingPath: "/catering",
      offer: { type: "none" },
      budgetCents: 0,
      featuredItemIds: [],
    });
    expect(draftFor("weekday_lunch", "es").name).toBe("Almuerzo entre semana");
  });

  it("uses only dishes from the verified menu, a valid tracking code and a first day that is a selected weekday", () => {
    for (const useCase of CAMPAIGN_USE_CASES) {
      const draft = draftFor(useCase);
      expect(draft.code).toMatch(CAMPAIGN_CODE_PATTERN);
      expect(draft.featuredItemIds.every((id) => getMenuItem(id))).toBe(true);
      expect(draft.schedule.weekdays).toContain(weekdayOfIsoDate(draft.schedule.startsOn));
      expect(draft.schedule.startsOn > TODAY).toBe(true);
      expect(landingUrlPath(draft, "es")).toBe(`/es${draft.landingPath}?c=${draft.code}`);
    }
    const sanguches = draftFor("weekday_lunch").featuredItemIds.map((id) => getMenuItem(id)!);
    expect(sanguches.every((item) => item.categoryId === "sanguches" && item.availability === "online")).toBe(true);
    const breakfasts = draftFor("weekend_breakfast").featuredItemIds.map((id) => getMenuItem(id)!);
    expect(breakfasts.every((item) => item.categoryId === "desayunos")).toBe(true);
  });

  it("writes all four kinds of text in both languages for every use case", () => {
    for (const useCase of CAMPAIGN_USE_CASES) {
      const creatives = generateCreatives(draftFor(useCase));
      expect(creatives).toHaveLength(8);
      for (const kind of CREATIVE_KINDS) {
        const en = creatives.find((c) => c.kind === kind && c.locale === "en");
        const es = creatives.find((c) => c.kind === kind && c.locale === "es");
        expect(en?.body.trim().length).toBeGreaterThan(40);
        expect(es?.body.trim().length).toBeGreaterThan(40);
        expect(en!.body).not.toBe(es!.body);
        expect(en!.origin).toBe("template");
        expect(es!.origin).toBe("template");
      }
      // A draft made from a template passes its own blocking checks.
      expect(hasBlockingCheck(runCampaignChecks(draftFor(useCase), creatives, "en", TODAY))).toBe(false);
    }
  });

  it("writes Spanish that is Spanish, and English that is English", () => {
    const creatives = generateCreatives(draftFor("weekday_lunch"));
    const text = (locale: "en" | "es") => creatives.filter((c) => c.locale === locale).map((c) => c.body).join("\n");
    expect(text("es")).toContain("¿Y el almuerzo de hoy?");
    expect(text("es")).toContain("de lunes a viernes");
    expect(text("es")).toContain("Chicharrón de cerdo, camote y salsa criolla.");
    expect(text("es")).toContain(LINK_PLACEHOLDER.es);
    expect(text("es")).not.toMatch(/\b(the|and|with|order|pickup|lunch|Monday)\b/);
    expect(text("en")).toContain("Monday to Friday");
    expect(text("en")).toContain(LINK_PLACEHOLDER.en);
    expect(text("en")).not.toMatch(/\b(el|los|las|pedido|almuerzo|lunes)\b/);
  });

  it("states only verified facts: menu dishes, menu prices, the address and the phone", () => {
    const menuPrices = new Set(MENU_ITEMS.map((item) => (item.priceCents / 100).toFixed(2)));
    for (const useCase of CAMPAIGN_USE_CASES) {
      const draft = draftFor(useCase);
      const items = draft.featuredItemIds.map((id) => getMenuItem(id)!);
      const featuredPrices = new Set(items.map((item) => (item.priceCents / 100).toFixed(2)));
      for (const creative of generateCreatives(draft)) {
        // Every dollar amount written anywhere is the listed price of a dish that is shown.
        const amounts = [...creative.body.matchAll(/\$\s?(\d+(?:\.\d{2})?)/g)].map((match) => match[1]);
        for (const amount of amounts) {
          expect(menuPrices.has(amount)).toBe(true);
          expect(featuredPrices.has(amount)).toBe(true);
        }
        if (creative.kind === "email") {
          expect(amounts).toHaveLength(items.length);
          expect(creative.body).toContain("10215 Stirling Road, Cooper City, FL 33328");
          expect(creative.body).toContain(BUSINESS.phone.display);
        }
        for (const item of items) {
          if (creative.kind !== "caption" && creative.kind !== "email") continue;
          expect(creative.body).toContain(item.name);
          if (item.description) expect(creative.body).toContain(item.description[creative.locale]);
        }
      }
    }
  });

  it("makes no superlative, scarcity, health or discount claims", () => {
    const banned = new RegExp(
      [
        // English
        "\\b(best|#1|number one|famous|award\\w*|world[- ]class|authentic|fresh(ly)?|homemade|healthy|gluten|vegan|organic|allerg\\w*)\\b",
        "\\b(limited time|hurry|only \\d+ left|last chance|today only|discount\\w*|% off|free|deal|guarantee\\w*)\\b",
        // Spanish (accented words are matched without word boundaries)
        "\\b(mejor(es)?|famos\\w+|premiad\\w+|fresc\\w+|caser\\w+|saludable\\w*|sin gluten|vegan\\w+|tiempo limitado|solo por hoy|descuento\\w*|gratis|oferta\\w*|garantiz\\w+)\\b",
        "auténtic|orgánic|alérg|apúrate|últim[ao]s?\\b|promoción",
      ].join("|"),
      "i",
    );
    for (const useCase of CAMPAIGN_USE_CASES) {
      for (const creative of generateCreatives(draftFor(useCase))) {
        // The dish descriptions are the restaurant's own words; the check is on what the template adds.
        let own = creative.body;
        for (const item of MENU_ITEMS) if (item.description) own = own.split(item.description[creative.locale]).join("");
        expect(own, `${useCase} ${creative.kind} ${creative.locale}`).not.toMatch(banned);
      }
    }
  });

  it("only says “order ahead” when every dish shown was listed for online ordering", () => {
    const lunch = generateCreatives(draftFor("weekday_lunch"));
    expect(lunch.find((c) => c.kind === "caption" && c.locale === "en")!.body).toContain("Order ahead and pick up, Monday to Friday: [campaign link]");
    expect(lunch.find((c) => c.kind === "caption" && c.locale === "es")!.body).toContain("Haz tu pedido y pasa a recogerlo, de lunes a viernes: [enlace de campaña]");

    // The breakfast dishes were not on the online ordering page when checked.
    const breakfast = generateCreatives(draftFor("weekend_breakfast"));
    for (const creative of breakfast) {
      expect(creative.body).not.toMatch(/order ahead|pick up|haz tu pedido|recog/i);
    }
    expect(breakfast.find((c) => c.kind === "caption" && c.locale === "en")!.body).toContain("See the menu and how to find us: [campaign link]");
    expect(breakfast.find((c) => c.kind === "caption" && c.locale === "en")!.body).toContain("Breakfasts include coffee.");

    // Lunch aimed at visits instead of pickup stops talking about ordering ahead.
    const visits = generateCreatives({ ...draftFor("weekday_lunch"), objective: "directions" });
    for (const creative of visits) expect(creative.body).not.toMatch(/order ahead|pide antes|haz tu pedido/i);

    const catering = generateCreatives(draftFor("catering"));
    expect(catering.find((c) => c.kind === "email" && c.locale === "en")!.body).toContain("A quote is an estimate.");
    expect(catering.find((c) => c.kind === "caption" && c.locale === "es")!.body).toContain("Pide tu cotización de catering: [enlace de campaña]");
  });

  it("never states the Sunday closing time, which the public pages disagree on", () => {
    for (const creative of generateCreatives(draftFor("weekend_breakfast"))) {
      expect(creative.body).not.toMatch(/5:00|4:00|17:00|16:00/);
    }
  });

  it("puts days of the week in plain words in both languages", () => {
    expect(daysPhrase([1, 2, 3, 4, 5], "en")).toBe("Monday to Friday");
    expect(daysPhrase([5, 4, 3, 2, 1], "es")).toBe("de lunes a viernes");
    expect(daysPhrase([0, 6], "en")).toBe("Saturday and Sunday");
    expect(daysPhrase([6, 0], "es")).toBe("sábados y domingos");
    expect(daysPhrase([1, 3, 5], "es")).toBe("lunes, miércoles y viernes");
    expect(daysPhrase([0, 1, 2, 3, 4, 5, 6], "en")).toBe("every day");
    expect(daysPhrase([], "es")).toBe("sin días elegidos");
    expect(LOCALES).toEqual(["en", "es"]);
  });
});
