import type { CateringStatus, DepositStatus } from "@/db/schema";
import type { Permission } from "@/lib/auth/permissions";

/**
 * The catering pipeline as pure rules: no database, no clock. Callers pass in the facts
 * (current stage, deposit, whether the current quote is approved, today's date) and get back
 * either "ok" or the plain reason a step is not available yet.
 */

export const TRANSITIONS: Record<CateringStatus, readonly CateringStatus[]> = {
  new: ["needs_details", "quoted", "lost", "canceled"],
  needs_details: ["quoted", "lost", "canceled"],
  quoted: ["accepted", "needs_details", "lost", "canceled"],
  accepted: ["confirmed", "quoted", "canceled"],
  confirmed: ["fulfilled", "canceled"],
  fulfilled: ["follow_up"],
  follow_up: [],
  // A closed request can be reopened; it goes back to collecting details.
  canceled: ["needs_details"],
  lost: ["needs_details"],
};

/** Deposit states that satisfy "the deposit question is settled" for confirming an event. */
export const DEPOSIT_SETTLED: readonly DepositStatus[] = ["recorded_unverified", "verified", "waived"];

/** Stages that count as an event still on the calendar (not canceled, not lost). */
export const ACTIVE_STATUSES: readonly CateringStatus[] = [
  "new",
  "needs_details",
  "quoted",
  "accepted",
  "confirmed",
  "fulfilled",
  "follow_up",
];

/** Stages where the request is still being worked on. */
export const OPEN_STATUSES: readonly CateringStatus[] = ["new", "needs_details", "quoted", "accepted", "confirmed"];

/** Stages from which the fulfillment pack exists. */
export const PACK_STATUSES: readonly CateringStatus[] = ["accepted", "confirmed", "fulfilled", "follow_up"];

/** Stages in which a new quote version may be written. Once confirmed, the quote is locked. */
export const QUOTE_EDITABLE_STATUSES: readonly CateringStatus[] = ["new", "needs_details", "quoted", "accepted"];

/** Stages in which the deposit can still be changed. Once confirmed, it is locked. */
export const DEPOSIT_EDITABLE_STATUSES: readonly CateringStatus[] = ["new", "needs_details", "quoted", "accepted"];

/** Stages in which the event details can still be edited. */
export const DETAILS_EDITABLE_STATUSES: readonly CateringStatus[] = OPEN_STATUSES;

/** Stages in which checklist items can be ticked. */
export const CHECKLIST_TICK_STATUSES: readonly CateringStatus[] = ["accepted", "confirmed", "fulfilled"];

export type TransitionBlock =
  | "same_status"
  | "not_allowed_from_here"
  | "needs_approved_quote"
  | "needs_deposit"
  | "event_not_yet"
  | "reason_required";

export type TransitionFacts = {
  status: CateringStatus;
  /** Calendar date of the event, `YYYY-MM-DD`. */
  eventDate: string;
  depositStatus: DepositStatus;
  /** True when the newest quote version exists and has been approved. */
  hasApprovedCurrentQuote: boolean;
  /** Today's calendar date in Cooper City, `YYYY-MM-DD`. */
  today: string;
};

export function requiresReason(to: CateringStatus): boolean {
  return to === "lost" || to === "canceled";
}

/**
 * Everything standing in the way of moving to `to`, not counting a missing reason.
 * An empty list means the step is available.
 */
export function transitionBlocks(facts: TransitionFacts, to: CateringStatus): TransitionBlock[] {
  if (facts.status === to) return ["same_status"];
  if (!TRANSITIONS[facts.status].includes(to)) return ["not_allowed_from_here"];

  const blocks: TransitionBlock[] = [];
  // A request is "quoted" or "accepted" only against a quote the owner has approved.
  if ((to === "quoted" || to === "accepted" || to === "confirmed") && !facts.hasApprovedCurrentQuote) {
    blocks.push("needs_approved_quote");
  }
  if (to === "confirmed" && !DEPOSIT_SETTLED.includes(facts.depositStatus)) blocks.push("needs_deposit");
  // ISO dates compare correctly as text. The event day itself counts.
  if (to === "fulfilled" && facts.today < facts.eventDate) blocks.push("event_not_yet");
  return blocks;
}

export type TransitionCheck = { ok: true } | { ok: false; code: TransitionBlock };

export function checkTransition(facts: TransitionFacts, to: CateringStatus, input: { reason?: string | null } = {}): TransitionCheck {
  const [first] = transitionBlocks(facts, to);
  if (first) return { ok: false, code: first };
  if (requiresReason(to) && !(input.reason ?? "").trim()) return { ok: false, code: "reason_required" };
  return { ok: true };
}

export type NextStep = { to: CateringStatus; blockedBy: TransitionBlock[]; needsReason: boolean };

/** The steps reachable from the current stage, each with what (if anything) blocks it. */
export function nextSteps(facts: TransitionFacts): NextStep[] {
  return TRANSITIONS[facts.status].map((to) => ({
    to,
    blockedBy: transitionBlocks(facts, to),
    needsReason: requiresReason(to),
  }));
}

// ---------------------------------------------------------------------------------------------
// Deposit
// ---------------------------------------------------------------------------------------------

/**
 * not_requested -> requested -> recorded_unverified, or waived. The reverse steps exist only to
 * correct a mistake. Nothing leads to "verified": that state is reserved for a real signal from
 * a payment provider, which does not exist yet, so a person can never set it.
 */
export const DEPOSIT_TRANSITIONS: Record<DepositStatus, readonly DepositStatus[]> = {
  not_requested: ["requested", "waived"],
  requested: ["recorded_unverified", "waived", "not_requested"],
  recorded_unverified: ["requested"],
  waived: ["not_requested"],
  verified: [],
};

export type DepositBlock =
  | "deposit_verified_reserved"
  | "deposit_same"
  | "deposit_not_allowed"
  | "deposit_locked"
  | "deposit_note_required";

export type DepositCheck = { ok: true } | { ok: false; code: DepositBlock };

export function checkDepositChange(
  facts: { status: CateringStatus; depositStatus: DepositStatus },
  to: DepositStatus,
  input: { note?: string | null } = {},
): DepositCheck {
  if (to === "verified") return { ok: false, code: "deposit_verified_reserved" };
  if (!DEPOSIT_EDITABLE_STATUSES.includes(facts.status)) return { ok: false, code: "deposit_locked" };
  if (facts.depositStatus === to) return { ok: false, code: "deposit_same" };
  if (!DEPOSIT_TRANSITIONS[facts.depositStatus].includes(to)) return { ok: false, code: "deposit_not_allowed" };
  // "Received" with no payment provider behind it needs a note saying how and who took it.
  if (to === "recorded_unverified" && !(input.note ?? "").trim()) return { ok: false, code: "deposit_note_required" };
  return { ok: true };
}

/** Deciding that no deposit is needed (or undoing that decision) is the owner's call. */
export function depositPermission(from: DepositStatus, to: DepositStatus): Permission {
  return to === "waived" || from === "waived" ? "catering.deposit.waive" : "catering.deposit.record";
}

/** Deposit changes on offer from the current state, in a sensible order for buttons. */
export function depositOptions(facts: { status: CateringStatus; depositStatus: DepositStatus }): DepositStatus[] {
  if (!DEPOSIT_EDITABLE_STATUSES.includes(facts.status)) return [];
  return [...DEPOSIT_TRANSITIONS[facts.depositStatus]];
}
