import type { ActionCard } from "@/lib/action-card";

/** The Today screen never shows more than three things. */
export const MAX_TODAY_CARDS = 3;

/**
 * Picks what to show: highest priority first, ties broken by id so the order never jumps
 * around between page loads. Duplicate ids are collapsed.
 */
export function prioritizeCards(cards: ActionCard[], max: number = MAX_TODAY_CARDS): { shown: ActionCard[]; waiting: ActionCard[] } {
  const unique = [...new Map(cards.map((card) => [card.id, card])).values()];
  unique.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  return { shown: unique.slice(0, max), waiting: unique.slice(max) };
}
