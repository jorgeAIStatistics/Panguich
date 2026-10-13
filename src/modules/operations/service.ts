import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db, DbOrTx } from "@/db/client";
import {
  exceptionEvents,
  financialExceptions,
  importBatches,
  supplierInvoiceLines,
  supplierInvoices,
  suppliers,
  users,
  type ExceptionStatus,
} from "@/db/schema";
import { authorize, writeAudit, type Actor } from "@/lib/audit";
import { can, type Permission, type Role } from "@/lib/auth/permissions";
import { newId } from "@/lib/ids";
import type { Bilingual } from "@/lib/i18n";
import { formatUsd } from "@/lib/money";
import { analyzeInvoices, loadDetectionInput, type CheckedProduct } from "./detect";
import { OperationsError, type OperationsErrorCode } from "./errors";
import { summarizeLedger, type LedgerSummary } from "./ledger";
import { hashQuestion } from "./question";

/**
 * Operations: the supplier-invoice exception queue.
 *
 * Stages: suspected → validated → dispute_approved → credit_received → cash_recovered,
 * or dismissed from suspected / validated / dispute_approved (for example when the supplier
 * answers that the price was correct). Once a credit is recorded it can no longer be dismissed.
 *
 * Nothing here contacts a supplier, moves money, or changes an invoice. "Approving the
 * question" records that the owner is happy with the wording so they can send it themselves.
 */

export type ExceptionRow = typeof financialExceptions.$inferSelect;
export type ExceptionEventRow = typeof exceptionEvents.$inferSelect;
export type SupplierRow = typeof suppliers.$inferSelect;

const ENTITY = "financial_exception";

/** Stages shown first in the queue: the ones still waiting on a person. */
const STAGE_ORDER: Record<ExceptionStatus, number> = {
  suspected: 0,
  validated: 1,
  dispute_approved: 2,
  credit_received: 3,
  cash_recovered: 4,
  dismissed: 5,
};

export type InvoiceSummary = {
  id: string;
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalCents: number;
  sourceDocument: string;
  isSynthetic: boolean;
  importedAt: Date | null;
  importedByName: string | null;
  sourceLabel: string | null;
};

export type OperationsOverview = {
  exceptions: ExceptionRow[];
  suppliers: Record<string, SupplierRow>;
  ledger: LedgerSummary;
  /** Products that were compared and did not raise a question, with the reason. */
  checked: CheckedProduct[];
  invoices: InvoiceSummary[];
};

async function loadInvoiceSummaries(db: DbOrTx, invoiceIds?: string[]): Promise<InvoiceSummary[]> {
  if (invoiceIds && invoiceIds.length === 0) return [];
  return db
    .select({
      id: supplierInvoices.id,
      supplierId: supplierInvoices.supplierId,
      invoiceNumber: supplierInvoices.invoiceNumber,
      invoiceDate: supplierInvoices.invoiceDate,
      totalCents: supplierInvoices.totalCents,
      sourceDocument: supplierInvoices.sourceDocument,
      isSynthetic: supplierInvoices.isSynthetic,
      importedAt: importBatches.importedAt,
      importedByName: users.name,
      sourceLabel: importBatches.sourceLabel,
    })
    .from(supplierInvoices)
    .leftJoin(importBatches, eq(supplierInvoices.importBatchId, importBatches.id))
    .leftJoin(users, eq(importBatches.importedBy, users.id))
    .where(invoiceIds ? inArray(supplierInvoices.id, invoiceIds) : undefined)
    .orderBy(desc(supplierInvoices.invoiceDate), asc(supplierInvoices.invoiceNumber));
}

export async function getOperationsOverview(db: DbOrTx, actor: Actor): Promise<OperationsOverview> {
  await authorize(db, actor, "operations.view", { action: "operations.view" });
  const exceptions = await db.select().from(financialExceptions).orderBy(desc(financialExceptions.detectedAt), asc(financialExceptions.id));
  exceptions.sort((a, b) => STAGE_ORDER[a.status] - STAGE_ORDER[b.status]);
  const supplierRows = await db.select().from(suppliers);
  const { checked } = analyzeInvoices(await loadDetectionInput(db));
  return {
    exceptions,
    suppliers: Object.fromEntries(supplierRows.map((supplier) => [supplier.id, supplier])),
    ledger: summarizeLedger(exceptions),
    checked,
    invoices: await loadInvoiceSummaries(db),
  };
}

export type EvidenceLine = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  lineNo: number;
  rawDescription: string;
  productKey: string;
  quantity: number;
  packCount: number;
  packSize: string;
  packUnit: (typeof supplierInvoiceLines.$inferSelect)["packUnit"];
  casePriceCents: number;
  extendedCents: number;
  isCredit: boolean;
};

export type ExceptionDetail = {
  exception: ExceptionRow;
  supplier: SupplierRow | null;
  lines: EvidenceLine[];
  /** The documents behind the evidence, with their text exactly as received. */
  documents: Array<InvoiceSummary & { rawText: string }>;
  events: Array<ExceptionEventRow & { actorName: string | null }>;
  assignee: { id: string; name: string; role: Role } | null;
  /** People who are allowed to see financial documents and can therefore be given the task. */
  assignable: Array<{ id: string; name: string; role: Role }>;
  questionHash: string;
};

export async function getExceptionDetail(db: DbOrTx, actor: Actor, exceptionId: string): Promise<ExceptionDetail | null> {
  await authorize(db, actor, "operations.view", { action: "operations.view_exception", entityType: ENTITY, entityId: exceptionId });
  const [exception] = await db.select().from(financialExceptions).where(eq(financialExceptions.id, exceptionId)).limit(1);
  if (!exception) return null;

  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, exception.supplierId)).limit(1);
  const { lineIds, invoiceIds } = exception.evidence;
  const lines = lineIds.length
    ? await db
        .select({
          id: supplierInvoiceLines.id,
          invoiceId: supplierInvoiceLines.invoiceId,
          invoiceNumber: supplierInvoices.invoiceNumber,
          invoiceDate: supplierInvoices.invoiceDate,
          lineNo: supplierInvoiceLines.lineNo,
          rawDescription: supplierInvoiceLines.rawDescription,
          productKey: supplierInvoiceLines.productKey,
          quantity: supplierInvoiceLines.quantity,
          packCount: supplierInvoiceLines.packCount,
          packSize: supplierInvoiceLines.packSize,
          packUnit: supplierInvoiceLines.packUnit,
          casePriceCents: supplierInvoiceLines.casePriceCents,
          extendedCents: supplierInvoiceLines.extendedCents,
          isCredit: supplierInvoiceLines.isCredit,
        })
        .from(supplierInvoiceLines)
        .innerJoin(supplierInvoices, eq(supplierInvoiceLines.invoiceId, supplierInvoices.id))
        .where(inArray(supplierInvoiceLines.id, lineIds))
        .orderBy(asc(supplierInvoices.invoiceDate), asc(supplierInvoices.invoiceNumber), asc(supplierInvoiceLines.lineNo))
    : [];

  const summaries = await loadInvoiceSummaries(db, invoiceIds);
  const texts = invoiceIds.length
    ? await db.select({ id: supplierInvoices.id, rawText: supplierInvoices.rawText }).from(supplierInvoices).where(inArray(supplierInvoices.id, invoiceIds))
    : [];
  const textById = new Map(texts.map((row) => [row.id, row.rawText]));
  const documents = summaries
    .map((summary) => ({ ...summary, rawText: textById.get(summary.id) ?? "" }))
    .sort((a, b) => (a.invoiceDate < b.invoiceDate ? -1 : a.invoiceDate > b.invoiceDate ? 1 : 0));

  const eventRows = await db
    .select({ event: exceptionEvents, actorName: users.name })
    .from(exceptionEvents)
    .leftJoin(users, eq(exceptionEvents.actorId, users.id))
    .where(eq(exceptionEvents.exceptionId, exceptionId))
    .orderBy(asc(exceptionEvents.at), asc(exceptionEvents.id));

  const people = await db.select({ id: users.id, name: users.name, role: users.role }).from(users).orderBy(asc(users.name));
  const assignable = people.filter((person) => can(person.role, "operations.view"));

  return {
    exception,
    supplier: supplier ?? null,
    lines,
    documents,
    events: eventRows.map((row) => ({ ...row.event, actorName: row.actorName })),
    assignee: people.find((person) => person.id === exception.assigneeId) ?? null,
    assignable,
    questionHash: hashQuestion(exception.draftQuestion),
  };
}

/* ------------------------------------------------------------------ */
/* Changes                                                             */
/* ------------------------------------------------------------------ */

type Change = {
  /** Name in the audit log, e.g. "operations.exception.validate". */
  auditAction: string;
  /** Name in the exception's own history. */
  event: string;
  /** Stages this step is available from. */
  from: readonly ExceptionStatus[];
  /** New stage, or leave out when the stage does not change. */
  to?: ExceptionStatus;
  note?: string | null;
  patch?: Partial<Pick<ExceptionRow, "creditAmountCents" | "assigneeId" | "draftQuestion" | "resolutionNote">>;
  detail?: Record<string, unknown>;
  /** Extra rule checked against the stored row; return a code to refuse. */
  guard?: (row: ExceptionRow) => OperationsErrorCode | null;
  /** When true for the stored row there is nothing to change, and nothing is written. */
  unchanged?: (row: ExceptionRow) => boolean;
};

async function refuse(
  db: DbOrTx,
  who: NonNullable<Actor>,
  permission: Permission,
  auditAction: string,
  exceptionId: string,
  code: OperationsErrorCode,
  detail: Record<string, unknown> = {},
): Promise<never> {
  await writeAudit(db, {
    actor: who,
    action: auditAction,
    permission,
    entityType: ENTITY,
    entityId: exceptionId,
    outcome: "invalid",
    detail: { reason: code, ...detail },
  });
  throw new OperationsError(code);
}

async function changeException(db: Db, actor: Actor, permission: Permission, exceptionId: string, change: Change): Promise<ExceptionRow> {
  // Permission first, outside any transaction, so a refusal is always recorded.
  const who = await authorize(db, actor, permission, { action: change.auditAction, entityType: ENTITY, entityId: exceptionId });

  const [row] = await db.select().from(financialExceptions).where(eq(financialExceptions.id, exceptionId)).limit(1);
  if (!row) return refuse(db, who, permission, change.auditAction, exceptionId, "not_found");
  if (!change.from.includes(row.status)) {
    return refuse(db, who, permission, change.auditAction, exceptionId, "invalid_transition", { from: row.status, to: change.to ?? row.status });
  }
  const refusal = change.guard?.(row) ?? null;
  if (refusal) return refuse(db, who, permission, change.auditAction, exceptionId, refusal);
  if (change.unchanged?.(row)) return row;

  const toStatus = change.to ?? row.status;
  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(financialExceptions)
      .set({ ...change.patch, status: toStatus })
      // Only if nobody moved it in the meantime.
      .where(and(eq(financialExceptions.id, exceptionId), eq(financialExceptions.status, row.status)))
      .returning();
    if (rows.length === 0) return null;
    await tx.insert(exceptionEvents).values({
      id: newId(),
      exceptionId,
      actorId: who.id,
      actorRole: who.role,
      action: change.event,
      fromStatus: row.status,
      toStatus,
      note: change.note ?? null,
    });
    await writeAudit(tx, {
      actor: who,
      action: change.auditAction,
      permission,
      entityType: ENTITY,
      entityId: exceptionId,
      outcome: "ok",
      detail: { from: row.status, to: toStatus, ...change.detail },
    });
    return rows[0];
  });
  if (!updated) return refuse(db, who, permission, change.auditAction, exceptionId, "invalid_transition", { cause: "changed_meanwhile" });
  return updated;
}

/** "Looks right": someone checked the invoice lines and agrees there is something to ask about. */
export async function validateException(db: Db, actor: Actor, input: { exceptionId: string }): Promise<ExceptionRow> {
  return changeException(db, actor, "operations.act", input.exceptionId, {
    auditAction: "operations.exception.validate",
    event: "validated",
    from: ["suspected"],
    to: "validated",
  });
}

const reasonInput = z.string().trim().min(3).max(500);

/** "Not an issue": closes the exception. A reason is always required. */
export async function dismissException(db: Db, actor: Actor, input: { exceptionId: string; reason: string }): Promise<ExceptionRow> {
  const reason = reasonInput.safeParse(input.reason);
  return changeException(db, actor, "operations.act", input.exceptionId, {
    auditAction: "operations.exception.dismiss",
    event: "dismissed",
    from: ["suspected", "validated", "dispute_approved"],
    to: "dismissed",
    guard: () => (reason.success ? null : "invalid_input"),
    note: reason.success ? reason.data : null,
    patch: { resolutionNote: reason.success ? reason.data : null },
  });
}

/** Gives the exception to someone who is allowed to see financial documents, or clears the assignment. */
export async function assignException(db: Db, actor: Actor, input: { exceptionId: string; assigneeId: string | null }): Promise<ExceptionRow> {
  const context = { action: "operations.exception.assign", entityType: ENTITY, entityId: input.exceptionId };
  await authorize(db, actor, "operations.act", context);
  const assigneeId = input.assigneeId?.trim() ? input.assigneeId.trim() : null;
  const [assignee] = assigneeId ? await db.select().from(users).where(eq(users.id, assigneeId)).limit(1) : [];
  const allowed = assigneeId === null || (assignee !== undefined && can(assignee.role, "operations.view"));
  return changeException(db, actor, "operations.act", input.exceptionId, {
    auditAction: "operations.exception.assign",
    event: assigneeId ? "assigned" : "unassigned",
    from: ["suspected", "validated", "dispute_approved", "credit_received"],
    guard: () => (allowed ? null : "invalid_input"),
    unchanged: (row) => row.assigneeId === assigneeId,
    note: assignee?.name ?? null,
    patch: { assigneeId },
    detail: { assigneeId },
  });
}

const questionInput = z.object({
  en: z.string().trim().min(1).max(4000),
  es: z.string().trim().min(1).max(4000),
});

/** Edits the draft question. Only while it has not been approved. */
export async function updateDraftQuestion(db: Db, actor: Actor, input: { exceptionId: string; en: string; es: string }): Promise<ExceptionRow> {
  const parsed = questionInput.safeParse({ en: input.en, es: input.es });
  const question: Bilingual | null = parsed.success ? { en: parsed.data.en.replace(/\r\n/g, "\n"), es: parsed.data.es.replace(/\r\n/g, "\n") } : null;
  return changeException(db, actor, "operations.act", input.exceptionId, {
    auditAction: "operations.exception.edit_question",
    event: "question_edited",
    from: ["suspected", "validated"],
    guard: () => (question ? null : "invalid_input"),
    unchanged: (row) => question !== null && row.draftQuestion.en === question.en && row.draftQuestion.es === question.es,
    patch: question ? { draftQuestion: question } : {},
    detail: question ? { questionHash: hashQuestion(question) } : {},
  });
}

/**
 * The owner approves the wording of the question. Nothing is sent: the owner copies the text
 * and sends it themselves. `expectedHash` is the wording that was on the owner's screen; if
 * someone edited the draft in the meantime the approval is refused and they must read it again.
 */
export async function approveSupplierQuestion(db: Db, actor: Actor, input: { exceptionId: string; expectedHash: string }): Promise<ExceptionRow> {
  return changeException(db, actor, "operations.approve_dispute", input.exceptionId, {
    auditAction: "operations.exception.approve_question",
    event: "question_approved",
    from: ["validated"],
    to: "dispute_approved",
    guard: (row) => (hashQuestion(row.draftQuestion) === input.expectedHash ? null : "changed_since_viewed"),
    detail: { questionHash: input.expectedHash, sentFromThisSystem: false },
  });
}

const creditInput = z.number().int().positive().max(100_000_000);

/** Records a credit the supplier actually granted. From here on it replaces the suspected amount. */
export async function recordCredit(db: Db, actor: Actor, input: { exceptionId: string; amountCents: number }): Promise<ExceptionRow> {
  const amount = creditInput.safeParse(input.amountCents);
  return changeException(db, actor, "operations.approve_dispute", input.exceptionId, {
    auditAction: "operations.exception.record_credit",
    event: "credit_recorded",
    from: ["dispute_approved"],
    to: "credit_received",
    guard: () => (amount.success ? null : "invalid_input"),
    note: amount.success ? formatUsd(amount.data, "en") : null,
    patch: amount.success ? { creditAmountCents: amount.data } : {},
    detail: amount.success ? { creditAmountCents: amount.data } : {},
  });
}

/** Records that the credit turned into cash (a refund, or a lower payment). Counted once, as cash. */
export async function recordCashRecovered(db: Db, actor: Actor, input: { exceptionId: string }): Promise<ExceptionRow> {
  return changeException(db, actor, "operations.approve_dispute", input.exceptionId, {
    auditAction: "operations.exception.record_cash",
    event: "cash_recorded",
    from: ["credit_received"],
    to: "cash_recovered",
    guard: (row) => (row.creditAmountCents && row.creditAmountCents > 0 ? null : "invalid_input"),
  });
}
