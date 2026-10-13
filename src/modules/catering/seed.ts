import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cateringInquiries, users } from "@/db/schema";
import type { Actor } from "@/lib/audit";
import { addDaysToIsoDate, businessDateString } from "@/lib/time";
import {
  approveQuote,
  assignInquiry,
  changeStatus,
  createQuoteVersion,
  createSampleInquiry,
  setDepositStatus,
  setFollowUp,
  type Result,
} from "./service";

/** Stops the seed loudly if a rule refuses a step, instead of leaving half-made sample data. */
function must<T>(step: string, result: Result<T>): T {
  if (!result.ok) throw new Error(`Catering sample data: "${step}" was refused (${result.code}).`);
  return result.value;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Inserts two clearly labeled sample requests for the demonstration.
 *
 * Both are marked `isSynthetic` with source "sample", use example.com addresses and 555-01xx
 * phone numbers, and say "sample" / "demo" in every text a person can read. They are built
 * through the same service functions the workspace uses, so every rule holds (approved quote
 * before "quoted", deposit before "confirmed", checklists from the accepted quote). No consent
 * is recorded for them: no real person filled in a form.
 */
export async function seedCatering(db: Db, now: Date = new Date()): Promise<void> {
  const [already] = await db.select({ id: cateringInquiries.id }).from(cateringInquiries).where(eq(cateringInquiries.source, "sample")).limit(1);
  if (already) return;
  const [ownerUser] = await db.select().from(users).where(eq(users.role, "owner")).limit(1);
  if (!ownerUser) return;
  const owner: Actor = { id: ownerUser.id, role: "owner" };
  const [managerUser] = await db.select().from(users).where(eq(users.role, "manager")).limit(1);

  const today = businessDateString(now);

  // A. Quoted, with an approved quote and a follow-up due today.
  {
    const start = now.getTime() - 26 * HOUR;
    const at = (minutes: number) => new Date(start + minutes * MINUTE);
    const created = must(
      "create sample A",
      await createSampleInquiry(
        db,
        owner,
        {
          name: "Sample customer A (demo)",
          email: "sample.customer.a@example.com",
          phone: "(954) 555-0101",
          preferredContact: "email",
          company: "Sample office (demo)",
          eventDate: addDaysToIsoDate(today, 12),
          eventTime: "12:30",
          headcount: "40",
          budget: "600",
          fulfillment: "pickup",
          occasion: "Office lunch (sample)",
          dietary: "Sample note: two guests asked about vegetarian options.",
          message: "Sample request made for this demonstration. Not a real customer.",
        },
        { customerLocale: "en" },
        at(0),
      ),
    );
    const quote = must(
      "quote sample A",
      await createQuoteVersion(
        db,
        owner,
        created.id,
        {
          lines: [
            { description: "Sample sandwich tray (demo item, not a real price)", quantity: 4, unitPriceCents: 100_00 },
            { description: "Sample drinks (demo item, not a real price)", quantity: 40, unitPriceCents: 2_00 },
          ],
          notes: "Sample quote for the demonstration. Items and prices are invented.",
        },
        at(20),
      ),
    );
    must("approve sample A", await approveQuote(db, owner, quote.id, at(30)));
    must("mark sample A quoted", await changeStatus(db, owner, created.id, { to: "quoted" }, at(35)));
    must("follow-up sample A", await setFollowUp(db, owner, created.id, { date: today }, at(36)));
    if (managerUser) must("assign sample A", await assignInquiry(db, owner, created.id, { assigneeId: managerUser.id }, at(37)));
  }

  // B. Confirmed, two days out, deposit noted as received (not verified), checklists ready.
  {
    const start = now.getTime() - 3 * 24 * HOUR;
    const at = (minutes: number) => new Date(start + minutes * MINUTE);
    const created = must(
      "create sample B",
      await createSampleInquiry(
        db,
        owner,
        {
          name: "Sample customer B (demo)",
          email: "sample.customer.b@example.com",
          phone: "(954) 555-0102",
          preferredContact: "phone",
          eventDate: addDaysToIsoDate(today, 2),
          eventTime: "18:00",
          headcount: "25",
          fulfillment: "delivery",
          address: "123 Example Street, Sample City, FL (sample address)",
          occasion: "Cumpleaños (muestra)",
          message: "Solicitud de muestra hecha para esta demostración. No es un cliente real.",
        },
        { customerLocale: "es" },
        at(0),
      ),
    );
    const quote = must(
      "quote sample B",
      await createQuoteVersion(
        db,
        owner,
        created.id,
        {
          lines: [
            { description: "Bandeja de pollo de muestra (producto de demostración, no es un precio real)", quantity: 3, unitPriceCents: 90_00 },
            { description: "Acompañamientos de muestra (producto de demostración, no es un precio real)", quantity: 25, unitPriceCents: 3_00 },
          ],
          notes: "Cotización de muestra para la demostración. Los productos y precios son inventados.",
        },
        at(30),
      ),
    );
    must("approve sample B", await approveQuote(db, owner, quote.id, at(40)));
    must("mark sample B quoted", await changeStatus(db, owner, created.id, { to: "quoted" }, at(45)));
    must("mark sample B accepted", await changeStatus(db, owner, created.id, { to: "accepted" }, at(24 * 60)));
    must("request deposit sample B", await setDepositStatus(db, owner, created.id, { to: "requested" }, at(24 * 60 + 5)));
    must(
      "record deposit sample B",
      await setDepositStatus(
        db,
        owner,
        created.id,
        { to: "recorded_unverified", note: "Sample note: marked as received by the demo owner. No real payment exists." },
        at(30 * 60),
      ),
    );
    must("confirm sample B", await changeStatus(db, owner, created.id, { to: "confirmed" }, at(30 * 60 + 5)));
  }
}
