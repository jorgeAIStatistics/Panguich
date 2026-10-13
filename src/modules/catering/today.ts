import { and, asc, count, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { cateringChecklistItems, cateringInquiries, type InquirySource } from "@/db/schema";
import type { ActionCard } from "@/lib/action-card";
import { can, type Role } from "@/lib/auth/permissions";
import type { Locale } from "@/lib/i18n";
import { addDaysToIsoDate, businessDateString, daysBetweenIsoDates, formatIsoDate, formatRelative } from "@/lib/time";
import { cateringDict } from "./i18n";
import { ACTIVE_STATUSES } from "./state";

/** How many days ahead a confirmed event with open checklist items is raised on Today. */
export const EVENT_SOON_DAYS = 3;

/**
 * Real records and sample records are never mixed in one card. If there is at least one real
 * row, the card is built from real rows only. A card built only from sample rows is marked
 * `synthetic`.
 */
function realOrSample<T extends { isSynthetic: boolean }>(rows: readonly T[]): { rows: T[]; synthetic: boolean } {
  const real = rows.filter((row) => !row.isSynthetic);
  if (real.length > 0) return { rows: real, synthetic: false };
  return { rows: [...rows], synthetic: rows.length > 0 };
}

/**
 * Candidate Today cards from this module, already filtered to what the role may see and act on:
 *  - new requests waiting for a first reply, and follow-ups due: people who can manage catering;
 *  - confirmed events in the next few days with open checklist items: people who fulfill events.
 * Every card is an observed fact read from saved requests.
 */
export async function getCateringTodayCards(db: DbOrTx, role: Role, locale: Locale, now: Date): Promise<ActionCard[]> {
  if (!can(role, "catering.view")) return [];
  const t = cateringDict(locale).today;
  const today = businessDateString(now);
  const cards: ActionCard[] = [];

  if (can(role, "catering.manage")) {
    // 1. New requests nobody has answered yet.
    const waiting = realOrSample(
      await db.select().from(cateringInquiries).where(eq(cateringInquiries.status, "new")).orderBy(asc(cateringInquiries.createdAt)),
    );
    if (waiting.rows.length > 0) {
      const oldest = waiting.rows[0];
      const hoursWaiting = Math.max(0, (now.getTime() - oldest.createdAt.getTime()) / 3_600_000);
      const sources = [...new Set(waiting.rows.map((row) => row.source))] as InquirySource[];
      cards.push({
        id: "catering:new-inquiries",
        module: "catering",
        // 90, plus 1 for each half day the oldest request has waited, up to 95.
        priority: 90 + Math.min(5, Math.floor(hoursWaiting / 12)),
        title: t.newTitle(waiting.rows.length),
        explanation: t.newExplanation({
          reference: oldest.reference,
          headcount: oldest.headcount,
          eventDate: formatIsoDate(oldest.eventDate, locale),
        }),
        source: sources.length === 1 ? t.sources[sources[0]] : t.sourceMixed,
        freshness: t.newFreshness(formatRelative(oldest.createdAt, now, locale)),
        basis: "observed",
        synthetic: waiting.synthetic,
        nextAction: {
          label: waiting.rows.length === 1 ? t.newAction : t.newActionMany,
          href: waiting.rows.length === 1 ? `/owner/catering/${oldest.id}` : "/owner/catering?stage=new",
        },
      });
    }

    // 2. Follow-ups that are due today or overdue.
    const due = realOrSample(
      await db
        .select()
        .from(cateringInquiries)
        .where(
          and(
            isNotNull(cateringInquiries.followUpOn),
            lte(cateringInquiries.followUpOn, today),
            inArray(cateringInquiries.status, [...ACTIVE_STATUSES]),
          ),
        )
        .orderBy(asc(cateringInquiries.followUpOn)),
    );
    if (due.rows.length > 0) {
      const first = due.rows[0];
      const firstDue = first.followUpOn ?? today;
      const daysOverdue = Math.max(0, daysBetweenIsoDates(firstDue, today));
      const overdue = due.rows.filter((row) => (row.followUpOn ?? today) < today).length;
      cards.push({
        id: "catering:follow-ups-due",
        module: "catering",
        // 70, plus 1 for each day the oldest follow-up is overdue, up to 79.
        priority: 70 + Math.min(9, daysOverdue),
        title: t.followUpTitle(due.rows.length, overdue),
        explanation: t.followUpExplanation({ reference: first.reference, name: first.contactName, eventDate: formatIsoDate(first.eventDate, locale) }),
        source: due.synthetic ? t.sources.sample : t.followUpSource,
        freshness: t.followUpFreshness(daysOverdue, formatIsoDate(firstDue, locale, { weekday: "short", month: "short", day: "numeric" })),
        basis: "observed",
        synthetic: due.synthetic,
        nextAction: {
          label: due.rows.length === 1 ? t.followUpAction : t.followUpActionMany,
          href: due.rows.length === 1 ? `/owner/catering/${first.id}` : "/owner/catering",
        },
      });
    }
  }

  if (can(role, "catering.fulfill")) {
    // 3. Confirmed events coming up with checklist items still open.
    const upcoming = await db
      .select()
      .from(cateringInquiries)
      .where(
        and(
          eq(cateringInquiries.status, "confirmed"),
          gte(cateringInquiries.eventDate, today),
          lte(cateringInquiries.eventDate, addDaysToIsoDate(today, EVENT_SOON_DAYS)),
        ),
      )
      .orderBy(asc(cateringInquiries.eventDate), asc(cateringInquiries.eventTime));
    const openCounts = upcoming.length
      ? await db
          .select({ inquiryId: cateringChecklistItems.inquiryId, value: count() })
          .from(cateringChecklistItems)
          .where(
            and(
              eq(cateringChecklistItems.done, false),
              inArray(
                cateringChecklistItems.inquiryId,
                upcoming.map((row) => row.id),
              ),
            ),
          )
          .groupBy(cateringChecklistItems.inquiryId)
      : [];
    const openById = new Map(openCounts.map((row) => [row.inquiryId, row.value]));
    const soon = realOrSample(upcoming.filter((row) => (openById.get(row.id) ?? 0) > 0));
    if (soon.rows.length > 0) {
      const first = soon.rows[0];
      const daysUntil = daysBetweenIsoDates(today, first.eventDate);
      const openItems = openById.get(first.id) ?? 0;
      cards.push({
        id: "catering:events-soon",
        module: "catering",
        // 79 for an event today, one less for each day further out (76 at three days).
        priority: 79 - Math.min(EVENT_SOON_DAYS, daysUntil),
        title: t.eventTitle(daysUntil, openItems),
        explanation: t.eventExplanation({
          reference: first.reference,
          headcount: first.headcount,
          eventDate: formatIsoDate(first.eventDate, locale),
          others: soon.rows.length - 1,
        }),
        source: soon.synthetic ? t.sources.sample : t.eventSource,
        freshness: t.eventFreshness,
        basis: "observed",
        synthetic: soon.synthetic,
        nextAction: { label: t.eventAction, href: `/owner/catering/${first.id}#pack` },
      });
    }
  }

  return cards;
}
