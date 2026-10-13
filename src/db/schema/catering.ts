import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import type { Locale } from "@/lib/i18n";
import { users } from "./core";

const tz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/**
 * Pipeline: new -> needs_details -> quoted -> accepted -> confirmed -> fulfilled -> follow_up,
 * with canceled / lost as exits. Deposit/payment is tracked beside the stage, and an inquiry
 * cannot be confirmed until the deposit condition is met (see modules/catering).
 */
export const CATERING_STATUSES = [
  "new",
  "needs_details",
  "quoted",
  "accepted",
  "confirmed",
  "fulfilled",
  "follow_up",
  "canceled",
  "lost",
] as const;
export type CateringStatus = (typeof CATERING_STATUSES)[number];

/**
 * recorded_unverified = someone at the restaurant says a deposit was received; no payment
 * provider has confirmed it. "verified" is reserved for a real provider signal (not available yet).
 */
export const DEPOSIT_STATUSES = ["not_requested", "requested", "recorded_unverified", "verified", "waived"] as const;
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number];

export const FULFILLMENT_TYPES = ["pickup", "delivery", "undecided"] as const;
export type FulfillmentType = (typeof FULFILLMENT_TYPES)[number];

export const INQUIRY_SOURCES = ["website", "phone", "walk_in", "email", "referral", "sample"] as const;
export type InquirySource = (typeof INQUIRY_SOURCES)[number];

export const cateringInquiries = pgTable(
  "catering_inquiries",
  {
    id: text("id").primaryKey(),
    /** Human-friendly reference shown to the customer, e.g. CAT-7F3K2A. */
    reference: text("reference").notNull().unique(),
    createdAt: tz("created_at").notNull().defaultNow(),
    updatedAt: tz("updated_at").notNull().defaultNow(),
    status: text("status").$type<CateringStatus>().notNull().default("new"),

    contactName: text("contact_name").notNull(),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    preferredContact: text("preferred_contact").$type<"email" | "phone">().notNull().default("email"),
    company: text("company"),

    eventDate: date("event_date", { mode: "string" }).notNull(),
    /** Cooper City wall-clock time, "HH:MM". */
    eventTime: text("event_time"),
    headcount: integer("headcount").notNull(),
    budgetCents: integer("budget_cents"),
    fulfillment: text("fulfillment").$type<FulfillmentType>().notNull().default("undecided"),
    eventAddress: text("event_address"),
    occasion: text("occasion"),
    dietaryNotes: text("dietary_notes"),
    message: text("message"),

    source: text("source").$type<InquirySource>().notNull().default("website"),
    campaignCode: text("campaign_code"),
    locale: text("locale").$type<Locale>().notNull().default("en"),

    assigneeId: text("assignee_id").references(() => users.id),
    followUpOn: date("follow_up_on", { mode: "string" }),
    depositStatus: text("deposit_status").$type<DepositStatus>().notNull().default("not_requested"),
    depositNote: text("deposit_note"),
    closedReason: text("closed_reason"),

    /** Sample rows created for the demonstration. Always labeled in the interface. */
    isSynthetic: boolean("is_synthetic").notNull().default(false),
  },
  (t) => [index("catering_status_idx").on(t.status), index("catering_event_date_idx").on(t.eventDate)],
);

/** Consent is recorded per channel. One kind of consent never implies another. */
export const CONSENT_CHANNELS = ["transactional_contact", "email_marketing", "sms_marketing"] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

export const consentRecords = pgTable(
  "consent_records",
  {
    id: text("id").primaryKey(),
    inquiryId: text("inquiry_id").references(() => cateringInquiries.id, { onDelete: "cascade" }),
    /** Lower-cased email or digits-only phone the consent applies to. */
    contactKey: text("contact_key").notNull(),
    channel: text("channel").$type<ConsentChannel>().notNull(),
    granted: boolean("granted").notNull(),
    /** Exact wording the person saw, and its version, kept as evidence. */
    disclosureVersion: text("disclosure_version").notNull(),
    disclosureText: text("disclosure_text").notNull(),
    source: text("source").notNull(),
    locale: text("locale").$type<Locale>().notNull(),
    capturedAt: tz("captured_at").notNull().defaultNow(),
    /** Set when the person unsubscribes / replies STOP. A suppressed contact is never messaged. */
    suppressedAt: tz("suppressed_at"),
  },
  (t) => [index("consent_contact_idx").on(t.contactKey, t.channel)],
);

export type QuoteLine = { description: string; quantity: number; unitPriceCents: number };
export const QUOTE_STATUSES = ["draft", "approved", "superseded"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/** A quote is an estimate, never a booking. Each change creates a new version. */
export const cateringQuotes = pgTable(
  "catering_quotes",
  {
    id: text("id").primaryKey(),
    inquiryId: text("inquiry_id")
      .notNull()
      .references(() => cateringInquiries.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status").$type<QuoteStatus>().notNull().default("draft"),
    lines: jsonb("lines").$type<QuoteLine[]>().notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    notes: text("notes"),
    validUntil: date("valid_until", { mode: "string" }),
    createdAt: tz("created_at").notNull().defaultNow(),
    createdBy: text("created_by").references(() => users.id),
    approvedAt: tz("approved_at"),
    approvedBy: text("approved_by").references(() => users.id),
  },
  (t) => [unique("catering_quote_version_uq").on(t.inquiryId, t.version)],
);

export const cateringActivities = pgTable(
  "catering_activities",
  {
    id: text("id").primaryKey(),
    inquiryId: text("inquiry_id")
      .notNull()
      .references(() => cateringInquiries.id, { onDelete: "cascade" }),
    at: tz("at").notNull().defaultNow(),
    actorId: text("actor_id"),
    kind: text("kind").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    note: text("note"),
  },
  (t) => [index("catering_activity_idx").on(t.inquiryId, t.at)],
);

export const CHECKLIST_KINDS = ["production", "packing", "handoff"] as const;
export type ChecklistKind = (typeof CHECKLIST_KINDS)[number];

export const cateringChecklistItems = pgTable(
  "catering_checklist_items",
  {
    id: text("id").primaryKey(),
    inquiryId: text("inquiry_id")
      .notNull()
      .references(() => cateringInquiries.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ChecklistKind>().notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    done: boolean("done").notNull().default(false),
    doneBy: text("done_by"),
    doneAt: tz("done_at"),
  },
  (t) => [index("catering_checklist_idx").on(t.inquiryId, t.kind, t.sortOrder)],
);
