import { inArray } from "drizzle-orm";
import { checkFreshness } from "@/content/integrations";
import { KNOWN_CONFLICTS, SOURCES, type KnownConflict } from "@/content/business";
import type { DbOrTx } from "@/db/client";
import { settings } from "@/db/schema";
import type { ActionCard } from "@/lib/action-card";
import { authorize, writeAudit, type Actor } from "@/lib/audit";
import { can, type Role } from "@/lib/auth/permissions";
import type { Locale } from "@/lib/i18n";
import { businessDateString, formatIsoDate } from "@/lib/time";

export type ConflictResolution = { answer: string; resolvedBy: string; resolvedAt: string };

const KEY_PREFIX = "conflict:";

/** Owner answers already saved for the known public-information conflicts. */
export async function getConflictResolutions(db: DbOrTx): Promise<Record<string, ConflictResolution>> {
  const keys = KNOWN_CONFLICTS.map((c) => `${KEY_PREFIX}${c.id}`);
  const rows = await db.select().from(settings).where(inArray(settings.key, keys));
  return Object.fromEntries(rows.map((row) => [row.key.slice(KEY_PREFIX.length), row.value as ConflictResolution]));
}

export type ResolveResult = { ok: true } | { ok: false; reason: "unknown_conflict" | "empty_answer" };

/**
 * Saves the owner's answer to a conflict. This records a decision; it does not change any
 * public page, ordering system or the website content, which are updated separately on approval.
 */
export async function resolveConflict(db: DbOrTx, actor: Actor, conflictId: string, answer: string, now: Date): Promise<ResolveResult> {
  const who = await authorize(db, actor, "settings.manage", { action: "business.resolve_conflict", entityType: "conflict", entityId: conflictId });
  const trimmed = answer.trim().slice(0, 500);
  if (!KNOWN_CONFLICTS.some((c) => c.id === conflictId)) return { ok: false, reason: "unknown_conflict" };
  if (!trimmed) return { ok: false, reason: "empty_answer" };
  const value: ConflictResolution = { answer: trimmed, resolvedBy: who.id, resolvedAt: now.toISOString() };
  await db
    .insert(settings)
    .values({ key: `${KEY_PREFIX}${conflictId}`, value, updatedBy: who.id, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedBy: who.id, updatedAt: now } });
  await writeAudit(db, {
    actor: who,
    action: "business.resolve_conflict",
    permission: "settings.manage",
    entityType: "conflict",
    entityId: conflictId,
    outcome: "ok",
    detail: { answer: trimmed },
  });
  return { ok: true };
}

const copy = {
  en: {
    titleOne: (c: KnownConflict) => `Your public pages disagree: ${c.topic.en}`,
    titleMany: (n: number) => `Your public pages disagree on ${n} things`,
    list: (topics: string[]) => `To confirm: ${topics.join("; ")}.`,
    source: (n: number) => `${n} of your public pages, read directly`,
    freshness: (date: string, stale: boolean) => (stale ? `Checked ${date}. That is over a month ago, so re-check before acting.` : `Checked ${date}`),
    unknown: "We can see the pages disagree. Only you know which one is right.",
    action: "Review and answer",
  },
  es: {
    titleOne: (c: KnownConflict) => `Tus páginas públicas no coinciden: ${c.topic.es}`,
    titleMany: (n: number) => `Tus páginas públicas no coinciden en ${n} cosas`,
    list: (topics: string[]) => `Por confirmar: ${topics.join("; ")}.`,
    source: (n: number) => `${n} de tus páginas públicas, leídas directamente`,
    freshness: (date: string, stale: boolean) => (stale ? `Revisado el ${date}. Ya pasó más de un mes; vuelve a revisar antes de actuar.` : `Revisado el ${date}`),
    unknown: "Vemos que las páginas no coinciden. Solo tú sabes cuál es la correcta.",
    action: "Revisar y responder",
  },
} as const;

/**
 * One card for the unresolved conflicts between the restaurant's own public pages.
 * These are observed facts (we read the pages), not estimates. They share a single card so
 * they can never crowd catering, campaigns and invoices off the Today screen.
 */
export async function getBusinessTodayCards(db: DbOrTx, role: Role, locale: Locale, now: Date): Promise<ActionCard[]> {
  if (!can(role, "settings.view")) return [];
  const resolved = await getConflictResolutions(db);
  const open = KNOWN_CONFLICTS.filter((conflict) => !resolved[conflict.id]);
  if (open.length === 0) return [];

  const t = copy[locale];
  const sourceIds = [...new Set(open.flatMap((conflict) => conflict.observations.map((o) => o.source)))];
  const checkedOn = sourceIds.map((id) => SOURCES[id].checkedOn).sort()[0];
  const { stale } = checkFreshness(checkedOn, businessDateString(now));
  const first = open[0];

  return [
    {
      id: "business:public-page-conflicts",
      module: "business",
      // A guest arriving to a closed door is a public-information problem (50s band).
      priority: 55,
      title: open.length === 1 ? t.titleOne(first) : t.titleMany(open.length),
      explanation: open.length === 1 ? first.detail[locale] : `${first.detail[locale]} ${t.list(open.map((c) => c.topic[locale]))}`,
      source: t.source(sourceIds.length),
      freshness: t.freshness(formatIsoDate(checkedOn, locale, { month: "short", day: "numeric", year: "numeric" }), stale),
      basis: "observed",
      uncertainty: t.unknown,
      nextAction: { label: t.action, href: open.length === 1 ? `/owner/settings#${first.id}` : "/owner/settings#facts" },
    },
  ];
}
