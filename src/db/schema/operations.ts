import { boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import type { Bilingual } from "@/lib/i18n";

const tz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const suppliers = pgTable("suppliers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Sample supplier invented for the demonstration. Always labeled in the interface. */
  isSynthetic: boolean("is_synthetic").notNull().default(false),
});

/** One import run. Importing the same file twice must not create duplicate invoices. */
export const importBatches = pgTable("import_batches", {
  id: text("id").primaryKey(),
  importedAt: tz("imported_at").notNull().defaultNow(),
  importedBy: text("imported_by"),
  sourceLabel: text("source_label").notNull(),
  /** Hash of the raw file contents, for duplicate-import detection. */
  contentHash: text("content_hash").notNull().unique(),
  isSynthetic: boolean("is_synthetic").notNull().default(false),
});

export const supplierInvoices = pgTable(
  "supplier_invoices",
  {
    id: text("id").primaryKey(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    importBatchId: text("import_batch_id").references(() => importBatches.id),
    invoiceNumber: text("invoice_number").notNull(),
    invoiceDate: date("invoice_date", { mode: "string" }).notNull(),
    totalCents: integer("total_cents").notNull(),
    /** Where the record came from (file name, page). */
    sourceDocument: text("source_document").notNull(),
    /** The untouched text of the document. Treated strictly as data, never as instructions. */
    rawText: text("raw_text").notNull(),
    isSynthetic: boolean("is_synthetic").notNull().default(false),
  },
  (t) => [index("invoice_supplier_idx").on(t.supplierId, t.invoiceDate)],
);

export const PACK_UNITS = ["lb", "oz", "kg", "g", "gal", "qt", "l", "each"] as const;
export type PackUnit = (typeof PACK_UNITS)[number];

export const supplierInvoiceLines = pgTable(
  "supplier_invoice_lines",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => supplierInvoices.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    rawDescription: text("raw_description").notNull(),
    /** Stable key for "the same product" across invoices, e.g. "pork-shoulder". */
    productKey: text("product_key").notNull(),
    /** Cases (or packs) billed. Negative on a credit line. */
    quantity: integer("quantity").notNull(),
    /** Units per case, e.g. 4 bags per case. */
    packCount: integer("pack_count").notNull().default(1),
    /** Size of each unit, e.g. 10 (lb). Stored as an exact decimal string. */
    packSize: numeric("pack_size", { precision: 12, scale: 3 }).notNull(),
    packUnit: text("pack_unit").$type<PackUnit>().notNull(),
    /** Price per case in cents. */
    casePriceCents: integer("case_price_cents").notNull(),
    extendedCents: integer("extended_cents").notNull(),
    isCredit: boolean("is_credit").notNull().default(false),
    /** 0-1 confidence from extraction; null when typed in or read from a clean digital file. */
    extractionConfidence: numeric("extraction_confidence", { precision: 4, scale: 3 }),
  },
  (t) => [unique("invoice_line_uq").on(t.invoiceId, t.lineNo), index("invoice_line_product_idx").on(t.productKey)],
);

export const EXCEPTION_KINDS = ["unit_price_increase", "possible_duplicate"] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

/**
 * Money stages are kept apart on purpose:
 * suspected -> validated -> dispute_approved -> credit_received -> cash_recovered.
 * A credit is counted once, at the furthest stage it has reached.
 */
export const EXCEPTION_STATUSES = [
  "suspected",
  "validated",
  "dispute_approved",
  "credit_received",
  "cash_recovered",
  "dismissed",
] as const;
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];

/**
 * Evidence stored with an exception so every number can be traced back to invoice lines.
 * All text here is written by deterministic code from the stored numbers, in both languages,
 * at detection time. Nothing in it is copied from the free text of a document.
 */
export type ExceptionEvidence = {
  lineIds: string[];
  invoiceIds: string[];
  /** The invoice line in question (the newer purchase), so the interface can highlight it. */
  flaggedLineId: string | null;
  /** One plain-words sentence saying what was noticed. */
  summary: Bilingual;
  /** Step-by-step arithmetic in plain values, produced by deterministic code. */
  calculation: Array<{ label: Bilingual; value: Bilingual }>;
  /** What could make this conclusion wrong. */
  caveats: Bilingual[];
};

export const financialExceptions = pgTable(
  "financial_exceptions",
  {
    id: text("id").primaryKey(),
    /** Same finding detected twice maps to the same key, so it is never listed twice. */
    dedupeKey: text("dedupe_key").notNull().unique(),
    kind: text("kind").$type<ExceptionKind>().notNull(),
    status: text("status").$type<ExceptionStatus>().notNull().default("suspected"),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    productKey: text("product_key"),
    detectedAt: tz("detected_at").notNull().defaultNow(),
    evidence: jsonb("evidence").$type<ExceptionEvidence>().notNull(),
    /** Suspected amount in cents. This is a question to verify, not money owed. */
    suspectedAmountCents: integer("suspected_amount_cents"),
    /** Credit actually granted by the supplier, once known. */
    creditAmountCents: integer("credit_amount_cents"),
    assigneeId: text("assignee_id"),
    /** Draft question for the supplier. A draft only: nothing is sent from this system. */
    draftQuestion: jsonb("draft_question").$type<Bilingual>().notNull(),
    resolutionNote: text("resolution_note"),
    isSynthetic: boolean("is_synthetic").notNull().default(false),
  },
  (t) => [index("exception_status_idx").on(t.status)],
);

export const exceptionEvents = pgTable(
  "exception_events",
  {
    id: text("id").primaryKey(),
    exceptionId: text("exception_id")
      .notNull()
      .references(() => financialExceptions.id, { onDelete: "cascade" }),
    at: tz("at").notNull().defaultNow(),
    actorId: text("actor_id"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    note: text("note"),
  },
  (t) => [index("exception_event_idx").on(t.exceptionId, t.at)],
);
