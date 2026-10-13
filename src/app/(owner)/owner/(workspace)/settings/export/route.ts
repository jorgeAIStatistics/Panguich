import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { can } from "@/lib/auth/permissions";
import { getSessionUser, toActor } from "@/lib/auth/session";
import { businessDateString } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Owner-only download of everything stored in this workspace, as one JSON file. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const db = await getDb();
  const actor = toActor(user);
  if (!can(user.role, "data.export")) {
    await writeAudit(db, { actor, action: "data.export", permission: "data.export", outcome: "denied" });
    return new NextResponse(null, { status: 403 });
  }

  const [inquiries, consents, quotes, activities, checklist, campaigns, creatives, approvals, invoices, lines, exceptions, exceptionEvents, audit] =
    await Promise.all([
      db.select().from(schema.cateringInquiries),
      db.select().from(schema.consentRecords),
      db.select().from(schema.cateringQuotes),
      db.select().from(schema.cateringActivities),
      db.select().from(schema.cateringChecklistItems),
      db.select().from(schema.campaigns),
      db.select().from(schema.campaignCreatives),
      db.select().from(schema.campaignApprovals),
      db.select().from(schema.supplierInvoices),
      db.select().from(schema.supplierInvoiceLines),
      db.select().from(schema.financialExceptions),
      db.select().from(schema.exceptionEvents),
      db.select().from(schema.auditLog),
    ]);

  await writeAudit(db, { actor, action: "data.export", permission: "data.export", outcome: "ok", detail: { inquiries: inquiries.length } });

  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      note: "Panguich owner workspace export. Records flagged isSynthetic are sample data invented for the demonstration.",
      catering: { inquiries, consents, quotes, activities, checklist },
      growth: { campaigns, creatives, approvals },
      operations: { invoices, lines, exceptions, exceptionEvents },
      audit,
    },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="panguich-export-${businessDateString(new Date())}.json"`,
      "cache-control": "no-store",
    },
  });
}
