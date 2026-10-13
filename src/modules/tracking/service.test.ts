import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { siteEvents } from "@/db/schema";
import { createTestDb } from "@/db/testing";
import { getEventCounts, getEventCountsByCampaign, recordSiteEvent, sanitizePath, siteEventInput } from "./service";

describe("website activity tracking", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
  });

  it("stores a tap once even when the browser sends it twice", async () => {
    const event = { clientEventId: "evt-duplicate-0001", type: "order_handoff", locale: "en", path: "/en/menu" } as const;
    expect(await recordSiteEvent(db, event)).toEqual({ recorded: true });
    expect(await recordSiteEvent(db, event)).toEqual({ recorded: false });
    expect((await getEventCounts(db)).order_handoff).toBe(1);
  });

  it("drops query strings so personal data in a URL is never stored", async () => {
    expect(sanitizePath("/en/catering?email=someone@example.com#x")).toBe("/en/catering");
    expect(sanitizePath("https://evil.example/x")).toBeNull();
    await recordSiteEvent(db, { clientEventId: "evt-path-000001", type: "catering_view", path: "/es/catering?phone=9545550100" });
    const rows = await db.select().from(siteEvents);
    expect(rows.every((row) => !row.path?.includes("?"))).toBe(true);
  });

  it("rejects unknown event types, oversized ids and malformed campaign codes", () => {
    expect(siteEventInput.safeParse({ clientEventId: "evt-00000001", type: "purchase" }).success).toBe(false);
    expect(siteEventInput.safeParse({ clientEventId: "short", type: "menu_view" }).success).toBe(false);
    expect(siteEventInput.safeParse({ clientEventId: "evt-00000002", type: "menu_view", campaignCode: "jane@example.com" }).success).toBe(false);
    expect(siteEventInput.safeParse({ clientEventId: "evt-00000003", type: "menu_view", campaignCode: "LUNCH-OCT" }).success).toBe(true);
  });

  it("has no event type that claims an order, a sale, or a visit", () => {
    const types = siteEventInput.shape.type.options as readonly string[];
    for (const forbidden of ["order", "purchase", "sale", "revenue", "store_visit"]) {
      expect(types).not.toContain(forbidden);
    }
    expect(types).toContain("order_handoff");
  });

  it("groups taps by campaign code", async () => {
    await recordSiteEvent(db, { clientEventId: "evt-camp-000001", type: "menu_view", campaignCode: "LUNCH-TEST" });
    await recordSiteEvent(db, { clientEventId: "evt-camp-000002", type: "order_handoff", campaignCode: "LUNCH-TEST" });
    const byCampaign = await getEventCountsByCampaign(db);
    expect(byCampaign["LUNCH-TEST"]).toMatchObject({ menu_view: 1, order_handoff: 1, call_click: 0 });
    expect((await getEventCounts(db, { campaignCode: "LUNCH-TEST" })).order_handoff).toBe(1);
  });
});
