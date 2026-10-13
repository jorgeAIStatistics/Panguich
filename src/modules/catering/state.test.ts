import { describe, expect, it } from "vitest";
import { CATERING_STATUSES, DEPOSIT_STATUSES, type CateringStatus, type DepositStatus } from "@/db/schema";
import {
  checkDepositChange,
  checkTransition,
  depositOptions,
  depositPermission,
  nextSteps,
  transitionBlocks,
  TRANSITIONS,
  type TransitionFacts,
} from "./state";

/** Facts with every guard satisfied, so a refusal can only come from the transition table. */
function facts(status: CateringStatus, overrides: Partial<TransitionFacts> = {}): TransitionFacts {
  return { status, eventDate: "2026-11-20", depositStatus: "waived", hasApprovedCurrentQuote: true, today: "2026-11-20", ...overrides };
}

describe("pipeline transitions", () => {
  const expected: Record<CateringStatus, CateringStatus[]> = {
    new: ["needs_details", "quoted", "lost", "canceled"],
    needs_details: ["quoted", "lost", "canceled"],
    quoted: ["accepted", "needs_details", "lost", "canceled"],
    accepted: ["confirmed", "quoted", "canceled"],
    confirmed: ["fulfilled", "canceled"],
    fulfilled: ["follow_up"],
    follow_up: [],
    canceled: ["needs_details"],
    lost: ["needs_details"],
  };

  it("allows exactly the documented steps and refuses every other pair", () => {
    for (const from of CATERING_STATUSES) {
      for (const to of CATERING_STATUSES) {
        const result = checkTransition(facts(from), to, { reason: "because" });
        if (from === to) expect(result, `${from} -> ${to}`).toEqual({ ok: false, code: "same_status" });
        else if (expected[from].includes(to)) expect(result, `${from} -> ${to}`).toEqual({ ok: true });
        else expect(result, `${from} -> ${to}`).toEqual({ ok: false, code: "not_allowed_from_here" });
      }
    }
    expect(TRANSITIONS).toEqual(expected);
  });

  it("cannot skip ahead", () => {
    expect(checkTransition(facts("new"), "confirmed")).toEqual({ ok: false, code: "not_allowed_from_here" });
    expect(checkTransition(facts("quoted"), "fulfilled")).toEqual({ ok: false, code: "not_allowed_from_here" });
    expect(checkTransition(facts("follow_up"), "new")).toEqual({ ok: false, code: "not_allowed_from_here" });
  });

  it("needs an approved current quote to be quoted, accepted or confirmed", () => {
    const noQuote = { hasApprovedCurrentQuote: false };
    expect(checkTransition(facts("new", noQuote), "quoted")).toEqual({ ok: false, code: "needs_approved_quote" });
    expect(checkTransition(facts("needs_details", noQuote), "quoted")).toEqual({ ok: false, code: "needs_approved_quote" });
    expect(checkTransition(facts("quoted", noQuote), "accepted")).toEqual({ ok: false, code: "needs_approved_quote" });
    expect(checkTransition(facts("accepted", noQuote), "confirmed")).toEqual({ ok: false, code: "needs_approved_quote" });
    // Steps that do not depend on a quote stay open.
    expect(checkTransition(facts("new", noQuote), "needs_details")).toEqual({ ok: true });
    expect(checkTransition(facts("quoted", noQuote), "needs_details")).toEqual({ ok: true });
  });

  it("needs the deposit settled to confirm", () => {
    const outcome = (depositStatus: DepositStatus) => checkTransition(facts("accepted", { depositStatus }), "confirmed");
    expect(outcome("not_requested")).toEqual({ ok: false, code: "needs_deposit" });
    expect(outcome("requested")).toEqual({ ok: false, code: "needs_deposit" });
    expect(outcome("recorded_unverified")).toEqual({ ok: true });
    expect(outcome("verified")).toEqual({ ok: true });
    expect(outcome("waived")).toEqual({ ok: true });
  });

  it("reports every missing condition for confirming", () => {
    expect(transitionBlocks(facts("accepted", { depositStatus: "requested", hasApprovedCurrentQuote: false }), "confirmed")).toEqual([
      "needs_approved_quote",
      "needs_deposit",
    ]);
  });

  it("marks an event completed only on or after its date", () => {
    const on = (today: string) => checkTransition(facts("confirmed", { eventDate: "2026-11-01", today }), "fulfilled");
    expect(on("2026-10-31")).toEqual({ ok: false, code: "event_not_yet" });
    expect(on("2026-11-01")).toEqual({ ok: true });
    expect(on("2026-11-02")).toEqual({ ok: true });
  });

  it("needs a reason to cancel or mark as lost", () => {
    expect(checkTransition(facts("new"), "lost")).toEqual({ ok: false, code: "reason_required" });
    expect(checkTransition(facts("new"), "canceled", { reason: "   " })).toEqual({ ok: false, code: "reason_required" });
    expect(checkTransition(facts("confirmed"), "canceled", { reason: "Customer moved the party" })).toEqual({ ok: true });
    expect(checkTransition(facts("new"), "needs_details")).toEqual({ ok: true });
  });

  it("lists the next steps with what blocks each one", () => {
    const steps = nextSteps(facts("accepted", { depositStatus: "requested" }));
    expect(steps).toEqual([
      { to: "confirmed", blockedBy: ["needs_deposit"], needsReason: false },
      { to: "quoted", blockedBy: [], needsReason: false },
      { to: "canceled", blockedBy: [], needsReason: true },
    ]);
    expect(nextSteps(facts("follow_up"))).toEqual([]);
  });
});

describe("deposit", () => {
  const open = (depositStatus: DepositStatus) => ({ status: "accepted" as const, depositStatus });

  it("can never be set to verified by a person, from any state or stage", () => {
    for (const status of CATERING_STATUSES) {
      for (const depositStatus of DEPOSIT_STATUSES) {
        expect(checkDepositChange({ status, depositStatus }, "verified", { note: "paid, trust me" })).toEqual({
          ok: false,
          code: "deposit_verified_reserved",
        });
      }
    }
    for (const depositStatus of DEPOSIT_STATUSES) expect(depositOptions(open(depositStatus))).not.toContain("verified");
  });

  it("follows not requested -> requested -> noted as received, or waived", () => {
    expect(checkDepositChange(open("not_requested"), "requested")).toEqual({ ok: true });
    expect(checkDepositChange(open("requested"), "recorded_unverified", { note: "Cash, taken by Ana" })).toEqual({ ok: true });
    expect(checkDepositChange(open("not_requested"), "waived")).toEqual({ ok: true });
    expect(checkDepositChange(open("requested"), "waived")).toEqual({ ok: true });
    // Not straight to "received" without having asked for it.
    expect(checkDepositChange(open("not_requested"), "recorded_unverified", { note: "x" })).toEqual({ ok: false, code: "deposit_not_allowed" });
    expect(checkDepositChange(open("requested"), "requested")).toEqual({ ok: false, code: "deposit_same" });
  });

  it("needs a note to say a deposit was received", () => {
    expect(checkDepositChange(open("requested"), "recorded_unverified")).toEqual({ ok: false, code: "deposit_note_required" });
    expect(checkDepositChange(open("requested"), "recorded_unverified", { note: "  " })).toEqual({ ok: false, code: "deposit_note_required" });
  });

  it("is locked once the event is confirmed or closed", () => {
    for (const status of ["confirmed", "fulfilled", "follow_up", "canceled", "lost"] as const) {
      expect(checkDepositChange({ status, depositStatus: "requested" }, "waived")).toEqual({ ok: false, code: "deposit_locked" });
      expect(depositOptions({ status, depositStatus: "requested" })).toEqual([]);
    }
  });

  it("asks for the owner's permission to waive or to undo a waiver", () => {
    expect(depositPermission("not_requested", "waived")).toBe("catering.deposit.waive");
    expect(depositPermission("waived", "not_requested")).toBe("catering.deposit.waive");
    expect(depositPermission("not_requested", "requested")).toBe("catering.deposit.record");
    expect(depositPermission("requested", "recorded_unverified")).toBe("catering.deposit.record");
  });
});
