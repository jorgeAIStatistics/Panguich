import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { MIGRATIONS_DIR, type Db } from "./client";
import * as schema from "./schema";
import { resetDemoData, seedDemoData } from "./seed";

async function emptyDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}

describe("demo data", () => {
  let db: Db;
  beforeAll(async () => {
    db = await emptyDb();
    await seedDemoData(db);
  });

  it("creates only demo identities, one per role", async () => {
    const people = await db.select().from(schema.users);
    expect(people.map((p) => p.role).sort()).toEqual(["manager", "owner", "staff"]);
    expect(people.every((p) => p.isDemo)).toBe(true);
  });

  it("labels every sample record as synthetic", async () => {
    const inquiries = await db.select().from(schema.cateringInquiries);
    const campaigns = await db.select().from(schema.campaigns);
    const suppliers = await db.select().from(schema.suppliers);
    const invoices = await db.select().from(schema.supplierInvoices);
    const exceptions = await db.select().from(schema.financialExceptions);

    expect(inquiries).toHaveLength(2);
    expect(campaigns.length).toBeGreaterThanOrEqual(1);
    expect(invoices.length).toBeGreaterThanOrEqual(3);
    for (const row of [...inquiries, ...campaigns, ...suppliers, ...invoices, ...exceptions]) {
      expect(row.isSynthetic).toBe(true);
    }
    // Sample contacts are obviously fake and can never be mistaken for customers.
    for (const inquiry of inquiries) {
      expect(inquiry.contactEmail ?? "x@example.com").toMatch(/@example\.com$/);
      expect(inquiry.source).toBe("sample");
    }
  });

  it("shows exactly one sample invoice exception", async () => {
    const exceptions = await db.select().from(schema.financialExceptions);
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].status).toBe("suspected");
    expect(exceptions[0].evidence.lineIds.length).toBeGreaterThanOrEqual(2);
  });

  it("does nothing when run again on a database that already has people", async () => {
    const before = await db.$count(schema.cateringInquiries);
    expect(await seedDemoData(db)).toEqual({ seeded: false });
    expect(await db.$count(schema.cateringInquiries)).toBe(before);
    expect(await db.$count(schema.users)).toBe(3);
  });

  it("reset erases what was entered and restores the labeled samples", async () => {
    await db.insert(schema.cateringInquiries).values({
      id: "real-1",
      reference: "CAT-REAL01",
      contactName: "Entered during the demo",
      contactEmail: "someone@example.org",
      eventDate: "2027-01-15",
      headcount: 12,
    });
    await db.insert(schema.settings).values({ key: "conflict:sunday-close", value: { answer: "5 PM" } });
    await db.insert(schema.siteEvents).values({ clientEventId: "evt-reset-0001", type: "menu_view" });

    await resetDemoData(db);

    expect(await db.select().from(schema.cateringInquiries).where(eq(schema.cateringInquiries.id, "real-1"))).toHaveLength(0);
    expect(await db.$count(schema.settings)).toBe(0);
    expect(await db.$count(schema.siteEvents)).toBe(0);
    expect(await db.$count(schema.users)).toBe(3);
    const inquiries = await db.select().from(schema.cateringInquiries);
    expect(inquiries).toHaveLength(2);
    expect(inquiries.every((row) => row.isSynthetic)).toBe(true);
    expect(await db.$count(schema.financialExceptions)).toBe(1);
  });
});
