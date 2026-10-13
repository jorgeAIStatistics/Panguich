import { and, asc, count, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import {
  CATERING_STATUSES,
  cateringActivities,
  cateringChecklistItems,
  cateringInquiries,
  cateringQuotes,
  consentRecords,
  DEPOSIT_STATUSES,
  users,
  type CateringStatus,
  type ConsentChannel,
  type DepositStatus,
  type InquirySource,
} from "@/db/schema";
import { authorize, writeAudit, type Actor } from "@/lib/audit";
import type { Role } from "@/lib/auth/permissions";
import { newId, newReference } from "@/lib/ids";
import type { Locale } from "@/lib/i18n";
import { businessDateString, isIsoDate } from "@/lib/time";
import { canMessage, consentGrantsForWebsiteForm, contactKeyForEmail, contactKeyForPhone, recordConsentGrants, suppressContact } from "./consent";
import { addMonthsToIsoDate, MAX_MONTHS_AHEAD } from "./dates";
import { mergeChecklist, planChecklist } from "./pack";
import { quoteSubtotalCents } from "./quote";
import {
  cleanText,
  isStaffSource,
  LIMITS,
  validateInquiry,
  validateQuoteLines,
  type InquiryFieldErrors,
  type InquiryFormValues,
  type InquiryInput,
  type QuoteErrorCode,
} from "./schema";
import {
  ACTIVE_STATUSES,
  CHECKLIST_TICK_STATUSES,
  checkDepositChange,
  checkTransition,
  depositOptions,
  depositPermission,
  DETAILS_EDITABLE_STATUSES,
  nextSteps,
  PACK_STATUSES,
  QUOTE_EDITABLE_STATUSES,
  requiresReason,
  type DepositBlock,
  type NextStep,
  type TransitionBlock,
  type TransitionFacts,
} from "./state";

/**
 * Catering rules that touch the database. Every function that reads or changes protected
 * data checks the permission first (a refusal is written to the audit log), validates its
 * input, and records what happened. Rules that need no database live in state.ts, schema.ts,
 * quote.ts and pack.ts.
 *
 * Nothing here sends a message, takes a payment, or talks to another system.
 */

export type Inquiry = typeof cateringInquiries.$inferSelect;
export type Quote = typeof cateringQuotes.$inferSelect;
export type Activity = typeof cateringActivities.$inferSelect;
export type ChecklistItem = typeof cateringChecklistItems.$inferSelect;
export type ConsentRecord = typeof consentRecords.$inferSelect;

export type CateringErrorCode =
  | "not_found"
  | "invalid_input"
  | TransitionBlock
  | DepositBlock
  | QuoteErrorCode
  | "quote_locked"
  | "quote_not_current"
  | "quote_already_approved"
  | "follow_up_invalid"
  | "follow_up_past"
  | "follow_up_too_far"
  | "assignee_unknown"
  | "note_required"
  | "note_too_long"
  | "reason_too_long"
  | "checklist_locked"
  | "pack_not_ready"
  | "details_locked"
  | "nothing_to_unsubscribe";

export type Failure = { ok: false; code: CateringErrorCode; fields?: InquiryFieldErrors };
export type Result<T> = { ok: true; value: T } | Failure;

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (code: CateringErrorCode, fields?: InquiryFieldErrors): Failure => ({ ok: false, code, ...(fields ? { fields } : {}) });

const ENTITY = "catering_inquiry";

/**
 * What the timeline records. `note` holds the person's own words for "note" and status changes,
 * and a small machine value for the others (a date, a user id, a version number, field names).
 */
export type ActivityKind =
  | "created"
  | "status_change"
  | "note"
  | "follow_up_set"
  | "follow_up_cleared"
  | "assigned"
  | "unassigned"
  | "deposit_change"
  | "quote_created"
  | "quote_approved"
  | "checklist_built"
  | "details_updated"
  | "unsubscribed";

type ActivityInput = {
  inquiryId: string;
  actorId: string | null;
  kind: ActivityKind;
  at: Date;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
};

async function addActivity(db: DbOrTx, activity: ActivityInput): Promise<void> {
  await db.insert(cateringActivities).values({
    id: newId(),
    inquiryId: activity.inquiryId,
    actorId: activity.actorId,
    kind: activity.kind,
    at: activity.at,
    fromStatus: activity.fromStatus ?? null,
    toStatus: activity.toStatus ?? null,
    note: activity.note ?? null,
  });
}

function isCateringStatus(value: unknown): value is CateringStatus {
  return typeof value === "string" && (CATERING_STATUSES as readonly string[]).includes(value);
}
function isDepositStatus(value: unknown): value is DepositStatus {
  return typeof value === "string" && (DEPOSIT_STATUSES as readonly string[]).includes(value);
}

async function findInquiry(db: DbOrTx, id: string): Promise<Inquiry | undefined> {
  const [row] = await db.select().from(cateringInquiries).where(eq(cateringInquiries.id, id)).limit(1);
  return row;
}

/** The newest quote version for a request, whatever its state. */
async function findCurrentQuote(db: DbOrTx, inquiryId: string): Promise<Quote | undefined> {
  const [row] = await db
    .select()
    .from(cateringQuotes)
    .where(eq(cateringQuotes.inquiryId, inquiryId))
    .orderBy(desc(cateringQuotes.version))
    .limit(1);
  return row;
}

/** The newest version the owner approved. The fulfillment pack is built from this one. */
async function findLastApprovedQuote(db: DbOrTx, inquiryId: string): Promise<Quote | undefined> {
  const [row] = await db
    .select()
    .from(cateringQuotes)
    .where(and(eq(cateringQuotes.inquiryId, inquiryId), isNotNull(cateringQuotes.approvedAt)))
    .orderBy(desc(cateringQuotes.version))
    .limit(1);
  return row;
}

async function transitionFactsFor(db: DbOrTx, inquiry: Inquiry, now: Date): Promise<TransitionFacts> {
  const current = await findCurrentQuote(db, inquiry.id);
  return {
    status: inquiry.status,
    eventDate: inquiry.eventDate,
    depositStatus: inquiry.depositStatus,
    hasApprovedCurrentQuote: current?.status === "approved",
    today: businessDateString(now),
  };
}

async function newUniqueReference(db: DbOrTx): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reference = newReference("CAT");
    const [taken] = await db
      .select({ id: cateringInquiries.id })
      .from(cateringInquiries)
      .where(eq(cateringInquiries.reference, reference))
      .limit(1);
    if (!taken) return reference;
  }
  return newReference("CAT", 8);
}

// ---------------------------------------------------------------------------------------------
// Creating requests
// ---------------------------------------------------------------------------------------------

type InsertInquiryArgs = {
  input: InquiryInput;
  source: InquirySource;
  locale: Locale;
  campaignCode?: string;
  actorId: string | null;
  isSynthetic: boolean;
  now: Date;
};

async function insertInquiry(tx: DbOrTx, args: InsertInquiryArgs): Promise<Inquiry> {
  const { input } = args;
  const [row] = await tx
    .insert(cateringInquiries)
    .values({
      id: newId(),
      reference: await newUniqueReference(tx),
      createdAt: args.now,
      updatedAt: args.now,
      status: "new",
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      preferredContact: input.preferredContact,
      company: input.company,
      eventDate: input.eventDate,
      eventTime: input.eventTime,
      headcount: input.headcount,
      budgetCents: input.budgetCents,
      fulfillment: input.fulfillment,
      eventAddress: input.eventAddress,
      occasion: input.occasion,
      dietaryNotes: input.dietaryNotes,
      message: input.message,
      source: args.source,
      campaignCode: args.campaignCode ?? null,
      locale: args.locale,
      isSynthetic: args.isSynthetic,
    })
    .returning();
  await addActivity(tx, { inquiryId: row.id, actorId: args.actorId, kind: "created", at: args.now, toStatus: "new", note: args.source });
  return row;
}

export type CreatedInquiry = { id: string; reference: string };

/**
 * A request sent from the public website form. No sign-in: the actor is a visitor.
 *
 * The visitor must tick "contact me about this request". Without it the request is refused
 * and nothing at all is stored. The optional "email news" box is recorded separately and only
 * when it was ticked and an email address was given.
 */
export async function submitWebsiteInquiry(
  db: DbOrTx,
  raw: Partial<InquiryFormValues>,
  meta: { locale: Locale; campaignCode?: string },
  now: Date = new Date(),
): Promise<Result<CreatedInquiry>> {
  const checked = validateInquiry(raw, { today: businessDateString(now), mode: "public" });
  if (!checked.ok) return fail("invalid_input", checked.errors);
  const input = checked.value;

  const created = await db.transaction(async (tx) => {
    const row = await insertInquiry(tx, {
      input,
      source: "website",
      locale: meta.locale,
      campaignCode: meta.campaignCode,
      actorId: null,
      isSynthetic: false,
      now,
    });
    await recordConsentGrants(
      tx,
      consentGrantsForWebsiteForm({
        inquiryId: row.id,
        email: input.contactEmail,
        phone: input.contactPhone,
        consentContact: input.consentContact,
        consentNews: input.consentNews,
        locale: meta.locale,
        capturedAt: now,
      }),
    );
    await writeAudit(tx, {
      actor: null,
      action: "catering.inquiry_create",
      entityType: ENTITY,
      entityId: row.id,
      outcome: "ok",
      detail: { source: "website", reference: row.reference, newsConsent: input.consentNews },
    });
    return row;
  });
  return ok({ id: created.id, reference: created.reference });
}

async function createByTeam(
  db: DbOrTx,
  actor: Actor,
  raw: Partial<InquiryFormValues>,
  meta: { customerLocale: Locale; sample: boolean },
  now: Date,
): Promise<Result<CreatedInquiry>> {
  const who = await authorize(db, actor, "catering.manage", { action: "catering.inquiry_create", entityType: ENTITY });
  const checked = validateInquiry(raw, { today: businessDateString(now), mode: "staff" });
  if (!checked.ok) return fail("invalid_input", checked.errors);
  const typedSource = cleanText(raw.source);
  const source: InquirySource = meta.sample ? "sample" : isStaffSource(typedSource) ? typedSource : "phone";

  const created = await db.transaction(async (tx) => {
    const row = await insertInquiry(tx, {
      // Whatever the form said, a request typed in by the team carries no consent of any kind:
      // nobody showed the customer a disclosure, so there is no evidence to record.
      input: { ...checked.value, consentContact: false, consentNews: false },
      source,
      locale: meta.customerLocale,
      actorId: who.id,
      isSynthetic: meta.sample,
      now,
    });
    await writeAudit(tx, {
      actor: who,
      action: "catering.inquiry_create",
      permission: "catering.manage",
      entityType: ENTITY,
      entityId: row.id,
      outcome: "ok",
      detail: { source, reference: row.reference },
    });
    return row;
  });
  return ok({ id: created.id, reference: created.reference });
}

/** A request the team enters by hand (phone call, walk-in, email, referral). Records no consent. */
export function createInquiryByTeam(
  db: DbOrTx,
  actor: Actor,
  raw: Partial<InquiryFormValues>,
  meta: { customerLocale: Locale },
  now: Date = new Date(),
): Promise<Result<CreatedInquiry>> {
  return createByTeam(db, actor, raw, { customerLocale: meta.customerLocale, sample: false }, now);
}

/** A clearly labeled sample request for the demonstration (`isSynthetic`, source "sample"). */
export function createSampleInquiry(
  db: DbOrTx,
  actor: Actor,
  raw: Partial<InquiryFormValues>,
  meta: { customerLocale: Locale },
  now: Date = new Date(),
): Promise<Result<CreatedInquiry>> {
  return createByTeam(db, actor, { ...raw, source: "phone" }, { customerLocale: meta.customerLocale, sample: true }, now);
}

/** Corrects the details of a saved request (after a call with the customer, for example). */
export async function updateInquiryDetails(
  db: DbOrTx,
  actor: Actor,
  inquiryId: string,
  raw: Partial<InquiryFormValues>,
  meta: { customerLocale: Locale },
  now: Date = new Date(),
): Promise<Result<{ id: string; changed: string[] }>> {
  const who = await authorize(db, actor, "catering.manage", { action: "catering.details_update", entityType: ENTITY, entityId: inquiryId });
  return db.transaction(async (tx) => {
    const inquiry = await findInquiry(tx, inquiryId);
    if (!inquiry) return fail("not_found");
    if (!DETAILS_EDITABLE_STATUSES.includes(inquiry.status)) return fail("details_locked");

    const checked = validateInquiry(raw, { today: businessDateString(now), mode: "edit", unchangedEventDate: inquiry.eventDate });
    if (!checked.ok) return fail("invalid_input", checked.errors);
    const v = checked.value;

    const next = {
      contactName: v.contactName,
      contactEmail: v.contactEmail,
      contactPhone: v.contactPhone,
      preferredContact: v.preferredContact,
      company: v.company,
      eventDate: v.eventDate,
      eventTime: v.eventTime,
      headcount: v.headcount,
      budgetCents: v.budgetCents,
      fulfillment: v.fulfillment,
      eventAddress: v.eventAddress,
      occasion: v.occasion,
      dietaryNotes: v.dietaryNotes,
      message: v.message,
      locale: meta.customerLocale,
    };
    const changed = (Object.keys(next) as Array<keyof typeof next>).filter((key) => next[key] !== inquiry[key]);
    if (changed.length === 0) return ok({ id: inquiry.id, changed: [] });

    await tx.update(cateringInquiries).set({ ...next, updatedAt: now }).where(eq(cateringInquiries.id, inquiry.id));
    await addActivity(tx, { inquiryId: inquiry.id, actorId: who.id, kind: "details_updated", at: now, note: changed.join(",") });
    if (inquiry.status === "accepted" || inquiry.status === "confirmed") {
      await syncChecklist(tx, { ...inquiry, ...next });
    }
    await writeAudit(tx, {
      actor: who,
      action: "catering.details_update",
      permission: "catering.manage",
      entityType: ENTITY,
      entityId: inquiry.id,
      outcome: "ok",
      detail: { changed },
    });
    return ok({ id: inquiry.id, changed: changed as string[] });
  });
}

// ---------------------------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------------------------

export async function changeStatus(
  db: DbOrTx,
  actor: Actor,
  inquiryId: string,
  input: { to: string; reason?: string | null },
  now: Date = new Date(),
): Promise<Result<{ from: CateringStatus; to: CateringStatus }>> {
  const who = await authorize(db, actor, "catering.manage", { action: "catering.status_change", entityType: ENTITY, entityId: inquiryId });
  const to = input.to;
  if (!isCateringStatus(to)) return fail("invalid_input");
  const reason = cleanText(input.reason);
  if (reason.length > LIMITS.reason) return fail("reason_too_long");

  return db.transaction(async (tx) => {
    const inquiry = await findInquiry(tx, inquiryId);
    if (!inquiry) return fail("not_found");
    const from = inquiry.status;
    const check = checkTransition(await transitionFactsFor(tx, inquiry, now), to, { reason });
    if (!check.ok) {
      await writeAudit(tx, {
        actor: who,
        action: "catering.status_change",
        permission: "catering.manage",
        entityType: ENTITY,
        entityId: inquiry.id,
        outcome: "invalid",
        detail: { from, to, reason: check.code },
      });
      return fail(check.code);
    }

    const closing = requiresReason(to);
    await tx
      .update(cateringInquiries)
      .set({
        status: to,
        updatedAt: now,
        // The reason stays on the request while it is closed and is cleared when it is reopened;
        // the timeline keeps the full history either way.
        closedReason: closing ? reason : from === "canceled" || from === "lost" ? null : inquiry.closedReason,
      })
      .where(eq(cateringInquiries.id, inquiry.id));
    await addActivity(tx, {
      inquiryId: inquiry.id,
      actorId: who.id,
      kind: "status_change",
      at: now,
      fromStatus: from,
      toStatus: to,
      note: reason || null,
    });
    // The fulfillment pack exists from "accepted" onward.
    if (to === "accepted") await syncChecklist(tx, inquiry, { actorId: who.id, at: now });
    await writeAudit(tx, {
      actor: who,
      action: "catering.status_change",
      permission: "catering.manage",
      entityType: ENTITY,
      entityId: inquiry.id,
      outcome: "ok",
      detail: { from, to },
    });
    return ok({ from, to });
  });
}

// ---------------------------------------------------------------------------------------------
// Deposit
// ---------------------------------------------------------------------------------------------

/**
 * Changes the deposit state. "recorded_unverified" means a person here says the deposit was
 * received; no payment provider confirmed it. "verified" can never be set by a person.
 */
export async function setDepositStatus(
  db: DbOrTx,
  actor: Actor,
  inquiryId: string,
  input: { to: string; note?: string | null },
  now: Date = new Date(),
): Promise<Result<{ from: DepositStatus; to: DepositStatus }>> {
  const context = { action: "catering.deposit_change", entityType: ENTITY, entityId: inquiryId };
  const basePermission = input.to === "waived" ? "catering.deposit.waive" : "catering.deposit.record";
  const who = await authorize(db, actor, basePermission, context);
  const to = input.to;
  if (!isDepositStatus(to)) return fail("invalid_input");
  const note = cleanText(input.note);
  if (note.length > LIMITS.depositNote) return fail("note_too_long");

  const before = await findInquiry(db, inquiryId);
  if (!before) return fail("not_found");
  // Undoing a waiver is also the owner's decision. Checked before the transaction so a refusal is recorded.
  const permission = depositPermission(before.depositStatus, to);
  if (permission !== basePermission) await authorize(db, actor, permission, context);

  return db.transaction(async (tx) => {
    const inquiry = await findInquiry(tx, inquiryId);
    if (!inquiry) return fail("not_found");
    const from = inquiry.depositStatus;
    if (depositPermission(from, to) !== permission) return fail("deposit_not_allowed");

    const check = checkDepositChange({ status: inquiry.status, depositStatus: from }, to, { note });
    if (!check.ok) {
      await writeAudit(tx, { actor: who, permission, outcome: "invalid", detail: { from, to, reason: check.code }, ...context });
      return fail(check.code);
    }
    await tx
      .update(cateringInquiries)
      .set({ depositStatus: to, depositNote: to === "not_requested" ? null : note || inquiry.depositNote, updatedAt: now })
      .where(eq(cateringInquiries.id, inquiry.id));
    await addActivity(tx, {
      inquiryId: inquiry.id,
      actorId: who.id,
      kind: "deposit_change",
      at: now,
      fromStatus: from,
      toStatus: to,
      note: note || null,
    });
    await writeAudit(tx, { actor: who, permission, outcome: "ok", detail: { from, to, verifiedByProvider: false }, ...context });
    return ok({ from, to });
  });
}

// ---------------------------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------------------------

/**
 * Writes a new quote version (max + 1) as a draft and marks earlier draft/approved versions
 * as superseded. The subtotal is calculated here, in integer cents, from the lines.
 */
export async function createQuoteVersion(
  db: DbOrTx,
  actor: Actor,
  inquiryId: string,
  input: { lines: unknown; notes?: string | null; validUntil?: string | null },
  now: Date = new Date(),
): Promise<Result<Quote>> {
  const who = await authorize(db, actor, "catering.manage", { action: "catering.quote_create", entityType: ENTITY, entityId: inquiryId });
  const lines = validateQuoteLines(input.lines);
  if (!lines.ok) return fail(lines.code);
  const notes = cleanText(input.notes);
  if (notes.length > LIMITS.quoteNotes) return fail("notes_too_long");
  const validUntil = cleanText(input.validUntil);
  if (validUntil !== "") {
    if (!isIsoDate(validUntil)) return fail("valid_until_invalid");
    if (validUntil < businessDateString(now)) return fail("valid_until_past");
  }

  return db.transaction(async (tx) => {
    const inquiry = await findInquiry(tx, inquiryId);
    if (!inquiry) return fail("not_found");
    if (!QUOTE_EDITABLE_STATUSES.includes(inquiry.status)) return fail("quote_locked");

    const current = await findCurrentQuote(tx, inquiry.id);
    const version = (current?.version ?? 0) + 1;
    await tx
      .update(cateringQuotes)
      .set({ status: "superseded" })
      .where(and(eq(cateringQuotes.inquiryId, inquiry.id), inArray(cateringQuotes.status, ["draft", "approved"])));
    const [quote] = await tx
      .insert(cateringQuotes)
      .values({
        id: newId(),
        inquiryId: inquiry.id,
        version,
        status: "draft",
        lines: lines.value,
        subtotalCents: quoteSubtotalCents(lines.value),
        notes: notes || null,
        validUntil: validUntil || null,
        createdAt: now,
        createdBy: who.id,
      })
      .returning();
    await tx.update(cateringInquiries).set({ updatedAt: now }).where(eq(cateringInquiries.id, inquiry.id));
    await addActivity(tx, { inquiryId: inquiry.id, actorId: who.id, kind: "quote_created", at: now, note: String(version) });
    await writeAudit(tx, {
      actor: who,
      action: "catering.quote_create",
      permission: "catering.manage",
      entityType: ENTITY,
      entityId: inquiry.id,
      outcome: "ok",
      detail: { quoteId: quote.id, version, subtotalCents: quote.subtotalCents, lines: lines.value.length },
    });
    return ok(quote);
  });
}

/** The owner approves the newest draft so it can be shared. Records who approved it and when. */
export async function approveQuote(db: DbOrTx, actor: Actor, quoteId: string, now: Date = new Date()): Promise<Result<Quote>> {
  const context = { action: "catering.quote_approve", entityType: "catering_quote", entityId: quoteId };
  const who = await authorize(db, actor, "catering.quote.approve", context);
  return db.transaction(async (tx) => {
    const [quote] = await tx.select().from(cateringQuotes).where(eq(cateringQuotes.id, quoteId)).limit(1);
    if (!quote) return fail("not_found");
    const inquiry = await findInquiry(tx, quote.inquiryId);
    if (!inquiry) return fail("not_found");

    const current = await findCurrentQuote(tx, inquiry.id);
    const problem: CateringErrorCode | null =
      quote.status === "approved"
        ? "quote_already_approved"
        : quote.status === "superseded" || current?.id !== quote.id
          ? "quote_not_current"
          : !QUOTE_EDITABLE_STATUSES.includes(inquiry.status)
            ? "quote_locked"
            : null;
    if (problem) {
      await writeAudit(tx, { actor: who, permission: "catering.quote.approve", outcome: "invalid", detail: { reason: problem }, ...context });
      return fail(problem);
    }

    const [approved] = await tx
      .update(cateringQuotes)
      .set({ status: "approved", approvedAt: now, approvedBy: who.id })
      .where(eq(cateringQuotes.id, quote.id))
      .returning();
    await tx.update(cateringInquiries).set({ updatedAt: now }).where(eq(cateringInquiries.id, inquiry.id));
    await addActivity(tx, { inquiryId: inquiry.id, actorId: who.id, kind: "quote_approved", at: now, note: String(quote.version) });
    // If the customer had already accepted an earlier version, the lists follow the newly approved one.
    if (inquiry.status === "accepted") await syncChecklist(tx, inquiry);
    await writeAudit(tx, {
      actor: who,
      permission: "catering.quote.approve",
      outcome: "ok",
      detail: { inquiryId: inquiry.id, version: quote.version, subtotalCents: quote.subtotalCents },
      ...context,
    });
    return ok(approved);
  });
}

// ---------------------------------------------------------------------------------------------
// Follow-up, assignment, notes
// ---------------------------------------------------------------------------------------------

export async function setFollowUp(
  db: DbOrTx,
  actor: Actor,
  inquiryId: string,
  input: { date: string | null },
  now: Date = new Date(),
): Promise<Result<{ followUpOn: string | null }>> {
  const who = await authorize(db, actor, "catering.manage", { action: "catering.follow_up_set", entityType: ENTITY, entityId: inquiryId });
  const date = cleanText(input.date) || null;
  if (date !== null) {
    const today = businessDateString(now);
    if (!isIsoDate(date)) return fail("follow_up_invalid");
    if (date < today) return fail("follow_up_past");
    if (date > addMonthsToIsoDate(today, MAX_MONTHS_AHEAD)) return fail("follow_up_too_far");
  }
  return db.transaction(async (tx) => {
    const inquiry = await findInquiry(tx, inquiryId);
    if (!inquiry) return fail("not_found");
    if (inquiry.followUpOn === date) return ok({ followUpOn: date });
    await tx.update(cateringInquiries).set({ followUpOn: date, updatedAt: now }).where(eq(cateringInquiries.id, inquiry.id));
    await addActivity(tx, {
      inquiryId: inquiry.id,
      actorId: who.id,
      kind: date ? "follow_up_set" : "follow_up_cleared",
      at: now,
      note: date,
    });
    await writeAudit(tx, {
      actor: who,
      action: "catering.follow_up_set",
      permission: "catering.manage",
      entityType: ENTITY,
      entityId: inquiry.id,
      outcome: "ok",
      detail: { followUpOn: date },
    });
    return ok({ followUpOn: date });
  });
}

export async function assignInquiry(
  db: DbOrTx,
  actor: Actor,
  inquiryId: string,
  input: { assigneeId: string | null },
  now: Date = new Date(),
): Promise<Result<{ assigneeId: string | null }>> {
  const who = await authorize(db, actor, "catering.manage", { action: "catering.assign", entityType: ENTITY, entityId: inquiryId });
  const assigneeId = cleanText(input.assigneeId) || null;
  return db.transaction(async (tx) => {
    const inquiry = await findInquiry(tx, inquiryId);
    if (!inquiry) return fail("not_found");
    if (assigneeId !== null) {
      const [person] = await tx.select({ id: users.id }).from(users).where(eq(users.id, assigneeId)).limit(1);
      if (!person) return fail("assignee_unknown");
    }
    if (inquiry.assigneeId === assigneeId) return ok({ assigneeId });
    await tx.update(cateringInquiries).set({ assigneeId, updatedAt: now }).where(eq(cateringInquiries.id, inquiry.id));
    await addActivity(tx, {
      inquiryId: inquiry.id,
      actorId: who.id,
      kind: assigneeId ? "assigned" : "unassigned",
      at: now,
      note: assigneeId,
    });
    await writeAudit(tx, {
      actor: who,
      action: "catering.assign",
      permission: "catering.manage",
      entityType: ENTITY,
      entityId: inquiry.id,
      outcome: "ok",
      detail: { assigneeId },
    });
    return ok({ assigneeId });
  });
}

export async function addNote(
  db: DbOrTx,
  actor: Actor,
  inquiryId: string,
  input: { note: string },
  now: Date = new Date(),
): Promise<Result<{ inquiryId: string }>> {
  const who = await authorize(db, actor, "catering.manage", { action: "catering.note_add", entityType: ENTITY, entityId: inquiryId });
  const note = cleanText(input.note);
  if (note === "") return fail("note_required");
  if (note.length > LIMITS.note) return fail("note_too_long");
  return db.transaction(async (tx) => {
    const inquiry = await findInquiry(tx, inquiryId);
    if (!inquiry) return fail("not_found");
    await addActivity(tx, { inquiryId: inquiry.id, actorId: who.id, kind: "note", at: now, note });
    await tx.update(cateringInquiries).set({ updatedAt: now }).where(eq(cateringInquiries.id, inquiry.id));
    await writeAudit(tx, {
      actor: who,
      action: "catering.note_add",
      permission: "catering.manage",
      entityType: ENTITY,
      entityId: inquiry.id,
      outcome: "ok",
    });
    return ok({ inquiryId: inquiry.id });
  });
}

// ---------------------------------------------------------------------------------------------
// Fulfillment pack
// ---------------------------------------------------------------------------------------------

type PackSource = Pick<Inquiry, "id" | "fulfillment" | "dietaryNotes">;

/**
 * Builds (or rebuilds) the three checklists from the last approved quote. Ticks survive a
 * rebuild only for items that are still exactly the same. Adds a timeline row when asked.
 */
async function syncChecklist(tx: DbOrTx, inquiry: PackSource, log?: { actorId: string | null; at: Date }): Promise<number> {
  const quote = await findLastApprovedQuote(tx, inquiry.id);
  const plan = planChecklist({ fulfillment: inquiry.fulfillment, dietaryNotes: inquiry.dietaryNotes, lines: quote?.lines ?? [] });
  const existing = await tx.select().from(cateringChecklistItems).where(eq(cateringChecklistItems.inquiryId, inquiry.id));
  const merged = mergeChecklist(existing, plan);
  await tx.delete(cateringChecklistItems).where(eq(cateringChecklistItems.inquiryId, inquiry.id));
  if (merged.length > 0) {
    await tx.insert(cateringChecklistItems).values(merged.map((item) => ({ id: newId(), inquiryId: inquiry.id, ...item })));
  }
  if (log) {
    await addActivity(tx, { inquiryId: inquiry.id, actorId: log.actorId, kind: "checklist_built", at: log.at, note: String(merged.length) });
  }
  return merged.length;
}

/** Rebuilds the checklists on request (for example after the plan changed). */
export async function rebuildChecklist(
  db: DbOrTx,
  actor: Actor,
  inquiryId: string,
  now: Date = new Date(),
): Promise<Result<{ items: number }>> {
  const who = await authorize(db, actor, "catering.manage", { action: "catering.checklist_rebuild", entityType: ENTITY, entityId: inquiryId });
  return db.transaction(async (tx) => {
    const inquiry = await findInquiry(tx, inquiryId);
    if (!inquiry) return fail("not_found");
    if (inquiry.status !== "accepted" && inquiry.status !== "confirmed") return fail("pack_not_ready");
    const items = await syncChecklist(tx, inquiry, { actorId: who.id, at: now });
    await writeAudit(tx, {
      actor: who,
      action: "catering.checklist_rebuild",
      permission: "catering.manage",
      entityType: ENTITY,
      entityId: inquiry.id,
      outcome: "ok",
      detail: { items },
    });
    return ok({ items });
  });
}

/** Ticks or unticks one checklist item, recording who did it and when. */
export async function setChecklistItemDone(
  db: DbOrTx,
  actor: Actor,
  itemId: string,
  done: boolean,
  now: Date = new Date(),
): Promise<Result<{ inquiryId: string; done: boolean }>> {
  const context = { action: "catering.checklist_tick", entityType: "catering_checklist_item", entityId: itemId };
  const who = await authorize(db, actor, "catering.fulfill", context);
  return db.transaction(async (tx) => {
    const [item] = await tx.select().from(cateringChecklistItems).where(eq(cateringChecklistItems.id, itemId)).limit(1);
    if (!item) return fail("not_found");
    const inquiry = await findInquiry(tx, item.inquiryId);
    if (!inquiry) return fail("not_found");
    if (!CHECKLIST_TICK_STATUSES.includes(inquiry.status)) return fail("checklist_locked");
    if (item.done !== done) {
      await tx
        .update(cateringChecklistItems)
        .set({ done, doneBy: done ? who.id : null, doneAt: done ? now : null })
        .where(eq(cateringChecklistItems.id, item.id));
      await writeAudit(tx, { actor: who, permission: "catering.fulfill", outcome: "ok", detail: { inquiryId: inquiry.id, done }, ...context });
    }
    return ok({ inquiryId: inquiry.id, done });
  });
}

// ---------------------------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------------------------

/**
 * The team records that the customer asked to stop receiving messages on a channel.
 * After this, `canMessage` is false for the customer's contact details on that channel.
 */
export async function recordUnsubscribe(
  db: DbOrTx,
  actor: Actor,
  inquiryId: string,
  channel: ConsentChannel,
  now: Date = new Date(),
): Promise<Result<{ contactKeys: string[] }>> {
  const who = await authorize(db, actor, "catering.manage", { action: "catering.unsubscribe", entityType: ENTITY, entityId: inquiryId });
  return db.transaction(async (tx) => {
    const inquiry = await findInquiry(tx, inquiryId);
    if (!inquiry) return fail("not_found");
    const keys: string[] = [];
    if (inquiry.contactEmail) keys.push(contactKeyForEmail(inquiry.contactEmail));
    // Email news is tied to the email address only; "contact me about my request" covered the phone too.
    if (channel !== "email_marketing" && inquiry.contactPhone) keys.push(contactKeyForPhone(inquiry.contactPhone));
    if (keys.length === 0) return fail("nothing_to_unsubscribe");
    for (const key of keys) {
      await suppressContact(tx, key, channel, { now, source: "recorded_by_team", locale: inquiry.locale, inquiryId: inquiry.id });
    }
    await addActivity(tx, { inquiryId: inquiry.id, actorId: who.id, kind: "unsubscribed", at: now, note: channel });
    await writeAudit(tx, {
      actor: who,
      action: "catering.unsubscribe",
      permission: "catering.manage",
      entityType: ENTITY,
      entityId: inquiry.id,
      outcome: "ok",
      detail: { channel },
    });
    return ok({ contactKeys: keys });
  });
}

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------

export type SameDateEvents = {
  /** Other real requests on the same date that are not canceled or lost. */
  active: number;
  /** Of those, how many are confirmed. */
  confirmed: number;
  /** Other sample (demo) requests on the same date. Shown apart, never added to the real count. */
  sample: number;
};

/**
 * An observed fact, not a capacity check: how many other active events share this date.
 * No capacity limit or lead time is assumed, because the owner has not set one.
 */
export async function countSameDateEvents(db: DbOrTx, eventDate: string, excludeInquiryId?: string): Promise<SameDateEvents> {
  const rows = await db
    .select({ status: cateringInquiries.status, isSynthetic: cateringInquiries.isSynthetic })
    .from(cateringInquiries)
    .where(
      and(
        eq(cateringInquiries.eventDate, eventDate),
        inArray(cateringInquiries.status, [...ACTIVE_STATUSES]),
        excludeInquiryId ? ne(cateringInquiries.id, excludeInquiryId) : undefined,
      ),
    );
  const real = rows.filter((row) => !row.isSynthetic);
  return {
    active: real.length,
    confirmed: real.filter((row) => row.status === "confirmed").length,
    sample: rows.length - real.length,
  };
}

export type FollowUpState = "none" | "upcoming" | "due" | "overdue";

export function followUpState(followUpOn: string | null, status: CateringStatus, today: string): FollowUpState {
  if (!followUpOn || status === "canceled" || status === "lost") return "none";
  if (followUpOn < today) return "overdue";
  return followUpOn === today ? "due" : "upcoming";
}

export type PipelineRow = Inquiry & {
  followUp: FollowUpState;
  /** Unticked checklist items, for requests that have a fulfillment pack. */
  openChecklistItems: number;
};

/**
 * Sort order for the pipeline: what needs someone's action comes first.
 *  1. new requests waiting for a first reply (oldest first)
 *  2. follow-ups that are overdue or due today
 *  3. everything still open, by event date (soonest first)
 *  4. completed events, then closed ones, most recent event first
 */
export function attentionRank(row: Pick<PipelineRow, "status" | "followUp">): number {
  if (row.status === "new") return 0;
  if (row.followUp === "overdue" || row.followUp === "due") return 1;
  if (row.status === "fulfilled" || row.status === "follow_up") return 3;
  if (row.status === "canceled" || row.status === "lost") return 4;
  return 2;
}

export function sortForAttention<T extends Pick<PipelineRow, "status" | "followUp" | "eventDate" | "createdAt">>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const rank = attentionRank(a) - attentionRank(b);
    if (rank !== 0) return rank;
    if (attentionRank(a) === 0) return a.createdAt.getTime() - b.createdAt.getTime();
    if (attentionRank(a) >= 3) return b.eventDate.localeCompare(a.eventDate);
    return a.eventDate.localeCompare(b.eventDate) || a.createdAt.getTime() - b.createdAt.getTime();
  });
}

export type Pipeline = {
  rows: PipelineRow[];
  counts: Record<CateringStatus, number>;
  total: number;
  /** Today's calendar date in Cooper City, used for "due today" and "event in N days". */
  today: string;
  people: Person[];
};

export async function listInquiries(
  db: DbOrTx,
  actor: Actor,
  filter: { stage?: CateringStatus | null } = {},
  now: Date = new Date(),
): Promise<Pipeline> {
  await authorize(db, actor, "catering.view", { action: "catering.list", entityType: ENTITY });
  const today = businessDateString(now);

  const counted = await db.select({ status: cateringInquiries.status, value: count() }).from(cateringInquiries).groupBy(cateringInquiries.status);
  const counts = Object.fromEntries(CATERING_STATUSES.map((status) => [status, 0])) as Record<CateringStatus, number>;
  for (const row of counted) counts[row.status] = row.value;

  const inquiries = await db
    .select()
    .from(cateringInquiries)
    .where(filter.stage ? eq(cateringInquiries.status, filter.stage) : undefined);
  const open = await db
    .select({ inquiryId: cateringChecklistItems.inquiryId, value: count() })
    .from(cateringChecklistItems)
    .where(eq(cateringChecklistItems.done, false))
    .groupBy(cateringChecklistItems.inquiryId);
  const openById = new Map(open.map((row) => [row.inquiryId, row.value]));

  const rows = inquiries.map((inquiry) => ({
    ...inquiry,
    followUp: followUpState(inquiry.followUpOn, inquiry.status, today),
    openChecklistItems: PACK_STATUSES.includes(inquiry.status) ? (openById.get(inquiry.id) ?? 0) : 0,
  }));
  const people = await db.select({ id: users.id, name: users.name, role: users.role }).from(users).orderBy(asc(users.name));
  return { rows: sortForAttention(rows), counts, total: Object.values(counts).reduce((sum, n) => sum + n, 0), today, people };
}

export type ConsentEvidence = ConsentRecord & {
  /** Whether this contact may be messaged on this channel right now. */
  canMessageNow: boolean;
};

export type Person = { id: string; name: string; role: Role };

export type InquiryDetail = {
  inquiry: Inquiry;
  today: string;
  followUp: FollowUpState;
  /** All quote versions, newest first. */
  quotes: Quote[];
  /** The newest version, whatever its state. */
  currentQuote: Quote | null;
  /** The newest version the owner approved; the fulfillment pack is built from it. */
  packQuote: Quote | null;
  steps: NextStep[];
  depositChoices: DepositStatus[];
  canEditQuote: boolean;
  canEditDetails: boolean;
  hasPack: boolean;
  canTickChecklist: boolean;
  checklist: ChecklistItem[];
  activities: Activity[];
  consent: ConsentEvidence[];
  sameDate: SameDateEvents;
  people: Person[];
};

export async function getInquiryDetail(db: DbOrTx, actor: Actor, inquiryId: string, now: Date = new Date()): Promise<InquiryDetail | null> {
  await authorize(db, actor, "catering.view", { action: "catering.read", entityType: ENTITY, entityId: inquiryId });
  const inquiry = await findInquiry(db, inquiryId);
  if (!inquiry) return null;
  const today = businessDateString(now);

  const quotes = await db.select().from(cateringQuotes).where(eq(cateringQuotes.inquiryId, inquiry.id)).orderBy(desc(cateringQuotes.version));
  const currentQuote = quotes[0] ?? null;
  const packQuote = quotes.find((quote) => quote.approvedAt !== null) ?? null;
  const facts: TransitionFacts = {
    status: inquiry.status,
    eventDate: inquiry.eventDate,
    depositStatus: inquiry.depositStatus,
    hasApprovedCurrentQuote: currentQuote?.status === "approved",
    today,
  };

  const checklist = await db
    .select()
    .from(cateringChecklistItems)
    .where(eq(cateringChecklistItems.inquiryId, inquiry.id))
    .orderBy(asc(cateringChecklistItems.kind), asc(cateringChecklistItems.sortOrder));
  const activities = await db
    .select()
    .from(cateringActivities)
    .where(eq(cateringActivities.inquiryId, inquiry.id))
    .orderBy(desc(cateringActivities.at), desc(cateringActivities.kind));
  const records = await db
    .select()
    .from(consentRecords)
    .where(eq(consentRecords.inquiryId, inquiry.id))
    .orderBy(asc(consentRecords.capturedAt), asc(consentRecords.channel));
  const consent: ConsentEvidence[] = [];
  for (const record of records) {
    consent.push({ ...record, canMessageNow: await canMessage(db, record.contactKey, record.channel) });
  }
  const people = await db.select({ id: users.id, name: users.name, role: users.role }).from(users).orderBy(asc(users.name));

  return {
    inquiry,
    today,
    followUp: followUpState(inquiry.followUpOn, inquiry.status, today),
    quotes,
    currentQuote,
    packQuote,
    steps: nextSteps(facts),
    depositChoices: depositOptions({ status: inquiry.status, depositStatus: inquiry.depositStatus }),
    canEditQuote: QUOTE_EDITABLE_STATUSES.includes(inquiry.status),
    canEditDetails: DETAILS_EDITABLE_STATUSES.includes(inquiry.status),
    hasPack: PACK_STATUSES.includes(inquiry.status),
    canTickChecklist: CHECKLIST_TICK_STATUSES.includes(inquiry.status),
    checklist,
    activities,
    consent,
    sameDate: await countSameDateEvents(db, inquiry.eventDate, inquiry.id),
    people,
  };
}
