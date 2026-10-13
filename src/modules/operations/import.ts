import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { importBatches, PACK_UNITS, supplierInvoiceLines, supplierInvoices, suppliers } from "@/db/schema";
import { authorize, writeAudit, type Actor } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { isIsoDate } from "@/lib/time";
import { OperationsError } from "./errors";
import { canonicalJson, sha256Hex } from "./hash";

/**
 * Importing supplier invoices.
 *
 * The raw document text is stored untouched as a record of what was received. It is data:
 * it is shown to people and never read for instructions. The numbers the system calculates
 * with are the structured line fields below.
 *
 * Phase A has no upload screen. This is used by the sample data and by tests.
 */

const lineInput = z.object({
  lineNo: z.number().int().positive(),
  rawDescription: z.string().trim().min(1).max(300),
  /** Stable key for "the same product" across invoices, e.g. "pork-shoulder". */
  productKey: z
    .string()
    .max(80)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  /** Cases billed. Negative on a credit line. */
  quantity: z.number().int(),
  packCount: z.number().int().positive().default(1),
  /** Plain decimal with up to three decimals, e.g. "40" or "2.5". */
  packSize: z
    .string()
    .regex(/^\d{1,9}(\.\d{1,3})?$/)
    .refine((value) => Number(value) > 0, "packSize must be greater than zero"),
  packUnit: z.enum(PACK_UNITS),
  casePriceCents: z.number().int().nonnegative(),
  extendedCents: z.number().int(),
  isCredit: z.boolean().default(false),
  /** 0–1 from extraction; leave out for a clean digital file. */
  extractionConfidence: z.number().min(0).max(1).optional(),
});

const invoiceInput = z.object({
  invoiceNumber: z.string().trim().min(1).max(60),
  invoiceDate: z.string().refine(isIsoDate, "invoiceDate must be YYYY-MM-DD"),
  totalCents: z.number().int(),
  /** Where the record came from (file name, page). */
  sourceDocument: z.string().trim().min(1).max(200),
  rawText: z.string().max(200_000),
  lines: z.array(lineInput).min(1).max(500),
});

export const importBatchInput = z.object({
  sourceLabel: z.string().trim().min(1).max(200),
  /** True for invented sample documents. Sample and real records are never mixed. */
  isSynthetic: z.boolean(),
  supplier: z.object({
    id: z
      .string()
      .max(80)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    name: z.string().trim().min(1).max(160),
  }),
  invoices: z.array(invoiceInput).min(1).max(200),
});

export type ImportBatchInput = z.input<typeof importBatchInput>;
type ParsedBatch = z.output<typeof importBatchInput>;

export type ImportResult =
  | { status: "imported"; batchId: string; contentHash: string; invoiceIds: string[]; lineCount: number }
  /** The same content was imported before. Nothing was stored this time. */
  | { status: "duplicate"; existingBatchId: string; contentHash: string };

/**
 * Identifies the content of a batch: supplier, invoice fields, the raw text and the lines.
 * The label someone typed for the import is left out, so renaming a file does not hide a repeat.
 */
export function contentHashOf(batch: ParsedBatch): string {
  return sha256Hex(canonicalJson({ supplierId: batch.supplier.id, invoices: batch.invoices }));
}

function arithmeticProblems(batch: ParsedBatch): string[] {
  const problems: string[] = [];
  for (const invoice of batch.invoices) {
    const seen = new Set<number>();
    for (const line of invoice.lines) {
      if (seen.has(line.lineNo)) problems.push(`${invoice.invoiceNumber}: line ${line.lineNo} appears twice`);
      seen.add(line.lineNo);
      // A line whose amount is not quantity × price is sent back for review, not guessed at.
      if (line.extendedCents !== line.quantity * line.casePriceCents) {
        problems.push(`${invoice.invoiceNumber} line ${line.lineNo}: amount is not quantity × price`);
      }
      if (line.isCredit && line.extendedCents > 0) {
        problems.push(`${invoice.invoiceNumber} line ${line.lineNo}: a credit line cannot add to the bill`);
      }
    }
  }
  return problems;
}

/**
 * Stores a batch of invoices with their raw text and lines.
 * Importing the same content twice stores nothing the second time.
 */
export async function importInvoices(db: Db, actor: Actor, batch: ImportBatchInput): Promise<ImportResult> {
  const who = await authorize(db, actor, "operations.act", { action: "operations.import", entityType: "import_batch" });

  const parsed = importBatchInput.safeParse(batch);
  const problems = parsed.success ? arithmeticProblems(parsed.data) : parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  if (!parsed.success || problems.length > 0) {
    await writeAudit(db, {
      actor: who,
      action: "operations.import",
      permission: "operations.act",
      entityType: "import_batch",
      outcome: "invalid",
      detail: { problems: problems.slice(0, 20) },
    });
    throw new OperationsError("invalid_input", problems.slice(0, 5).join("; "));
  }
  const data = parsed.data;
  const contentHash = contentHashOf(data);

  const [existingBatch] = await db.select({ id: importBatches.id }).from(importBatches).where(eq(importBatches.contentHash, contentHash)).limit(1);
  if (existingBatch) {
    await writeAudit(db, {
      actor: who,
      action: "operations.import",
      permission: "operations.act",
      entityType: "import_batch",
      entityId: existingBatch.id,
      outcome: "invalid",
      detail: { reason: "already_imported", contentHash },
    });
    return { status: "duplicate", existingBatchId: existingBatch.id, contentHash };
  }

  const [existingSupplier] = await db.select().from(suppliers).where(eq(suppliers.id, data.supplier.id)).limit(1);
  if (existingSupplier && existingSupplier.isSynthetic !== data.isSynthetic) {
    await writeAudit(db, {
      actor: who,
      action: "operations.import",
      permission: "operations.act",
      entityType: "import_batch",
      outcome: "invalid",
      detail: { reason: "sample_real_mix", supplierId: data.supplier.id },
    });
    throw new OperationsError("sample_real_mix", "Sample records and real records cannot share a supplier");
  }

  const batchId = newId();
  const invoiceIds: string[] = [];
  let lineCount = 0;
  await db.transaction(async (tx) => {
    if (!existingSupplier) {
      await tx.insert(suppliers).values({ id: data.supplier.id, name: data.supplier.name, isSynthetic: data.isSynthetic });
    }
    await tx.insert(importBatches).values({
      id: batchId,
      importedBy: who.id,
      sourceLabel: data.sourceLabel,
      contentHash,
      isSynthetic: data.isSynthetic,
    });
    for (const invoice of data.invoices) {
      const invoiceId = newId();
      invoiceIds.push(invoiceId);
      await tx.insert(supplierInvoices).values({
        id: invoiceId,
        supplierId: data.supplier.id,
        importBatchId: batchId,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        totalCents: invoice.totalCents,
        sourceDocument: invoice.sourceDocument,
        rawText: invoice.rawText,
        isSynthetic: data.isSynthetic,
      });
      await tx.insert(supplierInvoiceLines).values(
        invoice.lines.map((line) => ({
          id: newId(),
          invoiceId,
          lineNo: line.lineNo,
          rawDescription: line.rawDescription,
          productKey: line.productKey,
          quantity: line.quantity,
          packCount: line.packCount,
          packSize: line.packSize,
          packUnit: line.packUnit,
          casePriceCents: line.casePriceCents,
          extendedCents: line.extendedCents,
          isCredit: line.isCredit,
          extractionConfidence: line.extractionConfidence === undefined ? null : line.extractionConfidence.toFixed(3),
        })),
      );
      lineCount += invoice.lines.length;
    }
    await writeAudit(tx, {
      actor: who,
      action: "operations.import",
      permission: "operations.act",
      entityType: "import_batch",
      entityId: batchId,
      outcome: "ok",
      detail: { contentHash, invoices: invoiceIds.length, lines: lineCount, isSynthetic: data.isSynthetic },
    });
  });
  return { status: "imported", batchId, contentHash, invoiceIds, lineCount };
}
