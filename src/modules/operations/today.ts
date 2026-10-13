import type { DbOrTx } from "@/db/client";
import type { ActionCard } from "@/lib/action-card";
import type { Role } from "@/lib/auth/permissions";
import type { Locale } from "@/lib/i18n";

/** Candidate Today cards from this module, already filtered to what the role may see. */
export async function getOperationsTodayCards(db: DbOrTx, role: Role, locale: Locale, now: Date): Promise<ActionCard[]> {
  void db;
  void role;
  void locale;
  void now;
  return [];
}
