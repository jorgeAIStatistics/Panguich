import type { DbOrTx } from "@/db/client";
import type { ActionCard } from "@/lib/action-card";
import type { Role } from "@/lib/auth/permissions";
import type { Locale } from "@/lib/i18n";
import { getCateringTodayCards } from "@/modules/catering/today";
import { getGrowthTodayCards } from "@/modules/growth/today";
import { getOperationsTodayCards } from "@/modules/operations/today";
import { getBusinessTodayCards } from "./business";
import { prioritizeCards } from "./prioritize";

/** Everything that could be on Today for this role, reduced to the three that matter most. */
export async function getTodayCards(
  db: DbOrTx,
  role: Role,
  locale: Locale,
  now: Date,
): Promise<{ shown: ActionCard[]; waiting: ActionCard[] }> {
  const groups = await Promise.all([
    getCateringTodayCards(db, role, locale, now),
    getGrowthTodayCards(db, role, locale, now),
    getOperationsTodayCards(db, role, locale, now),
    getBusinessTodayCards(db, role, locale, now),
  ]);
  return prioritizeCards(groups.flat());
}
