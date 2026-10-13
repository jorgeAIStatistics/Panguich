import { describe, expect, it } from "vitest";
import { BUSINESS, KNOWN_CONFLICTS, SOURCES } from "./business";
import { checkFreshness, INTEGRATIONS } from "./integrations";
import { featuredItems, MENU_CATEGORIES, MENU_CHECKED_ON, MENU_ITEMS, searchMenu } from "./menu";
import { siteCopy } from "./site-copy";
import { jsonLdScript, restaurantJsonLd } from "@/lib/seo";

describe("menu content", () => {
  it("has unique ids, valid categories and whole-cent prices", () => {
    const ids = MENU_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    const categories = new Set(MENU_CATEGORIES.map((c) => c.id));
    for (const item of MENU_ITEMS) {
      expect(categories.has(item.categoryId), item.id).toBe(true);
      expect(Number.isInteger(item.priceCents) && item.priceCents > 0, item.id).toBe(true);
      expect(/^[a-z0-9-]+$/.test(item.id), item.id).toBe(true);
    }
    expect(MENU_ITEMS.length).toBeGreaterThan(100);
  });

  it("records where every price came from and when", () => {
    expect(MENU_CHECKED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const item of MENU_ITEMS) {
      expect(SOURCES[item.priceSource], item.id).toBeDefined();
      expect(item.priceSource).toBe(item.availability === "online" ? "toast" : "panguich_us");
    }
  });

  it("writes every description in both languages and labels our own general explanations", () => {
    for (const item of MENU_ITEMS) {
      if (!item.description) continue;
      expect(item.description.en.trim().length, item.id).toBeGreaterThan(0);
      expect(item.description.es.trim().length, item.id).toBeGreaterThan(0);
      expect(["restaurant", "gloss"]).toContain(item.descriptionSource);
    }
  });

  it("makes no allergen, diet, nutrition, award or best-seller claims", () => {
    const forbidden = /\b(gluten|vegan|vegetarian|organic|calorie|healthy|allergen-free|dairy-free|nut-free|best[- ]sell|award|#1|famous|sin gluten|vegano|saludable|m[aá]s vendido|premiado)\b/i;
    for (const item of MENU_ITEMS) {
      const text = [item.name, item.description?.en, item.description?.es, item.note?.en, item.note?.es].filter(Boolean).join(" ");
      expect(forbidden.test(text), `${item.id}: ${text}`).toBe(false);
    }
    const allCopy = JSON.stringify([siteCopy("en"), siteCopy("es")]);
    expect(forbidden.test(allCopy)).toBe(false);
  });

  it("features only the three items the restaurant features on Toast", () => {
    expect(featuredItems().map((item) => item.id).sort()).toEqual(["butifarra", "pan-con-chicharron", "pan-con-pollo"]);
    expect(featuredItems().every((item) => item.availability === "online")).toBe(true);
  });

  it("finds dishes without accents and across both languages", () => {
    expect(searchMenu("chicharron").some((item) => item.id === "pan-con-chicharron")).toBe(true);
    expect(searchMenu("LUCUMA").some((item) => item.id === "batido-lucuma")).toBe(true);
    expect(searchMenu("camote").length).toBeGreaterThan(1); // Spanish word in description
    expect(searchMenu("sweet potato").length).toBeGreaterThan(1); // English words
    expect(searchMenu("zzzz")).toEqual([]);
    expect(searchMenu("   ")).toHaveLength(MENU_ITEMS.length);
  });
});

describe("business facts", () => {
  it("uses the Toast-hosted ordering page and never a pre-filled cart link", () => {
    const url = new URL(BUSINESS.ordering.url);
    expect(url.hostname).toBe("www.toasttab.com");
    expect(url.pathname).toBe("/local/order/panguich");
    expect(url.search).toBe("");
  });

  it("keeps the Sunday-hours disagreement visible instead of silently picking one", () => {
    const sunday = KNOWN_CONFLICTS.find((c) => c.id === "sunday-close");
    expect(sunday?.observations.map((o) => o.value)).toEqual(expect.arrayContaining(["8:00 AM – 5:00 PM", "8:00 AM – 4:00 PM"]));
    expect(BUSINESS.hours[0]).toEqual({ open: "08:00", close: "17:00" });
  });

  it("has English and Spanish for every public string", () => {
    const shape = (value: unknown): unknown =>
      Array.isArray(value) ? value.map(shape) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)])) : typeof value;
    expect(shape(siteCopy("es"))).toEqual(shape(siteCopy("en")));
  });
});

describe("connections", () => {
  it("never claims a connection that has not been set up and verified", () => {
    expect(INTEGRATIONS.length).toBeGreaterThan(0);
    for (const integration of INTEGRATIONS) {
      expect(integration.state, integration.id).toBe("not_configured");
    }
  });

  it("marks a public fact stale after a month", () => {
    expect(checkFreshness("2026-10-13", "2026-10-13")).toEqual({ stale: false, ageDays: 0 });
    expect(checkFreshness("2026-10-13", "2026-11-12").stale).toBe(false);
    expect(checkFreshness("2026-10-13", "2026-11-13").stale).toBe(true);
  });
});

describe("structured data", () => {
  it("describes the restaurant from verified facts only, with no ratings or reviews", () => {
    const data = restaurantJsonLd("en");
    const text = jsonLdScript(data);
    expect(data["@type"]).toBe("Restaurant");
    expect(text).toContain("10215 Stirling Road");
    expect(text).toContain("+19548839366");
    expect(text).not.toMatch(/aggregateRating|"review"|ratingValue/);
    expect(data.openingHoursSpecification).toEqual([
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Sunday"], opens: "08:00", closes: "17:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], opens: "08:00", closes: "19:00" },
    ]);
  });

  it("escapes markup so the JSON cannot break out of its script tag", () => {
    expect(jsonLdScript({ name: "</script><script>alert(1)</script>" })).not.toContain("</script>");
  });
});
