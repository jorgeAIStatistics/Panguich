import { describe, expect, it } from "vitest";
import type { PackUnit } from "@/db/schema";
import { analyzeInvoices, findDuplicatePairs, UNIT_PRICE_INCREASE_THRESHOLD_BPS, type DetectInvoice, type DetectLine } from "./detect";

type LineSpec = {
  productKey?: string;
  quantity?: number;
  packCount?: number;
  packSize?: string;
  packUnit?: PackUnit;
  casePriceCents: number;
  isCredit?: boolean;
};

let counter = 0;

function invoice(number: string, date: string, lines: LineSpec[], extra: Partial<DetectInvoice> = {}): DetectInvoice {
  counter += 1;
  const id = `inv-${counter}`;
  const built: DetectLine[] = lines.map((spec, index) => ({
    id: `${id}-l${index + 1}`,
    invoiceId: id,
    lineNo: index + 1,
    productKey: spec.productKey ?? "pork-shoulder",
    quantity: spec.quantity ?? 1,
    packCount: spec.packCount ?? 1,
    packSize: spec.packSize ?? "40",
    packUnit: spec.packUnit ?? "lb",
    casePriceCents: spec.casePriceCents,
    isCredit: spec.isCredit ?? false,
  }));
  return {
    id,
    supplierId: "supplier-a",
    invoiceNumber: number,
    invoiceDate: date,
    totalCents: built.reduce((sum, line) => sum + line.quantity * line.casePriceCents, 0),
    importedAt: null,
    isSynthetic: false,
    lines: built,
    ...extra,
  };
}

describe("per-unit price increase", () => {
  it("uses an 8% threshold", () => {
    expect(UNIT_PRICE_INCREASE_THRESHOLD_BPS).toBe(800);
  });

  it("flags a real per-lb increase with the correct cents and traceable evidence", () => {
    const before = invoice("A-1", "2026-09-01", [{ quantity: 3, casePriceCents: 8400 }]);
    const after = invoice("A-2", "2026-09-15", [{ quantity: 3, casePriceCents: 9920 }]);
    const { findings, checked } = analyzeInvoices([after, before]);

    expect(checked).toEqual([]);
    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding.kind).toBe("unit_price_increase");
    expect(finding.productKey).toBe("pork-shoulder");
    // ($2.48 − $2.10) × (3 cases × 40 lb) = $45.60
    expect(finding.suspectedAmountCents).toBe(4560);
    expect(finding.evidence.lineIds).toEqual([before.lines[0].id, after.lines[0].id]);
    expect(finding.evidence.invoiceIds).toEqual([before.id, after.id]);
    expect(finding.evidence.flaggedLineId).toBe(after.lines[0].id);
    expect(finding.evidence.summary.en).toBe("Pork shoulder: the price per lb went up 18.1%");
    expect(finding.evidence.summary.es).toBe("Paleta de cerdo: el precio por lb subió 18.1%");

    const steps = finding.evidence.calculation.map((step) => `${step.label.en}: ${step.value.en}`);
    expect(steps[0]).toBe("Previous purchase: Invoice A-1 (Sep 1, 2026): 40 lb case at $84.00 = $2.10 per lb");
    expect(steps[1]).toBe("Latest purchase: Invoice A-2 (Sep 15, 2026): 40 lb case at $99.20 = $2.48 per lb");
    expect(steps[2]).toBe("Change per lb: $2.48 − $2.10 = $0.38 more per lb (+18.1%)");
    expect(steps[4]).toBe("Quantity billed at the new price: 3 cases × 40 lb = 120 lb");
    expect(steps[5]).toBe("Amount to ask about: $0.38 × 120 lb = $45.60 (rounded to the nearest cent)");
    expect(finding.evidence.calculation.every((step) => step.label.es && step.value.es)).toBe(true);

    const caveats = finding.evidence.caveats.map((caveat) => caveat.en).join(" | ");
    expect(caveats).toContain("market price may have changed");
    expect(caveats).toContain("No contract");
    expect(caveats).toContain("Only two purchases to compare");
  });

  it("drops the two-purchases caveat once there is more history", () => {
    const { findings } = analyzeInvoices([
      invoice("A-1", "2026-08-01", [{ casePriceCents: 8400 }]),
      invoice("A-2", "2026-08-15", [{ casePriceCents: 8400 }]),
      invoice("A-3", "2026-09-01", [{ casePriceCents: 9920 }]),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence.caveats.map((caveat) => caveat.en).join(" ")).not.toContain("Only two purchases");
  });

  it("does not call a larger case a price increase", () => {
    const { findings, checked } = analyzeInvoices([
      invoice("B-1", "2026-09-01", [{ productKey: "yellow-onions", packSize: "40", casePriceCents: 2600 }]),
      invoice("B-2", "2026-09-15", [{ productKey: "yellow-onions", packSize: "50", casePriceCents: 3250 }]),
    ]);
    expect(findings).toEqual([]);
    expect(checked).toHaveLength(1);
    expect(checked[0].outcome).toBe("larger_case_same_unit_price");
    expect(checked[0].summary.en).toBe("Yellow onions: larger case, same price per lb (40 lb case → 50 lb case, $0.65 per lb)");
    expect(checked[0].summary.es).toBe("Cebolla amarilla: caja más grande, mismo precio por lb (caja de 40 lb → caja de 50 lb, $0.65 por lb)");
  });

  it("does flag a larger case when the price per lb really rose", () => {
    const { findings } = analyzeInvoices([
      invoice("B-1", "2026-09-01", [{ packSize: "40", casePriceCents: 4000 }]),
      invoice("B-2", "2026-09-15", [{ packSize: "50", quantity: 2, casePriceCents: 6000 }]),
    ]);
    // $1.00/lb → $1.20/lb, 2 cases × 50 lb = 100 lb → $20.00
    expect(findings).toHaveLength(1);
    expect(findings[0].suspectedAmountCents).toBe(2000);
  });

  it("raises nothing for an increase below the threshold", () => {
    const { findings, checked } = analyzeInvoices([
      invoice("C-1", "2026-09-01", [{ casePriceCents: 10_000 }]),
      invoice("C-2", "2026-09-15", [{ casePriceCents: 10_799 }]),
    ]);
    expect(findings).toEqual([]);
    expect(checked[0].outcome).toBe("below_threshold");
    expect(checked[0].summary.en).toContain("went up 8.0%, below the 8.0% that gets raised");
  });

  it("raises a question exactly at the threshold", () => {
    const { findings } = analyzeInvoices([
      invoice("C-1", "2026-09-01", [{ casePriceCents: 10_000 }]),
      invoice("C-2", "2026-09-15", [{ casePriceCents: 10_800 }]),
    ]);
    expect(findings).toHaveLength(1);
  });

  it("never compares a product sold by count with one sold by weight", () => {
    const { findings, checked } = analyzeInvoices([
      invoice("D-1", "2026-09-01", [{ productKey: "limes", packCount: 200, packSize: "1", packUnit: "each", casePriceCents: 3000 }]),
      invoice("D-2", "2026-09-15", [{ productKey: "limes", packSize: "40", packUnit: "lb", casePriceCents: 9000 }]),
    ]);
    expect(findings).toEqual([]);
    expect(checked).toHaveLength(1);
    expect(checked[0].outcome).toBe("not_comparable");
    expect(checked[0].summary.en).toBe("Limes: cannot be compared. The previous purchase was billed by count and the latest by weight");
  });

  it("ignores credit lines and non-positive quantities when comparing prices", () => {
    const { findings, checked } = analyzeInvoices([
      invoice("E-1", "2026-09-01", [{ casePriceCents: 8400 }]),
      invoice("E-2", "2026-09-08", [{ casePriceCents: 8400 }]),
      // A credit at a "price" that would look like a huge increase, and a zero-quantity line.
      invoice("E-3", "2026-09-15", [
        { quantity: -1, casePriceCents: 20_000, isCredit: true },
        { quantity: 0, casePriceCents: 30_000 },
        { quantity: -2, casePriceCents: 40_000 },
      ]),
    ]);
    expect(findings).toEqual([]);
    expect(checked).toHaveLength(1);
    expect(checked[0].outcome).toBe("same_price");
    expect(checked[0].invoiceIds).not.toContain("E-3");
  });

  it("notes a lower price and a single purchase without raising anything", () => {
    const { findings, checked } = analyzeInvoices([
      invoice("F-1", "2026-09-01", [
        { casePriceCents: 9000 },
        { productKey: "frying-oil", packCount: 2, packSize: "2.5", packUnit: "gal", casePriceCents: 5800 },
      ]),
      invoice("F-2", "2026-09-15", [{ casePriceCents: 8000 }]),
    ]);
    expect(findings).toEqual([]);
    expect(Object.fromEntries(checked.map((entry) => [entry.productKey, entry.outcome]))).toEqual({
      "frying-oil": "nothing_to_compare",
      "pork-shoulder": "lower_unit_price",
    });
  });

  it("keeps suppliers apart", () => {
    const { findings } = analyzeInvoices([
      invoice("G-1", "2026-09-01", [{ casePriceCents: 8400 }], { supplierId: "supplier-a" }),
      invoice("G-2", "2026-09-15", [{ casePriceCents: 9920 }], { supplierId: "supplier-b" }),
    ]);
    expect(findings).toEqual([]);
  });

  it("gives the same finding the same key every time", () => {
    const invoices = [invoice("H-1", "2026-09-01", [{ casePriceCents: 8400 }]), invoice("H-2", "2026-09-15", [{ casePriceCents: 9920 }])];
    const first = analyzeInvoices(invoices);
    const second = analyzeInvoices([...invoices].reverse());
    expect(first).toEqual(second);
    expect(first.findings[0].dedupeKey).toBe(`unit_price_increase:supplier-a:pork-shoulder:${invoices[1].lines[0].id}`);
  });
});

describe("possible duplicate invoices", () => {
  it("flags the same supplier and invoice number stored twice", () => {
    const first = invoice("DUP-7", "2026-09-01", [{ quantity: 2, casePriceCents: 8400 }]);
    const second = invoice("DUP-7", "2026-09-03", [{ quantity: 2, casePriceCents: 8400 }]);
    const { findings } = analyzeInvoices([first, second]);

    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding.kind).toBe("possible_duplicate");
    expect(finding.suspectedAmountCents).toBe(second.totalCents);
    expect(finding.evidence.invoiceIds).toEqual([first.id, second.id]);
    expect(finding.dedupeKey).toBe(`possible_duplicate:supplier-a:${first.id}:${second.id}`);
    expect(finding.evidence.caveats.map((caveat) => caveat.en).join(" ")).toContain("legitimate repeat order");
    expect(finding.evidence.caveats.map((caveat) => caveat.es).join(" ")).toContain("pedido repetido legítimo");
    expect(finding.draftQuestion.en).toContain("two separate deliveries");
  });

  it("flags the same supplier, date and total under different numbers", () => {
    const first = invoice("X-1", "2026-09-01", [{ quantity: 2, casePriceCents: 8400 }]);
    const second = invoice("X-2", "2026-09-01", [{ quantity: 2, casePriceCents: 8400 }]);
    const pairs = findDuplicatePairs([second, first]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ reason: "same_date_total", earlier: { id: first.id }, later: { id: second.id } });
    expect(analyzeInvoices([first, second]).findings[0].suspectedAmountCents).toBe(16_800);
  });

  it("does not flag different suppliers, different totals, or a zero-total reissue", () => {
    expect(
      findDuplicatePairs([
        invoice("Y-1", "2026-09-01", [{ casePriceCents: 8400 }], { supplierId: "supplier-a" }),
        invoice("Y-1", "2026-09-01", [{ casePriceCents: 8400 }], { supplierId: "supplier-b" }),
      ]),
    ).toEqual([]);
    expect(
      findDuplicatePairs([invoice("Z-1", "2026-09-01", [{ casePriceCents: 8400 }]), invoice("Z-2", "2026-09-01", [{ casePriceCents: 8500 }])]),
    ).toEqual([]);
    expect(
      findDuplicatePairs([invoice("W-1", "2026-09-01", [{ casePriceCents: 8400 }]), invoice("W-1", "2026-09-02", [{ quantity: -1, casePriceCents: 8400, isCredit: true }])]),
    ).toEqual([]);
  });

  it("does not treat a second copy of the same bill as the previous purchase", () => {
    // The real previous purchase was at $84.00; the latest bill ($99.20) was stored twice.
    const before = invoice("K-1", "2026-09-01", [{ casePriceCents: 8400 }]);
    const copyOne = invoice("K-2", "2026-09-15", [{ casePriceCents: 9920 }]);
    const copyTwo = invoice("K-2", "2026-09-15", [{ casePriceCents: 9920 }]);
    const { findings } = analyzeInvoices([before, copyOne, copyTwo]);
    expect(findings.map((finding) => finding.kind).sort()).toEqual(["possible_duplicate", "unit_price_increase"]);
    const price = findings.find((finding) => finding.kind === "unit_price_increase")!;
    expect(price.evidence.invoiceIds[0]).toBe(before.id);
  });
});

describe("draft supplier question", () => {
  it("asks for confirmation with the evidence numbers and never accuses", () => {
    const { findings } = analyzeInvoices([
      invoice("A-1", "2026-09-01", [{ quantity: 3, casePriceCents: 8400 }]),
      invoice("A-2", "2026-09-15", [{ quantity: 3, casePriceCents: 9920 }]),
    ]);
    const { en, es } = findings[0].draftQuestion;
    expect(en).toContain("Could you confirm the price for pork shoulder on invoice A-2 (Sep 15, 2026)?");
    expect(en).toContain("$99.20 per 40 lb case, which is $2.48 per lb");
    expect(en).toContain("Our previous invoice, A-1 (Sep 1, 2026), showed $84.00 per 40 lb case, which is $2.10 per lb");
    expect(es).toContain("¿Nos pueden confirmar el precio de paleta de cerdo en la factura A-2");
    expect(es).toContain("$84.00 por caja de 40 lb, es decir, $2.10 por lb");
    for (const text of [en, es]) {
      expect(text).not.toMatch(/overcharg|\bowe[sd]?\b|refund|demand|fraud|sobrecobr|nos deben|exigimos|reembols/i);
    }
  });
});
