import { z } from "zod";
import type { FulfillmentType, InquirySource, QuoteLine } from "@/db/schema";
import { LOCALES, type Locale } from "@/lib/i18n";
import { parseUsdToCents } from "@/lib/money";
import { isClockTime, isIsoDate } from "@/lib/time";
import { addMonthsToIsoDate, MAX_MONTHS_AHEAD } from "./dates";
import { EMPTY_INQUIRY_VALUES, QUOTE_FORM_ROWS, type InquiryFormValues, type QuoteFormValues, type QuoteRowValues } from "./form-values";

export { EMPTY_INQUIRY_VALUES, emptyQuoteValues, QUOTE_FORM_ROWS } from "./form-values";
export type { InquiryFormValues, QuoteFormValues, QuoteRowValues } from "./form-values";

/**
 * Input rules for catering requests and quotes.
 *
 * Everything typed into a form is untrusted text: it is trimmed, length-capped, checked and
 * stored for display only. Error values are short codes; the words shown to people live in i18n.ts.
 */

export const LIMITS = {
  name: 120,
  email: 254,
  phone: 40,
  company: 120,
  address: 300,
  occasion: 120,
  dietary: 1000,
  message: 2000,
  note: 2000,
  reason: 500,
  depositNote: 500,
  quoteLineDescription: 200,
  quoteNotes: 1000,
  headcountMin: 1,
  headcountMax: 2000,
  /** Largest budget accepted, in cents ($1,000,000). Keeps the value inside a 32-bit column. */
  budgetMaxCents: 100_000_000,
  quoteLinesMax: 12,
  quoteQuantityMax: 100_000,
  /** Largest unit price accepted on a quote line, in cents ($100,000). */
  quoteUnitPriceMaxCents: 10_000_000,
  /** Largest quote subtotal, in cents ($20,000,000). Keeps the value inside a 32-bit column. */
  quoteSubtotalMaxCents: 2_000_000_000,
} as const;

/** Same shape the website tracking accepts for campaign codes. */
const CAMPAIGN_CODE = /^[A-Z0-9][A-Z0-9-]{1,31}$/;
/**
 * A plain mailbox@domain address. Characters that could smuggle extra parts into a mailto: link
 * (?, &, #, quotes, brackets, commas, slashes) are not accepted.
 */
const EMAIL = /^[^\s@?&#<>"`,;:()[\]\\/]+@[\p{L}\p{N}.-]+\.\p{L}{2,}$/u;

/** Removes control characters (keeps line breaks and tabs) and trims. */
export function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

/** Digits only; a leading US "1" on an 11-digit number is dropped so one phone has one key. */
export function phoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

// ---------------------------------------------------------------------------------------------
// Inquiry form
// ---------------------------------------------------------------------------------------------

export type InquiryField = Exclude<keyof InquiryFormValues, "consentNews">;

export type InquiryErrorCode =
  | "name_required"
  | "email_required"
  | "email_invalid"
  | "phone_required"
  | "phone_invalid"
  | "preferred_invalid"
  | "date_invalid"
  | "date_past"
  | "date_too_far"
  | "time_invalid"
  | "headcount_invalid"
  | "headcount_range"
  | "budget_invalid"
  | "budget_too_large"
  | "fulfillment_invalid"
  | "address_required"
  | "source_invalid"
  | "consent_required"
  | "too_long";

export type InquiryFieldErrors = Partial<Record<InquiryField, InquiryErrorCode>>;

/** A validated request, ready to store. */
export type InquiryInput = {
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  preferredContact: "email" | "phone";
  company: string | null;
  eventDate: string;
  eventTime: string | null;
  headcount: number;
  budgetCents: number | null;
  fulfillment: FulfillmentType;
  eventAddress: string | null;
  occasion: string | null;
  dietaryNotes: string | null;
  message: string | null;
  consentContact: boolean;
  consentNews: boolean;
};

/**
 * Who is filling the form: a website visitor ("public"), the team entering a phone / walk-in
 * request ("staff"), or the team correcting a saved request ("edit": source and consent are
 * not asked again).
 */
export type InquiryMode = "public" | "staff" | "edit";

/** Sources the team can choose when they enter a request by hand. */
export const STAFF_SOURCES = ["phone", "walk_in", "email", "referral"] as const satisfies readonly InquirySource[];
export type StaffSource = (typeof STAFF_SOURCES)[number];

export function isStaffSource(value: string): value is StaffSource {
  return (STAFF_SOURCES as readonly string[]).includes(value);
}

function capped(max: number) {
  return z.string().max(max, "too_long");
}

const shape = z.object({
  name: capped(LIMITS.name).min(1, "name_required"),
  email: capped(LIMITS.email),
  phone: capped(LIMITS.phone),
  preferredContact: z.string(),
  company: capped(LIMITS.company),
  eventDate: z.string(),
  eventTime: z.string(),
  headcount: z.string(),
  budget: z.string(),
  fulfillment: z.string(),
  address: capped(LIMITS.address),
  occasion: capped(LIMITS.occasion),
  dietary: capped(LIMITS.dietary),
  message: capped(LIMITS.message),
  source: z.string(),
  consentContact: z.boolean(),
  consentNews: z.boolean(),
});

export type InquiryRules = {
  /** Today's calendar date in Cooper City (`businessDateString(now)`). */
  today: string;
  mode: InquiryMode;
  /**
   * When editing a saved request, its current event date. An unchanged date is accepted even
   * if it has passed, so a past event can still have its other details corrected.
   */
  unchangedEventDate?: string;
};

function inquirySchema(rules: InquiryRules) {
  return shape.superRefine((v, ctx) => {
    const issue = (field: InquiryField, code: InquiryErrorCode) =>
      ctx.addIssue({ code: "custom", path: [field], message: code });

    if (v.preferredContact !== "email" && v.preferredContact !== "phone") issue("preferredContact", "preferred_invalid");

    if (v.email === "") {
      if (v.preferredContact === "email") issue("email", "email_required");
    } else if (!EMAIL.test(v.email)) {
      issue("email", "email_invalid");
    }

    if (v.phone === "") {
      if (v.preferredContact === "phone") issue("phone", "phone_required");
    } else {
      const digits = v.phone.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 15 || !/^[\d\s()+.\-x]+$/i.test(v.phone)) issue("phone", "phone_invalid");
    }

    if (!isIsoDate(v.eventDate)) {
      issue("eventDate", "date_invalid");
    } else if (v.eventDate !== rules.unchangedEventDate) {
      if (v.eventDate < rules.today) issue("eventDate", "date_past");
      else if (v.eventDate > addMonthsToIsoDate(rules.today, MAX_MONTHS_AHEAD)) issue("eventDate", "date_too_far");
    }

    if (v.eventTime !== "" && !isClockTime(v.eventTime)) issue("eventTime", "time_invalid");

    if (!/^\d{1,6}$/.test(v.headcount)) {
      issue("headcount", "headcount_invalid");
    } else {
      const n = Number(v.headcount);
      if (n < LIMITS.headcountMin || n > LIMITS.headcountMax) issue("headcount", "headcount_range");
    }

    if (v.budget !== "") {
      const cents = parseUsdToCents(v.budget);
      if (cents === null || cents <= 0) issue("budget", "budget_invalid");
      else if (cents > LIMITS.budgetMaxCents) issue("budget", "budget_too_large");
    }

    if (v.fulfillment !== "pickup" && v.fulfillment !== "delivery" && v.fulfillment !== "undecided") {
      issue("fulfillment", "fulfillment_invalid");
    } else if (v.fulfillment === "delivery" && v.address === "") {
      issue("address", "address_required");
    }

    if (rules.mode === "staff" && !isStaffSource(v.source)) issue("source", "source_invalid");
    // A website visitor must agree to be contacted about the request. Without it nothing is stored.
    if (rules.mode === "public" && !v.consentContact) issue("consentContact", "consent_required");
  });
}

/** Reads the request fields out of a submitted form, cleaned but otherwise exactly as typed. */
export function readInquiryForm(form: FormData): InquiryFormValues {
  const text = (name: string, max: number) => cleanText(form.get(name)).slice(0, max * 2);
  return {
    name: text("name", LIMITS.name),
    email: text("email", LIMITS.email),
    phone: text("phone", LIMITS.phone),
    preferredContact: text("preferredContact", 10),
    company: text("company", LIMITS.company),
    eventDate: text("eventDate", 10),
    eventTime: text("eventTime", 5),
    headcount: text("headcount", 10),
    budget: text("budget", 20),
    fulfillment: text("fulfillment", 10),
    address: text("address", LIMITS.address),
    occasion: text("occasion", LIMITS.occasion),
    dietary: text("dietary", LIMITS.dietary),
    message: text("message", LIMITS.message),
    source: text("source", 10),
    consentContact: form.get("consentContact") === "yes",
    consentNews: form.get("consentNews") === "yes",
  };
}

export type InquiryValidation =
  | { ok: true; value: InquiryInput }
  | { ok: false; errors: InquiryFieldErrors };

/** Checks a request against every rule. Pure: the caller supplies today's date. */
export function validateInquiry(raw: Partial<InquiryFormValues>, rules: InquiryRules): InquiryValidation {
  const values: InquiryFormValues = {
    ...EMPTY_INQUIRY_VALUES,
    ...Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [key, typeof value === "boolean" ? value : cleanText(value)]),
    ),
  };
  const parsed = inquirySchema(rules).safeParse(values);
  if (!parsed.success) {
    const errors: InquiryFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as InquiryField | undefined;
      if (field && !errors[field]) errors[field] = issue.message as InquiryErrorCode;
    }
    return { ok: false, errors };
  }
  const v = parsed.data;
  return {
    ok: true,
    value: {
      contactName: v.name,
      contactEmail: v.email || null,
      contactPhone: v.phone || null,
      preferredContact: v.preferredContact as "email" | "phone",
      company: v.company || null,
      eventDate: v.eventDate,
      eventTime: v.eventTime || null,
      headcount: Number(v.headcount),
      budgetCents: v.budget === "" ? null : parseUsdToCents(v.budget),
      fulfillment: v.fulfillment as FulfillmentType,
      eventAddress: v.address || null,
      occasion: v.occasion || null,
      dietaryNotes: v.dietary || null,
      message: v.message || null,
      consentContact: v.consentContact,
      // News by email only means something when there is an email address to send it to.
      consentNews: v.consentNews && v.email !== "",
    },
  };
}

export function toLocaleOrDefault(value: unknown): Locale {
  return (LOCALES as readonly string[]).includes(String(value)) ? (value as Locale) : "en";
}

/** A campaign code is optional; anything that is not a well-formed code is quietly dropped. */
export function cleanCampaignCode(value: unknown): string | undefined {
  const code = cleanText(value).toUpperCase();
  return CAMPAIGN_CODE.test(code) ? code : undefined;
}

// ---------------------------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------------------------

export type QuoteErrorCode =
  | "line_description_required"
  | "line_quantity_invalid"
  | "line_price_invalid"
  | "line_too_long"
  | "lines_required"
  | "too_many_lines"
  | "subtotal_too_large"
  | "notes_too_long"
  | "valid_until_invalid"
  | "valid_until_past";

export type QuoteFormErrors = {
  /** One entry per form row (index = row number), when that row has a problem. */
  rows?: Record<number, QuoteErrorCode>;
  form?: QuoteErrorCode;
  notes?: QuoteErrorCode;
  validUntil?: QuoteErrorCode;
};

export type QuoteInput = { lines: QuoteLine[]; notes: string | null; validUntil: string | null };

export function readQuoteForm(form: FormData): QuoteFormValues {
  const rows: QuoteRowValues[] = [];
  for (let i = 0; i < QUOTE_FORM_ROWS; i += 1) {
    rows.push({
      description: cleanText(form.get(`description_${i}`)).slice(0, LIMITS.quoteLineDescription * 2),
      quantity: cleanText(form.get(`quantity_${i}`)).slice(0, 12),
      price: cleanText(form.get(`price_${i}`)).slice(0, 20),
    });
  }
  return {
    rows,
    notes: cleanText(form.get("notes")).slice(0, LIMITS.quoteNotes * 2),
    validUntil: cleanText(form.get("validUntil")).slice(0, 10),
  };
}

export const quoteLineSchema = z.object({
  description: z.string().min(1, "line_description_required").max(LIMITS.quoteLineDescription, "line_too_long"),
  quantity: z.number().int("line_quantity_invalid").min(1, "line_quantity_invalid").max(LIMITS.quoteQuantityMax, "line_quantity_invalid"),
  unitPriceCents: z
    .number()
    .int("line_price_invalid")
    .min(0, "line_price_invalid")
    .max(LIMITS.quoteUnitPriceMaxCents, "line_price_invalid"),
});

export type QuoteValidation = { ok: true; value: QuoteInput } | { ok: false; errors: QuoteFormErrors };

/**
 * Turns the typed quote rows into lines. Completely empty rows are skipped; a partly filled
 * row is an error on that row rather than a silent guess.
 */
export function validateQuoteForm(values: QuoteFormValues, rules: { today: string }): QuoteValidation {
  const errors: QuoteFormErrors = {};
  const rowErrors: Record<number, QuoteErrorCode> = {};
  const lines: QuoteLine[] = [];

  values.rows.forEach((row, index) => {
    const description = cleanText(row.description);
    const quantity = cleanText(row.quantity);
    const price = cleanText(row.price);
    if (description === "" && quantity === "" && price === "") return;

    const cents = parseUsdToCents(price);
    const candidate = {
      description,
      quantity: /^\d{1,7}$/.test(quantity) ? Number(quantity) : Number.NaN,
      unitPriceCents: cents ?? Number.NaN,
    };
    const parsed = quoteLineSchema.safeParse(candidate);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const field = first?.path[0];
      rowErrors[index] =
        field === "description"
          ? (first.message as QuoteErrorCode)
          : field === "quantity"
            ? "line_quantity_invalid"
            : "line_price_invalid";
      return;
    }
    lines.push(parsed.data);
  });

  if (Object.keys(rowErrors).length > 0) errors.rows = rowErrors;
  if (lines.length === 0 && !errors.rows) errors.form = "lines_required";
  if (lines.length > LIMITS.quoteLinesMax) errors.form = "too_many_lines";

  const notes = cleanText(values.notes);
  if (notes.length > LIMITS.quoteNotes) errors.notes = "notes_too_long";

  const validUntil = cleanText(values.validUntil);
  if (validUntil !== "") {
    if (!isIsoDate(validUntil)) errors.validUntil = "valid_until_invalid";
    else if (validUntil < rules.today) errors.validUntil = "valid_until_past";
  }

  if (!errors.rows && !errors.form) {
    // Each product is an exact integer far below 2^53, so the sum is exact.
    const subtotal = lines.reduce((total, line) => total + line.unitPriceCents * line.quantity, 0);
    if (subtotal > LIMITS.quoteSubtotalMaxCents) errors.form = "subtotal_too_large";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { lines, notes: notes || null, validUntil: validUntil || null } };
}

/** Checks quote lines that arrive as data (not from the form), e.g. from the sample-data seed. */
export function validateQuoteLines(lines: unknown): { ok: true; value: QuoteLine[] } | { ok: false; code: QuoteErrorCode } {
  const parsed = z.array(quoteLineSchema).min(1, "lines_required").max(LIMITS.quoteLinesMax, "too_many_lines").safeParse(lines);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "lines_required";
    return { ok: false, code: message as QuoteErrorCode };
  }
  const cleaned = parsed.data.map((line) => ({ ...line, description: cleanText(line.description) }));
  if (cleaned.some((line) => line.description === "")) return { ok: false, code: "line_description_required" };
  const subtotal = cleaned.reduce((total, line) => total + line.unitPriceCents * line.quantity, 0);
  if (subtotal > LIMITS.quoteSubtotalMaxCents) return { ok: false, code: "subtotal_too_large" };
  return { ok: true, value: cleaned };
}
