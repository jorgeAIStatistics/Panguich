import { describe, expect, it } from "vitest";
import { checklistLabel, checklistProgress, mergeChecklist, planChecklist, purchasingDraft } from "./pack";
import { buildQuoteMessage, lineTotalCents, quoteSubtotalCents } from "./quote";
import { SAMPLE_LINES, SAMPLE_SUBTOTAL_CENTS } from "./test-helpers";

describe("quote arithmetic", () => {
  it("adds up in whole cents", () => {
    expect(lineTotalCents(SAMPLE_LINES[0])).toBe(136_50);
    expect(lineTotalCents(SAMPLE_LINES[1])).toBe(59_70);
    expect(quoteSubtotalCents(SAMPLE_LINES)).toBe(SAMPLE_SUBTOTAL_CENTS);
    // The classic floating-point trap: 3 x $0.10 must be exactly 30 cents.
    expect(quoteSubtotalCents([{ description: "Dime", quantity: 3, unitPriceCents: 10 }])).toBe(30);
    expect(quoteSubtotalCents([])).toBe(0);
  });

  it("refuses fractional cents or quantities instead of rounding", () => {
    expect(() => quoteSubtotalCents([{ description: "x", quantity: 1, unitPriceCents: 10.5 }])).toThrow();
    expect(() => quoteSubtotalCents([{ description: "x", quantity: 1.5, unitPriceCents: 10 }])).toThrow();
  });
});

describe("quote message", () => {
  const base = {
    restaurantName: "Panguich",
    restaurantPhone: "(954) 883-9366",
    restaurantAddress: "10215 Stirling Road, Cooper City, FL 33328",
    reference: "CAT-TEST22",
    contactName: "Ana",
    eventDate: "2026-11-01",
    eventTime: "12:30",
    headcount: 30,
    fulfillment: "delivery" as const,
    eventAddress: "1 Test Way",
    version: 2,
    lines: SAMPLE_LINES,
    notes: "Includes plates.",
    validUntil: "2026-10-25",
  };

  it("is written in English with the estimate wording", () => {
    const text = buildQuoteMessage({ ...base, locale: "en" });
    expect(text).toContain("Hi Ana,");
    expect(text).toContain("CAT-TEST22");
    expect(text).toContain("Sunday, November 1, 2026");
    expect(text).toContain("30 guests");
    expect(text).toContain("Delivery to 1 Test Way");
    expect(text).toContain("- 3 × Test tray: $45.50 each = $136.50");
    expect(text).toContain("Subtotal before tax and fees: $196.20");
    expect(text).toContain("This is an estimate, not a confirmed booking.");
    expect(text).toContain("(954) 883-9366");
    expect(text).not.toMatch(/\btax(es)?: \$/i);
  });

  it("is written in Spanish for a Spanish-speaking customer", () => {
    const text = buildQuoteMessage({ ...base, locale: "es", fulfillment: "pickup", eventAddress: null });
    expect(text).toContain("Hola Ana:");
    expect(text).toContain("domingo, 1 de noviembre de 2026");
    expect(text).toContain("30 personas");
    expect(text).toContain("Para recoger en el restaurante");
    expect(text).toContain("Subtotal antes de impuestos y cargos");
    expect(text).toContain("no una reserva confirmada");
  });
});

describe("fulfillment pack", () => {
  const facts = { fulfillment: "delivery" as const, dietaryNotes: "One guest is allergic to peanuts", lines: SAMPLE_LINES };

  it("makes one production item per quote line, plus packing and handoff lists", () => {
    const plan = planChecklist(facts);
    const of = (kind: string) => plan.filter((item) => item.kind === kind).map((item) => item.label);
    expect(of("production")).toEqual(["@production.dietary", "3 × Test tray", "30 × Test drinks"]);
    expect(of("packing")).toEqual([
      "@packing.count",
      "@packing.sauces",
      "@packing.sides",
      "@packing.utensils",
      "@packing.labels",
      "@packing.napkins",
      "@packing.dietary",
    ]);
    expect(of("handoff")).toEqual(["@handoff.contact", "@handoff.delivery_address_time", "@handoff.delivery_plan", "@handoff.reference"]);
    expect(plan.filter((item) => item.kind === "packing").map((item) => item.sortOrder)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("follows pickup or delivery and leaves out dietary items when there are no notes", () => {
    const pickup = planChecklist({ fulfillment: "pickup", dietaryNotes: null, lines: SAMPLE_LINES });
    const labels = pickup.map((item) => item.label);
    expect(labels).toContain("@handoff.pickup_time");
    expect(labels).toContain("@handoff.pickup_plan");
    expect(labels).not.toContain("@handoff.delivery_plan");
    expect(labels).not.toContain("@packing.dietary");
    expect(labels).not.toContain("@production.dietary");
    const undecided = planChecklist({ fulfillment: "undecided", dietaryNotes: "  ", lines: SAMPLE_LINES }).map((item) => item.label);
    expect(undecided).toContain("@handoff.decide_fulfillment");
  });

  it("is deterministic", () => {
    expect(planChecklist(facts)).toEqual(planChecklist(facts));
  });

  it("shows standard items in the reader's language and quote lines as written", () => {
    expect(checklistLabel("@packing.sauces", "en")).toBe("Sauces packed, lids tight");
    expect(checklistLabel("@packing.sauces", "es")).toContain("Salsas");
    expect(checklistLabel("3 × Test tray", "es")).toBe("3 × Test tray");
    // A quote line that happens to start with "@" is not mistaken for a standard item.
    expect(checklistLabel("@home delivery", "en")).toBe("@home delivery");
    for (const item of planChecklist(facts)) {
      expect(checklistLabel(item.label, "en")).not.toMatch(/^@/);
      expect(checklistLabel(item.label, "es")).not.toMatch(/^@/);
    }
  });

  it("keeps a tick through a rebuild only when the item is unchanged", () => {
    const doneAt = new Date("2026-10-13T12:00:00Z");
    const existing = [
      { kind: "production" as const, label: "3 × Test tray", done: true, doneBy: "demo-staff", doneAt },
      { kind: "packing" as const, label: "@packing.sauces", done: true, doneBy: "demo-staff", doneAt },
      { kind: "packing" as const, label: "@packing.sides", done: false, doneBy: null, doneAt: null },
    ];
    const changed = planChecklist({ ...facts, lines: [{ description: "Test tray", quantity: 4, unitPriceCents: 45_50 }] });
    const merged = mergeChecklist(existing, changed);
    const find = (label: string) => merged.find((item) => item.label === label);
    expect(find("4 × Test tray")).toMatchObject({ done: false, doneBy: null });
    expect(find("3 × Test tray")).toBeUndefined();
    expect(find("@packing.sauces")).toMatchObject({ done: true, doneBy: "demo-staff", doneAt });
    expect(find("@packing.sides")).toMatchObject({ done: false });
    expect(checklistProgress(merged)).toEqual({ total: merged.length, done: 1, open: merged.length - 1 });
  });

  it("lists purchasing as the quoted items only, without inventing amounts", () => {
    const draft = purchasingDraft([...SAMPLE_LINES, { description: "test tray", quantity: 9, unitPriceCents: 1 }]);
    expect(draft).toEqual(["Test tray", "Test drinks"]);
    expect(draft.join(" ")).not.toMatch(/\d/);
  });
});
