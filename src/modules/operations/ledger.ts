import type { ExceptionStatus } from "@/db/schema";

/**
 * The money ledger keeps five stages apart and counts every exception exactly once, at the
 * stage it is in right now:
 *
 *   suspected → validated → dispute approved → credit received → cash recovered
 *
 * - Before a credit exists, the amount is the suspected amount (a question, not money owed).
 * - Once the supplier grants a credit, the credit amount REPLACES the suspected amount.
 * - When that credit becomes cash, it moves to "cash recovered". It is no longer also a credit.
 * - A dismissed exception is counted in none of the money stages.
 */
export const LEDGER_STAGES = ["suspected", "validated", "dispute_approved", "credit_received", "cash_recovered"] as const;
export type LedgerStage = (typeof LEDGER_STAGES)[number];

export type LedgerBucket = {
  count: number;
  amountCents: number;
  /** Exceptions in this stage whose amount is not known. They add to the count, not the amount. */
  unknownAmountCount: number;
};

export type LedgerSummary = Record<LedgerStage, LedgerBucket> & { dismissedCount: number };

export type LedgerEntry = {
  status: ExceptionStatus;
  suspectedAmountCents: number | null;
  creditAmountCents: number | null;
};

/** The one amount an exception contributes at its current stage, or null if unknown / dismissed. */
export function ledgerAmountCents(entry: LedgerEntry): number | null {
  switch (entry.status) {
    case "suspected":
    case "validated":
    case "dispute_approved":
      return entry.suspectedAmountCents;
    case "credit_received":
    case "cash_recovered":
      return entry.creditAmountCents;
    default:
      return null;
  }
}

export function summarizeLedger(entries: readonly LedgerEntry[]): LedgerSummary {
  const summary = {
    ...(Object.fromEntries(LEDGER_STAGES.map((stage) => [stage, { count: 0, amountCents: 0, unknownAmountCount: 0 }])) as Record<
      LedgerStage,
      LedgerBucket
    >),
    dismissedCount: 0,
  };
  for (const entry of entries) {
    if (entry.status === "dismissed") {
      summary.dismissedCount += 1;
      continue;
    }
    const bucket = summary[entry.status];
    bucket.count += 1;
    const amount = ledgerAmountCents(entry);
    if (amount === null) bucket.unknownAmountCount += 1;
    else {
      if (!Number.isSafeInteger(amount)) throw new Error(`Ledger amounts must be whole cents, got ${amount}`);
      bucket.amountCents += amount;
    }
  }
  return summary;
}
