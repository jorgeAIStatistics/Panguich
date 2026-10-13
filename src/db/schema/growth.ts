import { boolean, index, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import type { Locale } from "@/lib/i18n";
import { users } from "./core";

const tz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const CAMPAIGN_USE_CASES = ["weekday_lunch", "weekend_breakfast", "catering"] as const;
export type CampaignUseCase = (typeof CAMPAIGN_USE_CASES)[number];

/** Each campaign drives one specific action. */
export const CAMPAIGN_OBJECTIVES = ["order_pickup", "directions", "catering_quote"] as const;
export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number];

export const CAMPAIGN_STATUSES = ["draft", "pending_approval", "approved", "archived"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** Default is no discount. A limited test must state its limits. */
export type CampaignOffer =
  | { type: "none" }
  | {
      type: "limited_test";
      description: string;
      eligibleItemIds: string[];
      exclusions: string;
      /** A whole number, the explicit choice "no_limit", or null when not stated yet (incomplete). */
      quantityLimit: number | "no_limit" | null;
      redemptionControl: string;
      /** Owner-entered assumption; null means unknown and must be shown as missing. */
      contributionMarginNote: string | null;
    };

export type CampaignSchedule = {
  startsOn: string; // YYYY-MM-DD
  endsOn: string;
  weekdays: number[]; // 0 = Sunday
  startTime: string; // HH:MM, Cooper City time
  endTime: string;
};

export const campaigns = pgTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    /** Short tracking code used on the landing link, e.g. LUNCH-OCT. Never personal data. */
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    useCase: text("use_case").$type<CampaignUseCase>().notNull(),
    objective: text("objective").$type<CampaignObjective>().notNull(),
    audience: text("audience").notNull().default(""),
    offer: jsonb("offer").$type<CampaignOffer>().notNull(),
    schedule: jsonb("schedule").$type<CampaignSchedule>().notNull(),
    /** Menu item ids featured in the creative (from content/menu). */
    featuredItemIds: jsonb("featured_item_ids").$type<string[]>().notNull(),
    /** Path on this website the campaign points at. */
    landingPath: text("landing_path").notNull(),
    /** Planned paid spend. 0 = organic only. Any spend needs owner approval. */
    budgetCents: integer("budget_cents").notNull().default(0),
    status: text("status").$type<CampaignStatus>().notNull().default("draft"),
    createdAt: tz("created_at").notNull().defaultNow(),
    updatedAt: tz("updated_at").notNull().defaultNow(),
    createdBy: text("created_by").references(() => users.id),
    /** Sample campaign created for the demonstration. Always labeled in the interface. */
    isSynthetic: boolean("is_synthetic").notNull().default(false),
  },
  (t) => [index("campaign_status_idx").on(t.status)],
);

export const CREATIVE_KINDS = ["caption", "reel_script", "shot_list", "email"] as const;
export type CreativeKind = (typeof CREATIVE_KINDS)[number];

/** template = generated from a fixed template; owner_edit = a person changed it. No AI drafts in Phase A. */
export type CreativeOrigin = "template" | "owner_edit";

export const campaignCreatives = pgTable(
  "campaign_creatives",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    kind: text("kind").$type<CreativeKind>().notNull(),
    locale: text("locale").$type<Locale>().notNull(),
    body: text("body").notNull(),
    origin: text("origin").$type<CreativeOrigin>().notNull().default("template"),
    updatedAt: tz("updated_at").notNull().defaultNow(),
    updatedBy: text("updated_by"),
  },
  (t) => [unique("campaign_creative_uq").on(t.campaignId, t.kind, t.locale)],
);

export type ApprovalDecision = "approved" | "changes_requested" | "revoked";

/**
 * What exactly was approved, by whom, when. The payload is the exact content shown at approval
 * time; payloadHash lets us detect that the campaign changed afterwards (stale approval).
 */
export const campaignApprovals = pgTable(
  "campaign_approvals",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    decidedAt: tz("decided_at").notNull().defaultNow(),
    actorId: text("actor_id").notNull(),
    actorRole: text("actor_role").notNull(),
    decision: text("decision").$type<ApprovalDecision>().notNull(),
    payloadHash: text("payload_hash").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    note: text("note"),
  },
  (t) => [index("campaign_approval_idx").on(t.campaignId, t.decidedAt)],
);
