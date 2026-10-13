import { and, count, eq, gte, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db/client";
import { SITE_EVENT_TYPES, siteEvents, type SiteEventType } from "@/db/schema";
import { LOCALES } from "@/lib/i18n";

/**
 * Website activity tracking.
 *
 * What is counted: page views of the menu and catering pages, and taps on Order, Delivery,
 * Directions and Call. A tap is only a tap. It is never reported as an order, a sale, or a visit;
 * completed purchases can only come from a verified Toast signal or a reconciled import (not built yet).
 * No personal information is accepted: only the page path (without its query string), language,
 * and a campaign code.
 */
export const CAMPAIGN_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,31}$/;

export const siteEventInput = z.object({
  /** Random id made in the browser. The same id sent twice is stored once. */
  clientEventId: z
    .string()
    .min(8)
    .max(80)
    .regex(/^[A-Za-z0-9:_-]+$/),
  type: z.enum(SITE_EVENT_TYPES),
  locale: z.enum(LOCALES).optional(),
  path: z.string().max(200).optional(),
  campaignCode: z.string().regex(CAMPAIGN_CODE_PATTERN).optional(),
});
export type SiteEventInput = z.infer<typeof siteEventInput>;

/** Keeps only the path: query strings and fragments can carry personal data. */
export function sanitizePath(path: string | undefined): string | null {
  if (!path) return null;
  const clean = path.split(/[?#]/)[0];
  return clean.startsWith("/") ? clean.slice(0, 200) : null;
}

/** Stores an event once. Returns recorded=false when the same clientEventId was already stored. */
export async function recordSiteEvent(db: DbOrTx, input: SiteEventInput): Promise<{ recorded: boolean }> {
  const event = siteEventInput.parse(input);
  const inserted = await db
    .insert(siteEvents)
    .values({
      clientEventId: event.clientEventId,
      type: event.type,
      locale: event.locale ?? null,
      path: sanitizePath(event.path),
      campaignCode: event.campaignCode ?? null,
    })
    .onConflictDoNothing({ target: siteEvents.clientEventId })
    .returning({ id: siteEvents.id });
  return { recorded: inserted.length > 0 };
}

export type EventCounts = Record<SiteEventType, number>;

function emptyCounts(): EventCounts {
  return Object.fromEntries(SITE_EVENT_TYPES.map((type) => [type, 0])) as EventCounts;
}

/** Event totals by type. Optionally limited to a time window and/or one campaign code. */
export async function getEventCounts(
  db: DbOrTx,
  filter: { since?: Date; campaignCode?: string } = {},
): Promise<EventCounts> {
  const conditions = [
    filter.since ? gte(siteEvents.occurredAt, filter.since) : undefined,
    filter.campaignCode ? eq(siteEvents.campaignCode, filter.campaignCode) : undefined,
  ].filter((c): c is NonNullable<typeof c> => Boolean(c));
  const rows = await db
    .select({ type: siteEvents.type, value: count() })
    .from(siteEvents)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(siteEvents.type);
  const counts = emptyCounts();
  for (const row of rows) counts[row.type] = row.value;
  return counts;
}

/** Event totals per campaign code (only events that carried a code). */
export async function getEventCountsByCampaign(db: DbOrTx, since?: Date): Promise<Record<string, EventCounts>> {
  const rows = await db
    .select({ code: siteEvents.campaignCode, type: siteEvents.type, value: count() })
    .from(siteEvents)
    .where(and(isNotNull(siteEvents.campaignCode), since ? gte(siteEvents.occurredAt, since) : undefined))
    .groupBy(siteEvents.campaignCode, siteEvents.type);
  const result: Record<string, EventCounts> = {};
  for (const row of rows) {
    if (!row.code) continue;
    result[row.code] ??= emptyCounts();
    result[row.code][row.type] = row.value;
  }
  return result;
}
