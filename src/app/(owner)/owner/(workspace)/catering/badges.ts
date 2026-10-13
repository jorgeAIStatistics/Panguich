import type { CateringStatus, DepositStatus } from "@/db/schema";

/** Badge color per stage. The stage name is always written out, so color is never the only signal. */
export const STAGE_BADGE: Record<CateringStatus, string> = {
  new: "o-badge--warn",
  needs_details: "o-badge--warn",
  quoted: "o-badge--info",
  accepted: "o-badge--info",
  confirmed: "o-badge--ok",
  fulfilled: "o-badge--ink",
  follow_up: "o-badge--outline",
  canceled: "",
  lost: "",
};

export const DEPOSIT_BADGE: Record<DepositStatus, string> = {
  not_requested: "o-badge--outline",
  requested: "o-badge--info",
  // Amber on purpose: someone says it was received, but no payment provider confirmed it.
  recorded_unverified: "o-badge--warn",
  verified: "o-badge--ok",
  waived: "o-badge--outline",
};
