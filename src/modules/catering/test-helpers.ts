import type { InquiryFormValues } from "./form-values";

/** A fixed "now" for tests: Tuesday 13 October 2026, 12:00 noon in Cooper City (EDT). */
export const NOW = new Date("2026-10-13T16:00:00Z");
export const TODAY = "2026-10-13";

/** A complete, valid website request. Override single fields to test one rule at a time. */
export function validForm(overrides: Partial<InquiryFormValues> = {}): Partial<InquiryFormValues> {
  return {
    name: "Test Person",
    email: "test.person@example.com",
    phone: "(954) 555-0100",
    preferredContact: "email",
    eventDate: "2026-11-20",
    eventTime: "12:30",
    headcount: "30",
    budget: "",
    fulfillment: "pickup",
    address: "",
    consentContact: true,
    consentNews: false,
    ...overrides,
  };
}

export const SAMPLE_LINES = [
  { description: "Test tray", quantity: 3, unitPriceCents: 45_50 },
  { description: "Test drinks", quantity: 30, unitPriceCents: 1_99 },
];
/** 3 × $45.50 + 30 × $1.99 = $136.50 + $59.70 = $196.20 */
export const SAMPLE_SUBTOTAL_CENTS = 196_20;
