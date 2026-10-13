import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { consentRecords } from "@/db/schema";
import { createTestDb } from "@/db/testing";
import { canMessage, consentGrantsForWebsiteForm, recordConsentGrants, suppressContact, type ConsentGrant } from "./consent";
import { CONSENT_DISCLOSURE_VERSION, CONSENT_DISCLOSURES } from "./consent-text";
import { submitWebsiteInquiry } from "./service";
import { NOW, validForm } from "./test-helpers";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

async function inquiryId(email: string): Promise<string> {
  const result = await submitWebsiteInquiry(db, validForm({ email, phone: "" }), { locale: "en" }, NOW);
  if (!result.ok) throw new Error(result.code);
  return result.value.id;
}

function grant(overrides: Partial<ConsentGrant> & Pick<ConsentGrant, "inquiryId" | "contactKey" | "channel">): ConsentGrant {
  return {
    disclosureVersion: CONSENT_DISCLOSURE_VERSION,
    disclosureText: CONSENT_DISCLOSURES.email_marketing.en,
    source: "website_catering_form",
    locale: "en",
    capturedAt: NOW,
    ...overrides,
  };
}

describe("consentGrantsForWebsiteForm", () => {
  const base = { inquiryId: "i1", email: "a@example.com", phone: "(954) 555-0100", locale: "en" as const, capturedAt: NOW };

  it("produces nothing without the contact permission", () => {
    expect(consentGrantsForWebsiteForm({ ...base, consentContact: false, consentNews: false })).toEqual([]);
  });

  it("produces one contact row per method and a separate news row only when asked", () => {
    const contactOnly = consentGrantsForWebsiteForm({ ...base, consentContact: true, consentNews: false });
    expect(contactOnly.map((g) => [g.channel, g.contactKey])).toEqual([
      ["transactional_contact", "a@example.com"],
      ["transactional_contact", "9545550100"],
    ]);
    const withNews = consentGrantsForWebsiteForm({ ...base, consentContact: true, consentNews: true });
    expect(withNews.filter((g) => g.channel === "email_marketing").map((g) => g.contactKey)).toEqual(["a@example.com"]);
    expect(withNews.find((g) => g.channel === "email_marketing")?.disclosureText).toBe(CONSENT_DISCLOSURES.email_marketing.en);
  });

  it("never produces SMS marketing, and no news row without an email address", () => {
    const phoneOnly = consentGrantsForWebsiteForm({ ...base, email: null, consentContact: true, consentNews: true });
    expect(phoneOnly.map((g) => g.channel)).toEqual(["transactional_contact"]);
    for (const consentNews of [true, false]) {
      const grants = consentGrantsForWebsiteForm({ ...base, consentContact: true, consentNews });
      expect(grants.some((g) => g.channel === "sms_marketing")).toBe(false);
    }
  });

  it("stores the wording in the language the person saw", () => {
    const spanish = consentGrantsForWebsiteForm({ ...base, locale: "es", consentContact: true, consentNews: true });
    expect(spanish.map((g) => g.disclosureText)).toEqual([
      CONSENT_DISCLOSURES.transactional_contact.es,
      CONSENT_DISCLOSURES.transactional_contact.es,
      CONSENT_DISCLOSURES.email_marketing.es,
    ]);
    expect(spanish.every((g) => g.disclosureVersion === CONSENT_DISCLOSURE_VERSION && g.source === "website_catering_form")).toBe(true);
  });
});

describe("canMessage and suppressContact", () => {
  it("is false when nothing is on record", async () => {
    expect(await canMessage(db, "nobody@example.com", "email_marketing")).toBe(false);
    expect(await canMessage(db, "nobody@example.com", "transactional_contact")).toBe(false);
    expect(await canMessage(db, "", "email_marketing")).toBe(false);
  });

  it("is true only for the exact channel that was granted", async () => {
    const id = await inquiryId("channel@example.com");
    expect(await canMessage(db, "channel@example.com", "transactional_contact")).toBe(true);
    expect(await canMessage(db, "channel@example.com", "email_marketing")).toBe(false);
    await recordConsentGrants(db, [grant({ inquiryId: id, contactKey: "channel@example.com", channel: "email_marketing", capturedAt: later(1) })]);
    expect(await canMessage(db, "channel@example.com", "email_marketing")).toBe(true);
    expect(await canMessage(db, "channel@example.com", "sms_marketing")).toBe(false);
  });

  it("is false after the contact unsubscribes, and stays false", async () => {
    const id = await inquiryId("leaver@example.com");
    await recordConsentGrants(db, [grant({ inquiryId: id, contactKey: "leaver@example.com", channel: "email_marketing" })]);
    expect(await canMessage(db, "leaver@example.com", "email_marketing")).toBe(true);

    const result = await suppressContact(db, " Leaver@Example.com ", "email_marketing", { now: later(5) });
    expect(result.suppressed).toBe(1);
    expect(await canMessage(db, "leaver@example.com", "email_marketing")).toBe(false);

    const rows = await db.select().from(consentRecords).where(eq(consentRecords.contactKey, "leaver@example.com"));
    const marketing = rows.find((r) => r.channel === "email_marketing");
    // The original evidence is kept; it is marked suppressed rather than deleted.
    expect(marketing).toMatchObject({ granted: true });
    expect(marketing?.suppressedAt?.getTime()).toBe(later(5).getTime());
    // Unsubscribing from news does not block replies about the request.
    expect(await canMessage(db, "leaver@example.com", "transactional_contact")).toBe(true);
    // Doing it twice changes nothing.
    expect((await suppressContact(db, "leaver@example.com", "email_marketing", { now: later(6) })).suppressed).toBe(0);
    expect(await canMessage(db, "leaver@example.com", "email_marketing")).toBe(false);
  });

  it("only a new explicit consent after unsubscribing makes the contact messageable again", async () => {
    const id = await inquiryId("back@example.com");
    await recordConsentGrants(db, [grant({ inquiryId: id, contactKey: "back@example.com", channel: "email_marketing" })]);
    await suppressContact(db, "back@example.com", "email_marketing", { now: later(5) });
    expect(await canMessage(db, "back@example.com", "email_marketing")).toBe(false);
    await recordConsentGrants(db, [grant({ inquiryId: id, contactKey: "back@example.com", channel: "email_marketing", capturedAt: later(10) })]);
    expect(await canMessage(db, "back@example.com", "email_marketing")).toBe(true);
  });

  it("remembers a STOP from a contact with no earlier record", async () => {
    expect((await suppressContact(db, "stranger@example.com", "email_marketing", { now: NOW })).suppressed).toBe(0);
    const rows = await db.select().from(consentRecords).where(eq(consentRecords.contactKey, "stranger@example.com"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ granted: false, channel: "email_marketing", source: "unsubscribe" });
    expect(rows[0].suppressedAt).not.toBeNull();
    expect(await canMessage(db, "stranger@example.com", "email_marketing")).toBe(false);
  });

  it("when two records share the newest time, a refusal wins", async () => {
    const id = await inquiryId("tie@example.com");
    await recordConsentGrants(db, [grant({ inquiryId: id, contactKey: "tie@example.com", channel: "email_marketing", capturedAt: later(1) })]);
    await db.insert(consentRecords).values({
      id: "tie-refusal",
      inquiryId: id,
      contactKey: "tie@example.com",
      channel: "email_marketing",
      granted: false,
      disclosureVersion: "test",
      disclosureText: "test",
      source: "test",
      locale: "en",
      capturedAt: later(1),
    });
    expect(await canMessage(db, "tie@example.com", "email_marketing")).toBe(false);
  });

  it("refuses to record SMS marketing consent at all", async () => {
    const id = await inquiryId("sms@example.com");
    await expect(recordConsentGrants(db, [grant({ inquiryId: id, contactKey: "9545550100", channel: "sms_marketing" })])).rejects.toThrow(/SMS/);
    expect(await db.select().from(consentRecords).where(eq(consentRecords.channel, "sms_marketing"))).toHaveLength(0);
  });
});
