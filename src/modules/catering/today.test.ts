import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { cateringChecklistItems, cateringInquiries, cateringQuotes, consentRecords } from "@/db/schema";
import { createTestDb, TEST_MANAGER, TEST_OWNER, TEST_STAFF } from "@/db/testing";
import { seedCatering } from "./seed";
import {
  approveQuote,
  changeStatus,
  createQuoteVersion,
  getInquiryDetail,
  setChecklistItemDone,
  setDepositStatus,
  setFollowUp,
  submitWebsiteInquiry,
  type Result,
} from "./service";
import { NOW, SAMPLE_LINES, TODAY, validForm } from "./test-helpers";
import { getCateringTodayCards } from "./today";

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`Expected success, got ${result.code}`);
  return result.value;
}
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

async function realRequest(db: Db, form: Parameters<typeof validForm>[0], at: Date = NOW) {
  return value(await submitWebsiteInquiry(db, validForm(form), { locale: "en" }, at));
}
async function confirm(db: Db, id: string) {
  const quote = value(await createQuoteVersion(db, TEST_MANAGER, id, { lines: SAMPLE_LINES }, NOW));
  value(await approveQuote(db, TEST_OWNER, quote.id, NOW));
  value(await changeStatus(db, TEST_MANAGER, id, { to: "quoted" }, NOW));
  value(await changeStatus(db, TEST_MANAGER, id, { to: "accepted" }, NOW));
  value(await setDepositStatus(db, TEST_OWNER, id, { to: "waived" }, NOW));
  value(await changeStatus(db, TEST_MANAGER, id, { to: "confirmed" }, NOW));
}

describe("seedCatering", () => {
  it("creates exactly two clearly fake sample requests with every rule satisfied", async () => {
    const db = await createTestDb();
    await seedCatering(db, NOW);
    await seedCatering(db, NOW); // Running it again adds nothing.

    const rows = await db.select().from(cateringInquiries);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.isSynthetic).toBe(true);
      expect(row.source).toBe("sample");
      expect(row.contactName).toMatch(/^Sample customer [AB] \(demo\)$/);
      expect(row.contactEmail).toMatch(/@example\.com$/);
      expect(row.contactPhone).toMatch(/^\(954\) 555-01\d\d$/);
      expect(row.createdAt.getTime()).toBeLessThan(NOW.getTime());
    }
    // No real person filled in a form, so no consent is invented for them.
    expect(await db.select().from(consentRecords)).toHaveLength(0);

    const quoted = rows.find((row) => row.status === "quoted")!;
    expect(quoted).toMatchObject({ followUpOn: TODAY, depositStatus: "not_requested", eventDate: "2026-10-25", assigneeId: TEST_MANAGER.id });
    const [quotedQuote] = await db.select().from(cateringQuotes).where(eq(cateringQuotes.inquiryId, quoted.id));
    expect(quotedQuote).toMatchObject({ status: "approved", version: 1, subtotalCents: 480_00, approvedBy: TEST_OWNER.id });

    const confirmed = rows.find((row) => row.status === "confirmed")!;
    expect(confirmed).toMatchObject({ eventDate: "2026-10-15", depositStatus: "recorded_unverified", fulfillment: "delivery", locale: "es" });
    expect(confirmed.depositNote).toMatch(/No real payment exists/);
    const detail = await getInquiryDetail(db, TEST_STAFF, confirmed.id, NOW);
    expect(detail?.currentQuote).toMatchObject({ status: "approved", subtotalCents: 345_00 });
    const kinds = new Set(detail?.checklist.map((item) => item.kind));
    expect([...kinds].sort()).toEqual(["handoff", "packing", "production"]);
    expect(detail?.checklist.filter((item) => item.kind === "production")).toHaveLength(2);
    expect(detail?.checklist.every((item) => !item.done)).toBe(true);
  });
});

describe("getCateringTodayCards", () => {
  it("returns nothing when there is nothing to do", async () => {
    const db = await createTestDb();
    expect(await getCateringTodayCards(db, "owner", "en", NOW)).toEqual([]);
  });

  it("builds cards from the sample data and marks them synthetic", async () => {
    const db = await createTestDb();
    await seedCatering(db, NOW);
    const cards = await getCateringTodayCards(db, "owner", "en", NOW);
    expect(cards.map((card) => card.id)).toEqual(["catering:follow-ups-due", "catering:events-soon"]);
    for (const card of cards) {
      expect(card).toMatchObject({ module: "catering", basis: "observed", synthetic: true });
      expect(card.source).toBe("Sample request made for this demonstration");
      expect(card.freshness).not.toBe("");
      expect(card.explanation).not.toBe("");
      expect(card.nextAction.href).toMatch(/^\/owner\/catering/);
    }
    const [followUp, event] = cards;
    expect(followUp.priority).toBe(70);
    expect(followUp.title).toBe("1 catering follow-up is due today");
    // Two days out: 79 - 2.
    expect(event.priority).toBe(77);
    expect(event.title).toMatch(/^Catering event in 2 days: \d+ checklist items are still open$/);
    expect(event.nextAction.href).toMatch(/#pack$/);
  });

  it("speaks Spanish when asked", async () => {
    const db = await createTestDb();
    await seedCatering(db, NOW);
    const cards = await getCateringTodayCards(db, "owner", "es", NOW);
    expect(cards[0].title).toBe("1 seguimiento de catering es para hoy");
    expect(cards[1].title).toMatch(/^Evento de catering en 2 días: quedan \d+ puntos pendientes en las listas$/);
    expect(cards[0].source).toBe("Solicitud de muestra hecha para esta demostración");
  });

  it("shows each role only the cards it can act on", async () => {
    const db = await createTestDb();
    await seedCatering(db, NOW);
    await realRequest(db, { email: "role@example.com" });
    const ids = async (role: "owner" | "manager" | "staff") => (await getCateringTodayCards(db, role, "en", NOW)).map((card) => card.id);
    expect(await ids("owner")).toEqual(["catering:new-inquiries", "catering:follow-ups-due", "catering:events-soon"]);
    expect(await ids("manager")).toEqual(["catering:new-inquiries", "catering:follow-ups-due", "catering:events-soon"]);
    // Staff fulfill events; they cannot reply to requests or manage follow-ups.
    expect(await ids("staff")).toEqual(["catering:events-soon"]);
  });

  it("raises a new website request as a real, observed card with the website as its source", async () => {
    const db = await createTestDb();
    const created = await realRequest(db, { email: "new@example.com", headcount: "42", eventDate: "2026-11-01" }, hoursAgo(2));
    const [card, ...rest] = await getCateringTodayCards(db, "manager", "en", NOW);
    expect(rest).toEqual([]);
    expect(card).toMatchObject({
      id: "catering:new-inquiries",
      priority: 90,
      title: "1 catering request is waiting for a first reply",
      source: "Catering request form on this website",
      freshness: "Oldest received 2 hours ago",
      basis: "observed",
      synthetic: false,
      nextAction: { label: "Open the request", href: `/owner/catering/${created.id}` },
    });
    expect(card.explanation).toContain(created.reference);
    expect(card.explanation).toContain("42 guests");
    expect(card.explanation).toContain("Sun, Nov 1, 2026");
    // The card never carries the customer's name or contact details.
    expect(JSON.stringify(card)).not.toContain("example.com");
    expect(JSON.stringify(card)).not.toContain("Test Person");
  });

  it("raises the priority the longer a request waits, within 90-95, and links to the list when there are several", async () => {
    const db = await createTestDb();
    await realRequest(db, { email: "old@example.com" }, hoursAgo(30));
    await realRequest(db, { email: "newer@example.com" }, hoursAgo(1));
    const [card] = await getCateringTodayCards(db, "owner", "en", NOW);
    expect(card.priority).toBe(92);
    expect(card.title).toBe("2 catering requests are waiting for a first reply");
    expect(card.freshness).toBe("Oldest received yesterday");
    expect(card.nextAction.href).toBe("/owner/catering?stage=new");

    const other = await createTestDb();
    await realRequest(other, { email: "ancient@example.com" }, hoursAgo(24 * 9));
    expect((await getCateringTodayCards(other, "owner", "en", NOW))[0].priority).toBe(95);
  });

  it("never mixes sample rows into a card that has real rows", async () => {
    const db = await createTestDb();
    await seedCatering(db, NOW);
    const real = await realRequest(db, { email: "realfollow@example.com" });
    value(await changeStatus(db, TEST_MANAGER, real.id, { to: "needs_details" }, NOW));
    value(await setFollowUp(db, TEST_MANAGER, real.id, { date: TODAY }, NOW));

    const cards = await getCateringTodayCards(db, "owner", "en", NOW);
    const followUp = cards.find((card) => card.id === "catering:follow-ups-due")!;
    expect(followUp.synthetic).toBe(false);
    expect(followUp.title).toBe("1 catering follow-up is due today");
    expect(followUp.source).toBe("Follow-up dates saved on catering requests");
    expect(followUp.nextAction.href).toBe(`/owner/catering/${real.id}`);
    // The event card is still built only from the sample event, so it stays marked.
    expect(cards.find((card) => card.id === "catering:events-soon")?.synthetic).toBe(true);
  });

  it("counts overdue follow-ups and ignores closed requests", async () => {
    const db = await createTestDb();
    const overdue = await realRequest(db, { email: "overdue@example.com" }, hoursAgo(24 * 5));
    value(await changeStatus(db, TEST_MANAGER, overdue.id, { to: "needs_details" }, hoursAgo(24 * 5)));
    value(await setFollowUp(db, TEST_MANAGER, overdue.id, { date: "2026-10-10" }, hoursAgo(24 * 5)));
    const closed = await realRequest(db, { email: "closed@example.com" }, hoursAgo(24 * 5));
    value(await setFollowUp(db, TEST_MANAGER, closed.id, { date: "2026-10-10" }, hoursAgo(24 * 5)));
    value(await changeStatus(db, TEST_MANAGER, closed.id, { to: "lost", reason: "Test" }, NOW));
    const future = await realRequest(db, { email: "future@example.com" });
    value(await changeStatus(db, TEST_MANAGER, future.id, { to: "needs_details" }, NOW));
    value(await setFollowUp(db, TEST_MANAGER, future.id, { date: "2026-10-14" }, NOW));

    const cards = await getCateringTodayCards(db, "owner", "en", NOW);
    expect(cards.map((card) => card.id)).toEqual(["catering:follow-ups-due"]);
    expect(cards[0]).toMatchObject({ priority: 73, title: "1 catering follow-up is overdue", synthetic: false });
    expect(cards[0].freshness).toBe("Due 3 days ago (Sat, Oct 10)");
  });

  it("raises confirmed events in the next three days only while checklist items are open", async () => {
    const db = await createTestDb();
    const tomorrow = await realRequest(db, { email: "tomorrow@example.com", eventDate: "2026-10-14" });
    const nextWeek = await realRequest(db, { email: "nextweek@example.com", eventDate: "2026-10-20" });
    const notConfirmed = await realRequest(db, { email: "open@example.com", eventDate: "2026-10-14" });
    await confirm(db, tomorrow.id);
    await confirm(db, nextWeek.id);
    value(await changeStatus(db, TEST_MANAGER, notConfirmed.id, { to: "needs_details" }, NOW));

    let cards = await getCateringTodayCards(db, "staff", "en", NOW);
    expect(cards).toHaveLength(1);
    const openItems = (await db.select().from(cateringChecklistItems).where(eq(cateringChecklistItems.inquiryId, tomorrow.id))).length;
    expect(cards[0]).toMatchObject({
      id: "catering:events-soon",
      priority: 78,
      title: `Catering event tomorrow: ${openItems} checklist items are still open`,
      source: "Confirmed catering requests and their checklists",
      synthetic: false,
      basis: "observed",
      nextAction: { href: `/owner/catering/${tomorrow.id}#pack` },
    });

    // Tick everything: the card goes away.
    const items = await db.select().from(cateringChecklistItems).where(eq(cateringChecklistItems.inquiryId, tomorrow.id));
    for (const item of items.slice(1)) value(await setChecklistItemDone(db, TEST_STAFF, item.id, true, NOW));
    cards = await getCateringTodayCards(db, "staff", "en", NOW);
    expect(cards[0].title).toBe("Catering event tomorrow: 1 checklist item is still open");
    value(await setChecklistItemDone(db, TEST_STAFF, items[0].id, true, NOW));
    expect(await getCateringTodayCards(db, "staff", "en", NOW)).toEqual([]);
  });

  it("uses Cooper City's calendar day across the daylight-saving change", async () => {
    const db = await createTestDb();
    const event = await realRequest(db, { email: "dst-event@example.com", eventDate: "2026-11-01" });
    await confirm(db, event.id);
    const priorityAt = async (now: Date) => (await getCateringTodayCards(db, "staff", "en", now))[0]?.priority;
    expect(await priorityAt(new Date("2026-10-29T03:59:00Z"))).toBeUndefined(); // Oct 28, four days out
    expect(await priorityAt(new Date("2026-10-29T04:00:00Z"))).toBe(76); // Oct 29, three days out
    expect(await priorityAt(new Date("2026-11-01T03:59:00Z"))).toBe(78); // Oct 31, 23:59 EDT
    expect(await priorityAt(new Date("2026-11-01T04:00:00Z"))).toBe(79); // Nov 1, 00:00 EDT
    expect(await priorityAt(new Date("2026-11-02T04:59:00Z"))).toBe(79); // Nov 1, 23:59 EST (25-hour day)
    expect(await priorityAt(new Date("2026-11-02T05:00:00Z"))).toBeUndefined(); // Nov 2: the event day has passed
  });
});
