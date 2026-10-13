import type { campaignApprovals, campaignCreatives, campaigns } from "@/db/schema";

export type Campaign = typeof campaigns.$inferSelect;
export type Creative = typeof campaignCreatives.$inferSelect;
export type Approval = typeof campaignApprovals.$inferSelect;

/** The parts of a campaign a person decides on. This, plus the creatives, is what gets approved. */
export type CampaignContent = Pick<
  Campaign,
  "code" | "name" | "useCase" | "objective" | "audience" | "offer" | "schedule" | "featuredItemIds" | "landingPath" | "budgetCents"
>;

/** One piece of draft text in one language. */
export type CreativeContent = Pick<Creative, "kind" | "locale" | "body" | "origin">;

export type GrowthErrorCode =
  | "not_found"
  /** The step is not available in the campaign's current state. */
  | "invalid_state"
  | "invalid_input"
  /** The planned spend could not be read as a dollar amount. Nothing is guessed from it. */
  | "invalid_budget"
  /** A check that must pass before approval is failing. */
  | "blocked_by_checks"
  /** What was on screen is no longer what is stored; the person must read it again. */
  | "changed_since_viewed"
  | "note_required";

/** A rule of the Grow module said no. Permission refusals use PermissionError instead. */
export class GrowthError extends Error {
  readonly code: GrowthErrorCode;
  constructor(code: GrowthErrorCode, message?: string) {
    super(message ?? code);
    this.name = "GrowthError";
    this.code = code;
  }
}
