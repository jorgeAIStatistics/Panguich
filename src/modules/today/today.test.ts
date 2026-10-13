import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { auditLog } from "@/db/schema";
import { createTestDb, TEST_MANAGER, TEST_OWNER, TEST_STAFF } from "@/db/testing";
import type { ActionCard } from "@/lib/action-card";
import { PermissionError } from "@/lib/auth/permissions";
import { getBusinessTodayCards, getConflictResolutions, resolveConflict } from "./business";
import { MAX_TODAY_CARDS, prioritizeCards } from "./prioritize";

function card(id: string, priority: number): ActionCard {
  return { id, module: "catering", priority, title: id, explanation: "", source: "test", freshness: "now", basis: "observed", nextAction: { label: "Go", href: "/owner" } };
}

describe("Today prioritization", () => {
  it("never shows more than three cards and keeps the rest reachable", () => {
    const { shown, waiting } = prioritizeCards([card("a", 10), card("b", 95), card("c", 50), card("d", 70), card("e", 30)]);
    expect(MAX_TODAY_CARDS).toBe(3);
    expect(shown.map((c) => c.id)).toEqual(["b", "d", "c"]);
    expect(waiting.map((c) => c.id)).toEqual(["e", "a"]);
  });

  it("is stable for ties and collapses duplicates", () => {
    const { shown } = prioritizeCards([card("z", 50), card("a", 50), card("a", 50)]);
    expect(shown.map((c) => c.id)).toEqual(["a", "z"]);
  });
});

describe("public-page conflict cards", () => {
  let db: Db;
  const now = new Date("2026-10-13T15:00:00Z");
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("shows the open conflicts as one observed card with a source, a check date and an honest unknown", async () => {
    const cards = await getBusinessTodayCards(db, "owner", "en", now);
    expect(cards).toHaveLength(1);
    const [card] = cards;
    expect(card.id).toBe("business:public-page-conflicts");
    expect(card.title).toBe("Your public pages disagree on 3 things");
    expect(card.explanation).toMatch(/Sunday closing time/);
    expect(card.basis).toBe("observed");
    expect(card.source).toMatch(/3 of your public pages/);
    expect(card.freshness).toMatch(/Oct 13, 2026/);
    expect(card.uncertainty).toBeTruthy();
    expect(card.synthetic).toBeUndefined();
    expect(card.nextAction.href).toBe("/owner/settings#facts");
  });

  it("warns when the check is more than a month old", async () => {
    const later = new Date("2026-12-20T15:00:00Z");
    const [card] = await getBusinessTodayCards(db, "owner", "en", later);
    expect(card.freshness).toMatch(/over a month ago/);
  });

  it("is hidden from staff and written in Spanish for Spanish readers", async () => {
    expect(await getBusinessTodayCards(db, "staff", "en", now)).toEqual([]);
    const [card] = await getBusinessTodayCards(db, "manager", "es", now);
    expect(card.title).toBe("Tus páginas públicas no coinciden en 3 cosas");
  });

  it("lets only the owner record an answer, and logs a refused attempt", async () => {
    await expect(resolveConflict(db, TEST_MANAGER, "sunday-close", "5 PM", now)).rejects.toBeInstanceOf(PermissionError);
    await expect(resolveConflict(db, TEST_STAFF, "sunday-close", "5 PM", now)).rejects.toBeInstanceOf(PermissionError);
    const denied = await db.select().from(auditLog);
    expect(denied.filter((row) => row.outcome === "denied")).toHaveLength(2);
    expect(await getConflictResolutions(db)).toEqual({});

    expect(await resolveConflict(db, TEST_OWNER, "sunday-close", "  5:00 PM is correct  ", now)).toEqual({ ok: true });
    const saved = await getConflictResolutions(db);
    expect(saved["sunday-close"]).toMatchObject({ answer: "5:00 PM is correct", resolvedBy: "demo-owner" });

    // Two questions are still open, so the card stays but counts down.
    const [remaining] = await getBusinessTodayCards(db, "owner", "en", now);
    expect(remaining.title).toBe("Your public pages disagree on 2 things");
    expect(remaining.explanation).not.toMatch(/To confirm:.*Sunday closing time/);

    await resolveConflict(db, TEST_OWNER, "channel-prices", "Intentional", now);
    await resolveConflict(db, TEST_OWNER, "website-vs-toast-prices", "Toast is official", now);
    expect(await getBusinessTodayCards(db, "owner", "en", now)).toEqual([]);
  });

  it("rejects empty answers and unknown questions", async () => {
    expect(await resolveConflict(db, TEST_OWNER, "sunday-close", "   ", now)).toEqual({ ok: false, reason: "empty_answer" });
    expect(await resolveConflict(db, TEST_OWNER, "not-a-conflict", "x", now)).toEqual({ ok: false, reason: "unknown_conflict" });
  });
});
