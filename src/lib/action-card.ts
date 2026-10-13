/**
 * One thing that needs the owner's attention on the Today screen.
 *
 * Every card must be traceable: where the fact came from, how fresh it is, why it
 * matters, what to do next, and what we honestly do not know.
 */
export type ActionCard = {
  /** Stable id, e.g. "catering:new-inquiries". */
  id: string;
  module: "catering" | "growth" | "operations" | "business";
  /**
   * Higher = more urgent. Fixed bands keep ordering explainable:
   * 90s customer waiting on a reply · 70s time-bound follow-up · 50s public information problem
   * · 30s money question to review · 10s optional improvement.
   */
  priority: number;
  title: string;
  explanation: string;
  /** Where the underlying fact comes from, in plain words. */
  source: string;
  /** How recent the underlying fact is, in plain words. */
  freshness: string;
  /** "observed" = a recorded fact. "estimate" = calculated or assumed. */
  basis: "observed" | "estimate";
  /** What is missing or uncertain. Required for estimates. */
  uncertainty?: string;
  /** True when the card is built from sample data, never real business records. */
  synthetic?: boolean;
  nextAction: { label: string; href: string };
};
