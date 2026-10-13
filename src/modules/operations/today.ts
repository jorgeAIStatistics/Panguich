import { desc, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { financialExceptions, supplierInvoices } from "@/db/schema";
import type { ActionCard } from "@/lib/action-card";
import { can, type Role } from "@/lib/auth/permissions";
import type { Locale } from "@/lib/i18n";
import { formatUsd } from "@/lib/money";
import { formatInvoiceDate } from "./format";
import { operationsDict } from "./i18n";

/**
 * Candidate Today cards from this module, already filtered to what the role may see.
 *
 * One card when there are exceptions nobody has looked at yet. The amount is an estimate
 * (a question to verify, never money owed), so the card always says what could be wrong.
 */
export async function getOperationsTodayCards(db: DbOrTx, role: Role, locale: Locale, now: Date): Promise<ActionCard[]> {
  void now;
  // Staff do not see financial documents, so they get no card about them either.
  if (!can(role, "operations.view")) return [];

  const suspected = await db
    .select()
    .from(financialExceptions)
    .where(eq(financialExceptions.status, "suspected"))
    .orderBy(desc(financialExceptions.detectedAt), desc(financialExceptions.id));
  if (suspected.length === 0) return [];

  const t = operationsDict(locale);
  const first = suspected[0];
  const allSample = suspected.every((exception) => exception.isSynthetic);

  const knownAmounts = suspected.map((exception) => exception.suspectedAmountCents).filter((amount): amount is number => amount !== null);
  const total = knownAmounts.length === suspected.length ? knownAmounts.reduce((sum, amount) => sum + amount, 0) : null;

  const invoiceIds = [...new Set(suspected.flatMap((exception) => exception.evidence.invoiceIds))];
  const dates = invoiceIds.length
    ? await db.select({ date: supplierInvoices.invoiceDate }).from(supplierInvoices).where(inArray(supplierInvoices.id, invoiceIds))
    : [];
  const latestDate = dates.map((row) => row.date).sort().at(-1);

  const caveats = first.evidence.caveats.map((caveat) => caveat[locale]);
  const uncertainty = [...(allSample ? [t.today.sampleUncertainty] : []), ...caveats.slice(0, 2)].join(" ");

  return [
    {
      id: "operations:suspected-exceptions",
      module: "operations",
      // "Money question to review" band (30s). Sample-only cards sit at the bottom of the band.
      priority: allSample ? 30 : 34,
      title: t.today.title(suspected.length),
      explanation: t.today.explanation(first.evidence.summary[locale], total === null ? null : formatUsd(total, locale), suspected.length - 1),
      source: t.today.source(allSample),
      freshness: latestDate ? t.today.freshness(formatInvoiceDate(latestDate, locale)) : "—",
      basis: "estimate",
      uncertainty,
      synthetic: allSample,
      nextAction: {
        label: t.today.action,
        href: suspected.length === 1 ? `/owner/operations/exceptions/${first.id}` : "/owner/operations",
      },
    },
  ];
}
