import { describe, expect, it } from "vitest";
import { businessDateString } from "@/lib/time";
import { addMonthsToIsoDate } from "./dates";
import { emptyQuoteValues } from "./form-values";
import { cleanCampaignCode, cleanText, phoneDigits, readInquiryForm, validateInquiry, validateQuoteForm, validateQuoteLines } from "./schema";
import { TODAY, validForm } from "./test-helpers";

const rules = { today: TODAY, mode: "public" } as const;

function errorsOf(overrides: Parameters<typeof validForm>[0], mode: "public" | "staff" | "edit" = "public") {
  const result = validateInquiry(validForm(overrides), { today: TODAY, mode });
  return result.ok ? {} : result.errors;
}

describe("validateInquiry", () => {
  it("accepts a complete request and normalizes it", () => {
    const result = validateInquiry(validForm({ name: "  Ana  ", budget: "$1,250.50", headcount: "45" }), rules);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      contactName: "Ana",
      contactEmail: "test.person@example.com",
      preferredContact: "email",
      eventDate: "2026-11-20",
      eventTime: "12:30",
      headcount: 45,
      budgetCents: 125_050,
      fulfillment: "pickup",
      eventAddress: null,
      consentContact: true,
      consentNews: false,
    });
  });

  it("requires a name", () => {
    expect(errorsOf({ name: "   " }).name).toBe("name_required");
  });

  it("requires the contact method the person prefers", () => {
    expect(errorsOf({ preferredContact: "email", email: "" }).email).toBe("email_required");
    expect(errorsOf({ preferredContact: "phone", phone: "" }).phone).toBe("phone_required");
    // The other method stays optional.
    expect(errorsOf({ preferredContact: "phone", email: "" })).toEqual({});
    expect(errorsOf({ preferredContact: "email", phone: "" })).toEqual({});
  });

  it("rejects malformed contact details", () => {
    expect(errorsOf({ email: "not-an-email" }).email).toBe("email_invalid");
    expect(errorsOf({ phone: "12345" }).phone).toBe("phone_invalid");
    expect(errorsOf({ phone: "call me maybe" }).phone).toBe("phone_invalid");
    expect(errorsOf({ preferredContact: "pigeon" }).preferredContact).toBe("preferred_invalid");
  });

  it("rejects a date in the past, an impossible date, and a date more than 18 months ahead", () => {
    expect(errorsOf({ eventDate: "2026-10-12" }).eventDate).toBe("date_past");
    expect(errorsOf({ eventDate: "2026-02-30" }).eventDate).toBe("date_invalid");
    expect(errorsOf({ eventDate: "10/20/2026" }).eventDate).toBe("date_invalid");
    expect(errorsOf({ eventDate: "" }).eventDate).toBe("date_invalid");
    expect(errorsOf({ eventDate: "2028-04-14" }).eventDate).toBe("date_too_far");
  });

  it("accepts today and the last day of the 18-month window", () => {
    expect(errorsOf({ eventDate: TODAY })).toEqual({});
    expect(addMonthsToIsoDate(TODAY, 18)).toBe("2028-04-13");
    expect(errorsOf({ eventDate: "2028-04-13" })).toEqual({});
  });

  it("checks the optional time", () => {
    expect(errorsOf({ eventTime: "" })).toEqual({});
    expect(errorsOf({ eventTime: "25:00" }).eventTime).toBe("time_invalid");
    expect(errorsOf({ eventTime: "7pm" }).eventTime).toBe("time_invalid");
  });

  it("keeps headcount a whole number from 1 to 2000", () => {
    expect(errorsOf({ headcount: "0" }).headcount).toBe("headcount_range");
    expect(errorsOf({ headcount: "2001" }).headcount).toBe("headcount_range");
    expect(errorsOf({ headcount: "12.5" }).headcount).toBe("headcount_invalid");
    expect(errorsOf({ headcount: "-4" }).headcount).toBe("headcount_invalid");
    expect(errorsOf({ headcount: "many" }).headcount).toBe("headcount_invalid");
    expect(errorsOf({ headcount: "" }).headcount).toBe("headcount_invalid");
    expect(errorsOf({ headcount: "1" })).toEqual({});
    expect(errorsOf({ headcount: "2000" })).toEqual({});
  });

  it("parses the optional budget strictly, in cents", () => {
    expect(errorsOf({ budget: "about 500" }).budget).toBe("budget_invalid");
    expect(errorsOf({ budget: "0" }).budget).toBe("budget_invalid");
    expect(errorsOf({ budget: "1000000.01" }).budget).toBe("budget_too_large");
    const result = validateInquiry(validForm({ budget: "18.5" }), rules);
    expect(result.ok && result.value.budgetCents).toBe(1850);
    const none = validateInquiry(validForm({ budget: "" }), rules);
    expect(none.ok && none.value.budgetCents).toBeNull();
  });

  it("requires an address for delivery only", () => {
    expect(errorsOf({ fulfillment: "delivery", address: "" }).address).toBe("address_required");
    expect(errorsOf({ fulfillment: "delivery", address: "1 Test Way, Cooper City, FL 33328" })).toEqual({});
    expect(errorsOf({ fulfillment: "undecided", address: "" })).toEqual({});
    expect(errorsOf({ fulfillment: "teleport" }).fulfillment).toBe("fulfillment_invalid");
  });

  it("caps the length of every text field", () => {
    expect(errorsOf({ name: "n".repeat(121) }).name).toBe("too_long");
    expect(errorsOf({ company: "c".repeat(121) }).company).toBe("too_long");
    expect(errorsOf({ address: "a".repeat(301) }).address).toBe("too_long");
    expect(errorsOf({ occasion: "o".repeat(121) }).occasion).toBe("too_long");
    expect(errorsOf({ dietary: "d".repeat(1001) }).dietary).toBe("too_long");
    expect(errorsOf({ message: "m".repeat(2001) }).message).toBe("too_long");
    expect(errorsOf({ message: "m".repeat(2000) })).toEqual({});
  });

  it("refuses a website request without the contact permission", () => {
    expect(errorsOf({ consentContact: false }).consentContact).toBe("consent_required");
  });

  it("only counts the news permission when there is an email to send news to", () => {
    const withEmail = validateInquiry(validForm({ consentNews: true }), rules);
    expect(withEmail.ok && withEmail.value.consentNews).toBe(true);
    const phoneOnly = validateInquiry(validForm({ consentNews: true, email: "", preferredContact: "phone" }), rules);
    expect(phoneOnly.ok && phoneOnly.value.consentNews).toBe(false);
  });

  it("team entries need a source but no permission box", () => {
    expect(errorsOf({ consentContact: false, source: "phone" }, "staff")).toEqual({});
    expect(errorsOf({ consentContact: false, source: "website" }, "staff").source).toBe("source_invalid");
    expect(errorsOf({ consentContact: false, source: "sample" }, "staff").source).toBe("source_invalid");
  });

  it("when editing, an unchanged past date is kept but a new past date is refused", () => {
    const base = validForm({ consentContact: false, eventDate: "2026-10-01" });
    expect(validateInquiry(base, { today: TODAY, mode: "edit", unchangedEventDate: "2026-10-01" }).ok).toBe(true);
    const moved = validateInquiry({ ...base, eventDate: "2026-10-02" }, { today: TODAY, mode: "edit", unchangedEventDate: "2026-10-01" });
    expect(!moved.ok && moved.errors.eventDate).toBe("date_past");
  });
});

describe("daylight-saving boundaries", () => {
  // Clocks fall back at 2:00 AM on Sunday 1 November 2026 in Cooper City.
  it("treats 2026-11-01 as a plain calendar date on either side of the change", () => {
    const justAfterMidnight = new Date("2026-11-01T04:30:00Z"); // 00:30 EDT, Nov 1
    const lateEvening = new Date("2026-11-02T04:30:00Z"); // 23:30 EST, still Nov 1
    const nextDay = new Date("2026-11-02T05:30:00Z"); // 00:30 EST, Nov 2
    expect(businessDateString(justAfterMidnight)).toBe("2026-11-01");
    expect(businessDateString(lateEvening)).toBe("2026-11-01");
    expect(businessDateString(nextDay)).toBe("2026-11-02");

    const on = (now: Date) => validateInquiry(validForm({ eventDate: "2026-11-01" }), { today: businessDateString(now), mode: "public" });
    expect(on(justAfterMidnight).ok).toBe(true);
    expect(on(lateEvening).ok).toBe(true);
    const tooLate = on(nextDay);
    expect(!tooLate.ok && tooLate.errors.eventDate).toBe("date_past");
  });

  it("accepts the spring-forward day and keeps the 2:30 AM that does not exist as typed", () => {
    const result = validateInquiry(validForm({ eventDate: "2027-03-14", eventTime: "02:30" }), rules);
    expect(result.ok && result.value.eventDate).toBe("2027-03-14");
    expect(result.ok && result.value.eventTime).toBe("02:30");
  });

  it("adds months on the calendar, clamping to the end of the month", () => {
    expect(addMonthsToIsoDate("2026-08-31", 6)).toBe("2027-02-28");
    expect(addMonthsToIsoDate("2026-08-31", 18)).toBe("2028-02-29");
    expect(addMonthsToIsoDate("2026-11-01", 18)).toBe("2028-05-01");
    expect(addMonthsToIsoDate("2026-12-15", 1)).toBe("2027-01-15");
  });
});

describe("form reading and cleaning", () => {
  it("reads only strings, trims them, and reads the boxes as booleans", () => {
    const form = new FormData();
    form.set("name", "  Ana\u0000 ");
    form.set("headcount", " 20 ");
    form.set("consentContact", "yes");
    form.set("consentNews", "on");
    form.set("message", new Blob(["x"]) as unknown as string);
    const values = readInquiryForm(form);
    expect(values.name).toBe("Ana");
    expect(values.headcount).toBe("20");
    expect(values.consentContact).toBe(true);
    // Only the exact value the form sends counts as a tick.
    expect(values.consentNews).toBe(false);
    expect(values.message).toBe("");
  });

  it("normalizes phone numbers and campaign codes", () => {
    expect(phoneDigits("+1 (954) 555-0100")).toBe("9545550100");
    expect(phoneDigits("954.555.0100")).toBe("9545550100");
    expect(cleanCampaignCode("lunch-01")).toBe("LUNCH-01");
    expect(cleanCampaignCode("<script>")).toBeUndefined();
    expect(cleanCampaignCode(null)).toBeUndefined();
    expect(cleanText("a\r\nb")).toBe("a\nb");
  });
});

describe("validateQuoteForm", () => {
  const filled = (rows: Array<[string, string, string]>) => {
    const values = emptyQuoteValues();
    rows.forEach(([description, quantity, price], index) => {
      values.rows[index] = { description, quantity, price };
    });
    return values;
  };

  it("turns typed rows into lines in integer cents and skips empty rows", () => {
    const values = filled([
      ["Tray", "3", "45.50"],
      ["", "", ""],
      ["Drinks", "30", "$1.99"],
    ]);
    const result = validateQuoteForm(values, { today: TODAY });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lines).toEqual([
      { description: "Tray", quantity: 3, unitPriceCents: 4550 },
      { description: "Drinks", quantity: 30, unitPriceCents: 199 },
    ]);
  });

  it("flags the exact row that is wrong instead of guessing", () => {
    const result = validateQuoteForm(
      filled([
        ["Tray", "0", "10"],
        ["", "2", "10"],
        ["Sides", "2", "ten"],
        ["Free delivery", "1", "0"],
        ["Half", "1.5", "10"],
      ]),
      { today: TODAY },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.rows).toEqual({
      0: "line_quantity_invalid",
      1: "line_description_required",
      2: "line_price_invalid",
      4: "line_quantity_invalid",
    });
  });

  it("needs at least one line and a sensible valid-until date", () => {
    const empty = validateQuoteForm(emptyQuoteValues(), { today: TODAY });
    expect(!empty.ok && empty.errors.form).toBe("lines_required");
    const past = validateQuoteForm({ ...filled([["Tray", "1", "10"]]), validUntil: "2026-10-01" }, { today: TODAY });
    expect(!past.ok && past.errors.validUntil).toBe("valid_until_past");
    const bad = validateQuoteForm({ ...filled([["Tray", "1", "10"]]), validUntil: "soon" }, { today: TODAY });
    expect(!bad.ok && bad.errors.validUntil).toBe("valid_until_invalid");
  });

  it("refuses a total too large to store", () => {
    const result = validateQuoteForm(filled([["Everything", "100000", "100000"]]), { today: TODAY });
    expect(!result.ok && result.errors.form).toBe("subtotal_too_large");
  });
});

describe("validateQuoteLines", () => {
  it("accepts whole quantities and whole cents only", () => {
    expect(validateQuoteLines([{ description: "Tray", quantity: 2, unitPriceCents: 1000 }]).ok).toBe(true);
    expect(validateQuoteLines([{ description: "Tray", quantity: 2.5, unitPriceCents: 1000 }])).toEqual({ ok: false, code: "line_quantity_invalid" });
    expect(validateQuoteLines([{ description: "Tray", quantity: 2, unitPriceCents: 10.5 }])).toEqual({ ok: false, code: "line_price_invalid" });
    expect(validateQuoteLines([{ description: "Tray", quantity: 2, unitPriceCents: -1 }])).toEqual({ ok: false, code: "line_price_invalid" });
    expect(validateQuoteLines([{ description: "  ", quantity: 2, unitPriceCents: 1 }])).toEqual({ ok: false, code: "line_description_required" });
    expect(validateQuoteLines([])).toEqual({ ok: false, code: "lines_required" });
    expect(validateQuoteLines("not lines").ok).toBe(false);
  });
});

describe("email addresses", () => {
  const emailError = (email: string) => {
    const result = validateInquiry(validForm({ email }), rules);
    return result.ok ? null : (result.errors.email ?? null);
  };

  it("accepts ordinary addresses", () => {
    for (const email of ["ana@example.com", "Ana.Perez+catering@Example.co", "o'brien_1@mail.example.org", "josé@correo.example"]) {
      expect(emailError(email), email).toBeNull();
    }
  });

  it("refuses anything that could add extra parts to a mail link", () => {
    for (const email of [
      "ana@example.com?subject=Refund&body=Send%20money",
      "ana@example.com&cc=x",
      "ana@example.com,other@example.com",
      "<ana@example.com>",
      "ana@example",
      "ana@@example.com",
      "ana example@example.com",
      "javascript:alert(1)@example.com",
    ]) {
      expect(emailError(email), email).toBe("email_invalid");
    }
  });
});
