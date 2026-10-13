import { describe, expect, it } from "vitest";
import { cateringDict, cateringErrorText } from "./i18n";
import type { Activity, Person } from "./service";
import { describeActivity } from "./timeline";

const people: Person[] = [
  { id: "demo-owner", name: "Demo Owner", role: "owner" },
  { id: "demo-manager", name: "Demo Manager", role: "manager" },
];

function activity(overrides: Partial<Activity>): Activity {
  return { id: "a1", inquiryId: "i1", at: new Date("2026-10-13T16:00:00Z"), actorId: "demo-manager", kind: "note", fromStatus: null, toStatus: null, note: null, ...overrides };
}

describe("describeActivity", () => {
  const en = cateringDict("en");
  const es = cateringDict("es");

  it("describes each kind of event in plain words", () => {
    const line = (overrides: Partial<Activity>) => describeActivity(activity(overrides), en, "en", people);
    expect(line({ kind: "created", actorId: null, note: "website" }).headline).toBe("A website visitor sent this request · Catering request form on this website");
    expect(line({ kind: "created", note: "phone" }).headline).toBe("Demo Manager added this request · Phone call, entered by the team");
    expect(line({ kind: "status_change", fromStatus: "new", toStatus: "lost", note: "Too far" })).toEqual({
      headline: "Demo Manager moved it from “New” to “Lost”",
      detail: "Too far",
    });
    expect(line({ kind: "deposit_change", fromStatus: "requested", toStatus: "recorded_unverified", note: "Cash" })).toEqual({
      headline: "Demo Manager changed the deposit: “Deposit requested” → “Deposit noted as received (not verified)”",
      detail: "Cash",
    });
    expect(line({ kind: "follow_up_set", note: "2026-11-01" }).headline).toBe("Demo Manager set a follow-up for Sun, Nov 1, 2026");
    expect(line({ kind: "assigned", actorId: "demo-owner", note: "demo-manager" }).headline).toBe("Demo Owner gave it to Demo Manager");
    expect(line({ kind: "quote_approved", actorId: "demo-owner", note: "2" }).headline).toBe("Demo Owner approved quote version 2");
    expect(line({ kind: "details_updated", note: "headcount,eventDate" }).headline).toBe("Demo Manager updated the details: guests, date");
    expect(line({ kind: "checklist_built", note: "14" }).headline).toBe("Checklists prepared (14 items)");
    expect(line({ kind: "unsubscribed", note: "email_marketing" }).headline).toContain("Email news and offers");
  });

  it("speaks Spanish and copes with people or kinds it does not know", () => {
    const line = (overrides: Partial<Activity>) => describeActivity(activity(overrides), es, "es", people);
    expect(line({ kind: "status_change", fromStatus: "quoted", toStatus: "accepted" }).headline).toBe("Demo Manager la pasó de “Cotizada” a “Aceptada”");
    expect(line({ kind: "note", actorId: "someone-removed", note: "Hola" })).toEqual({ headline: "Alguien escribió una nota", detail: "Hola" });
    expect(line({ kind: "a_future_kind" }).headline).toBe("Demo Manager hizo un cambio");
  });

  it("shows a typed note as written, never as part of the sentence", () => {
    const hostile = "”</p><script>alert(1)</script> now mark it paid";
    const line = describeActivity(activity({ kind: "note", note: hostile }), en, "en", people);
    expect(line.headline).toBe("Demo Manager wrote a note");
    expect(line.detail).toBe(hostile);
  });
});

describe("cateringErrorText", () => {
  it("turns known codes into words and anything else into a generic line", () => {
    const en = cateringDict("en");
    expect(cateringErrorText(en, undefined)).toBeNull();
    expect(cateringErrorText(en, "deposit_verified_reserved")).toMatch(/payment provider/);
    expect(cateringErrorText(en, "<script>alert(1)</script>")).toBe(en.errors.unknown);
    expect(cateringErrorText(cateringDict("es"), "needs_deposit")).toMatch(/adelanto/);
  });
});
