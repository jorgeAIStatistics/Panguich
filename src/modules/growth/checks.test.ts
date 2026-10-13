import { describe, expect, it } from "vitest";
import type { CampaignOffer } from "@/db/schema";
import { hasBlockingCheck, missingOfferParts, runCampaignChecks, SUNDAY_EARLIEST_PUBLISHED_CLOSE, type CheckCode } from "./checks";
import { buildDraft, generateCreatives } from "./templates";
import type { CampaignContent, CreativeContent } from "./types";

const TODAY = "2026-10-13";

function lunch(overrides: Partial<CampaignContent> = {}): CampaignContent {
  return { ...buildDraft("weekday_lunch", { code: "LUNCH-AB12", today: TODAY, locale: "en" }), ...overrides };
}

function check(campaign: CampaignContent, creatives: CreativeContent[] = generateCreatives(campaign), locale: "en" | "es" = "en", today = TODAY) {
  return runCampaignChecks(campaign, creatives, locale, today);
}

function levels(campaign: CampaignContent, creatives?: CreativeContent[]): Partial<Record<CheckCode, string>> {
  return Object.fromEntries(check(campaign, creatives).map((entry) => [entry.code, entry.level]));
}

const withSchedule = (campaign: CampaignContent, schedule: Partial<CampaignContent["schedule"]>): CampaignContent => ({
  ...campaign,
  schedule: { ...campaign.schedule, ...schedule },
});

const completeOffer: Extract<CampaignOffer, { type: "limited_test" }> = {
  type: "limited_test",
  description: "A cup of chicha morada with any sánguche",
  eligibleItemIds: ["pan-con-chicharron"],
  exclusions: "None",
  quantityLimit: 40,
  redemptionControl: "Guest shows the post at the counter; one per guest.",
  contributionMarginNote: "About $6 left per sánguche after the drink (owner's estimate).",
};

describe("campaign checks", () => {
  it("finds nothing wrong with the weekday lunch template", () => {
    expect(check(lunch())).toEqual([]);
  });

  it("blocks a time window outside the verified opening hours", () => {
    // The restaurant opens at 8:00 AM and closes at 7:00 PM Monday to Saturday.
    const late = check(withSchedule(lunch(), { startTime: "18:00", endTime: "20:00" }));
    expect(late).toHaveLength(1);
    expect(late[0]).toMatchObject({ level: "block", code: "outside_hours" });
    expect(late[0].message).toContain("Monday");
    expect(late[0].message).toContain("Friday");
    expect(hasBlockingCheck(late)).toBe(true);

    expect(levels(withSchedule(lunch(), { startTime: "07:00", endTime: "10:00" })).outside_hours).toBe("block");
    // Exactly the opening hours is inside.
    expect(levels(withSchedule(lunch(), { startTime: "08:00", endTime: "19:00" })).outside_hours).toBeUndefined();

    // Only the day that is actually outside is named: Sunday closes at 5:00 PM, Saturday at 7:00 PM.
    const weekend = check(withSchedule(lunch(), { weekdays: [6, 0], startTime: "16:00", endTime: "18:00" }));
    const outside = weekend.find((entry) => entry.code === "outside_hours")!;
    expect(outside.level).toBe("block");
    expect(outside.message).toContain("Sunday");
    expect(outside.message).not.toContain("Saturday");

    const spanish = check(withSchedule(lunch(), { startTime: "18:00", endTime: "20:00" }), undefined, "es");
    expect(spanish[0].message).toContain("queda fuera de tu horario publicado");
    expect(spanish[0].message).toContain("lunes");
  });

  it("warns when Sunday runs past 4:00 PM, because the public pages disagree on Sunday closing", () => {
    expect(SUNDAY_EARLIEST_PUBLISHED_CLOSE).toBe("16:00");
    const sunday = withSchedule(lunch(), { weekdays: [0], startTime: "12:00", endTime: "16:30" });
    const found = check(sunday);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ level: "warn", code: "sunday_close_conflict" });
    expect(found[0].message).toContain("disagree on Sunday closing");
    expect(found[0].message).toContain("5:00 PM and one says 4:00 PM");
    expect(hasBlockingCheck(found)).toBe(false);
    expect(check(sunday, undefined, "es")[0].message).toContain("no coinciden en la hora de cierre del domingo");

    // Ending at 4:00 PM, or not including Sunday, raises nothing.
    expect(check(withSchedule(lunch(), { weekdays: [0], startTime: "12:00", endTime: "16:00" }))).toEqual([]);
    expect(check(withSchedule(lunch(), { weekdays: [6], startTime: "12:00", endTime: "16:30" }))).toEqual([]);
  });

  it("warns when a pickup campaign shows dishes that were not listed for online ordering", () => {
    const breakfast = buildDraft("weekend_breakfast", { code: "BFAST-AB12", today: TODAY, locale: "en" });
    const found = check(breakfast);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ level: "warn", code: "not_online" });
    expect(found[0].message).toContain("not listed for online ordering when checked on October 13, 2026");
    expect(found[0].message).toContain("Desayuno Lurín");
    expect(check(breakfast, undefined, "es")[0].message).toContain("no aparecían para pedir en línea cuando se revisó el 13 de octubre de 2026");

    // Mixed: only the in-store dish is named.
    const mixed = check(lunch({ featuredItemIds: ["pan-con-chicharron", "tamales"] }));
    expect(mixed.find((entry) => entry.code === "not_online")!.message).toContain("Tamales");
    expect(mixed.find((entry) => entry.code === "not_online")!.message).not.toContain("Pan con Chicharrón");

    // The same dishes are fine when the goal is a visit, not an online order.
    expect(levels({ ...breakfast, objective: "directions" }).not_online).toBeUndefined();
  });

  it("blocks dishes that are not on the verified menu", () => {
    expect(levels(lunch({ featuredItemIds: ["pan-con-chicharron", "ceviche-invented"] })).unknown_item).toBe("block");
  });

  it("blocks an end date before the start date, and a campaign that already ended", () => {
    expect(levels(withSchedule(lunch(), { startsOn: "2026-11-10", endsOn: "2026-11-01" })).dates_reversed).toBe("block");
    expect(levels(withSchedule(lunch(), { startsOn: "2026-09-01", endsOn: "2026-10-12" })).already_ended).toBe("block");
    // Ending today has not ended yet.
    expect(levels(withSchedule(lunch(), { startsOn: "2026-09-01", endsOn: TODAY })).already_ended).toBeUndefined();
    expect(check(lunch(), undefined, "en", "2027-01-01").map((entry) => entry.code)).toEqual(["already_ended"]);
  });

  it("blocks when no day is selected or the time window is upside down", () => {
    expect(levels(withSchedule(lunch(), { weekdays: [] })).no_days).toBe("block");
    expect(levels(withSchedule(lunch(), { startTime: "14:00", endTime: "11:00" })).bad_window).toBe("block");
    expect(levels(withSchedule(lunch(), { startTime: "11:00", endTime: "11:00" })).bad_window).toBe("block");
  });

  it("warns about any paid spend: it needs the owner and no ad account is connected", () => {
    const found = check(lunch({ budgetCents: 5000 }));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ level: "warn", code: "budget_set" });
    expect(found[0].message).toContain("$50.00");
    expect(found[0].message).toContain("owner's approval");
    expect(found[0].message).toContain("no advertising account is connected");
    expect(found[0].message).toContain("nothing can be spent from here");
    expect(levels(lunch({ budgetCents: 0 })).budget_set).toBeUndefined();
  });

  it("blocks an incomplete limited test and names what is missing", () => {
    expect(check(lunch({ offer: completeOffer }))).toEqual([]);

    const empty: CampaignOffer = {
      type: "limited_test",
      description: "",
      eligibleItemIds: [],
      exclusions: " ",
      quantityLimit: null,
      redemptionControl: "",
      contributionMarginNote: null,
    };
    expect(missingOfferParts(empty)).toEqual(["description", "eligible", "exclusions", "limit", "redemption"]);
    const found = check(lunch({ offer: empty }));
    expect(found.map((entry) => [entry.code, entry.level])).toEqual([
      ["offer_incomplete", "block"],
      ["margin_unknown", "warn"],
    ]);
    expect(found[0].message).toContain("what the offer is");
    expect(found[0].message).toContain("a redemption limit, or “no limit”");

    // Each part on its own is enough to block.
    expect(missingOfferParts({ ...completeOffer, quantityLimit: null })).toEqual(["limit"]);
    expect(missingOfferParts({ ...completeOffer, quantityLimit: 0 })).toEqual(["limit"]);
    expect(missingOfferParts({ ...completeOffer, quantityLimit: "no_limit" })).toEqual([]);
    expect(missingOfferParts({ ...completeOffer, exclusions: "" })).toEqual(["exclusions"]);
    expect(missingOfferParts({ ...completeOffer, redemptionControl: "" })).toEqual(["redemption"]);
    expect(missingOfferParts({ ...completeOffer, eligibleItemIds: [] })).toEqual(["eligible"]);
    expect(levels(lunch({ offer: { ...completeOffer, quantityLimit: null } })).offer_incomplete).toBe("block");
  });

  it("shows a missing contribution margin as unknown instead of guessing", () => {
    const found = check(lunch({ offer: { ...completeOffer, contributionMarginNote: null } }));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ level: "warn", code: "margin_unknown" });
    expect(found[0].message).toMatch(/^Contribution margin unknown/);
    expect(check(lunch({ offer: { ...completeOffer, contributionMarginNote: "  " } }), undefined, "es")[0].message).toMatch(/^Margen de contribución desconocido/);
  });

  it("blocks empty or missing texts", () => {
    const campaign = lunch();
    const creatives = generateCreatives(campaign);
    const blanked = creatives.map((creative) => (creative.kind === "email" && creative.locale === "es" ? { ...creative, body: "   " } : creative));
    const found = check(campaign, blanked);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ level: "block", code: "creative_empty" });
    expect(found[0].message).toContain("Email (Spanish)");

    const missing = creatives.filter((creative) => creative.kind !== "caption");
    expect(check(campaign, missing)[0].message).toContain("Caption (English) and Caption (Spanish)");
    expect(levels(campaign, []).creative_empty).toBe("block");
  });

  it("notes when a caption or email lost the campaign link, without blocking", () => {
    const campaign = lunch();
    const creatives = generateCreatives(campaign).map((creative) =>
      creative.kind === "caption" && creative.locale === "en" ? { ...creative, body: "Lunch at Panguich." } : creative,
    );
    const found = check(campaign, creatives);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ level: "info", code: "link_missing" });
    expect(found[0].message).toContain("Caption (English)");
    expect(hasBlockingCheck(found)).toBe(false);
  });

  it("lists the most serious problems first", () => {
    const messy = withSchedule(lunch({ budgetCents: 100, featuredItemIds: ["tamales"] }), { startTime: "06:00", endTime: "09:00" });
    const creatives = generateCreatives(messy).map((creative) => (creative.kind === "caption" ? { ...creative, body: "No link here." } : creative));
    expect(check(messy, creatives).map((entry) => entry.level)).toEqual(["block", "warn", "warn", "info"]);
  });
});
