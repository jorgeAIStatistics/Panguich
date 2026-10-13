import { describe, expect, it } from "vitest";
import { LEDGER_STAGES, ledgerAmountCents, summarizeLedger, type LedgerEntry } from "./ledger";

const entry = (status: LedgerEntry["status"], suspectedAmountCents: number | null, creditAmountCents: number | null = null): LedgerEntry => ({
  status,
  suspectedAmountCents,
  creditAmountCents,
});

describe("ledger", () => {
  it("shows honest zeros when there is nothing", () => {
    const summary = summarizeLedger([]);
    for (const stage of LEDGER_STAGES) expect(summary[stage]).toEqual({ count: 0, amountCents: 0, unknownAmountCount: 0 });
    expect(summary.dismissedCount).toBe(0);
  });

  it("counts every exception once, at the stage it is in now", () => {
    const entries = [
      entry("suspected", 4560),
      entry("suspected", 1000),
      entry("validated", 2000),
      entry("dispute_approved", 3000),
      entry("credit_received", 5000, 4500),
      entry("cash_recovered", 7000, 6000),
      entry("dismissed", 9999),
    ];
    const summary = summarizeLedger(entries);
    expect(summary.suspected).toEqual({ count: 2, amountCents: 5560, unknownAmountCount: 0 });
    expect(summary.validated).toEqual({ count: 1, amountCents: 2000, unknownAmountCount: 0 });
    expect(summary.dispute_approved).toEqual({ count: 1, amountCents: 3000, unknownAmountCount: 0 });
    expect(summary.credit_received).toEqual({ count: 1, amountCents: 4500, unknownAmountCount: 0 });
    expect(summary.cash_recovered).toEqual({ count: 1, amountCents: 6000, unknownAmountCount: 0 });
    expect(summary.dismissedCount).toBe(1);

    // Nothing is counted twice: the stage counts add up to the exceptions that are not dismissed.
    const counted = LEDGER_STAGES.reduce((sum, stage) => sum + summary[stage].count, 0);
    expect(counted).toBe(entries.length - 1);
  });

  it("replaces the suspected amount with the credit once the credit is known", () => {
    const summary = summarizeLedger([entry("credit_received", 4560, 3000)]);
    expect(summary.credit_received.amountCents).toBe(3000);
    // The $45.60 that was first suspected appears nowhere any more.
    expect(LEDGER_STAGES.reduce((sum, stage) => sum + summary[stage].amountCents, 0)).toBe(3000);
    expect(ledgerAmountCents(entry("credit_received", 4560, 3000))).toBe(3000);
  });

  it("does not count a credit that became cash as both", () => {
    const summary = summarizeLedger([entry("cash_recovered", 4560, 3000)]);
    expect(summary.cash_recovered).toEqual({ count: 1, amountCents: 3000, unknownAmountCount: 0 });
    expect(summary.credit_received).toEqual({ count: 0, amountCents: 0, unknownAmountCount: 0 });
    expect(summary.suspected.amountCents + summary.validated.amountCents + summary.dispute_approved.amountCents).toBe(0);
  });

  it("keeps an unknown amount out of the total and says so", () => {
    const summary = summarizeLedger([entry("suspected", null), entry("suspected", 500)]);
    expect(summary.suspected).toEqual({ count: 2, amountCents: 500, unknownAmountCount: 1 });
  });

  it("counts a dismissed exception in no money stage", () => {
    const summary = summarizeLedger([entry("dismissed", 4560, 3000)]);
    expect(LEDGER_STAGES.every((stage) => summary[stage].count === 0 && summary[stage].amountCents === 0)).toBe(true);
    expect(ledgerAmountCents(entry("dismissed", 4560))).toBeNull();
  });
});
