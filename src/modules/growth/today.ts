import { asc, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { campaigns } from "@/db/schema";
import type { ActionCard } from "@/lib/action-card";
import { can, type Role } from "@/lib/auth/permissions";
import type { Locale } from "@/lib/i18n";
import { formatRelative } from "@/lib/time";
import { growthDict } from "./i18n";
import { joinList } from "./schedule-text";

/**
 * Candidate Today cards from this module, already filtered to what the role may see.
 *
 * One card when campaign drafts are waiting for approval, and only for someone who can
 * approve them (the owner). It is an observed fact: a person sent the draft for approval.
 */
export async function getGrowthTodayCards(db: DbOrTx, role: Role, locale: Locale, now: Date): Promise<ActionCard[]> {
  if (!can(role, "growth.approve")) return [];

  const pending = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.status, "pending_approval"))
    .orderBy(asc(campaigns.updatedAt), asc(campaigns.id));
  if (pending.length === 0) return [];

  const t = growthDict(locale);
  const allSample = pending.every((campaign) => campaign.isSynthetic);
  // The oldest request is the one that has been waiting longest.
  const waitingSince = pending[0].updatedAt;

  return [
    {
      id: "growth:pending-approval",
      module: "growth",
      // Between a public-information problem (50s) and a money question (30s). Sample drafts rank lower.
      priority: allSample ? 40 : 45,
      title: t.today.title(pending.length),
      explanation: t.today.explanation(
        joinList(
          pending.map((campaign) => `“${campaign.name}”`),
          locale,
        ),
      ),
      source: t.today.source(allSample),
      freshness: t.today.freshness(formatRelative(waitingSince, now, locale)),
      basis: "observed",
      synthetic: allSample,
      nextAction: {
        label: t.today.action,
        href: pending.length === 1 ? `/owner/grow/${pending[0].id}` : "/owner/grow",
      },
    },
  ];
}
