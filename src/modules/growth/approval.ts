import { getMenuItem, MENU_CHECKED_ON, type MenuAvailability } from "@/content/menu";
import {
  CREATIVE_KINDS,
  type ApprovalDecision,
  type CampaignObjective,
  type CampaignSchedule,
  type CampaignStatus,
  type CampaignUseCase,
  type CreativeKind,
  type CreativeOrigin,
} from "@/db/schema";
import { LOCALES, type Bilingual, type Locale } from "@/lib/i18n";
import { canonicalJson, sha256Hex } from "./canonical";
import { growthDict } from "./i18n";
import { sortWeekdays } from "./schedule-text";
import { landingUrlPath } from "./templates";
import type { CampaignContent, CreativeContent } from "./types";

/**
 * What exactly is being approved.
 *
 * An approval is tied to the exact content: the plan, the dishes with their names and prices
 * as of the menu check date, the link, how results are counted, the spend, every text in both
 * languages, and the state of each channel. The content is turned into a stable fingerprint
 * (SHA-256 of canonical JSON). If anything in it changes afterwards, the fingerprint changes
 * and the approval no longer counts.
 *
 * Approving never publishes, sends or spends anything.
 */

/** No account is connected. A draft can only be exported for the owner to post. */
export const CHANNELS = ["instagram", "facebook", "email", "paid_ads"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_STATE = "not_connected_export_only" as const;

export type PayloadItem = {
  id: string;
  /** null when the dish is no longer on the verified menu. */
  name: string | null;
  priceCents: number | null;
  availability: MenuAvailability | "unknown";
};

export type PayloadOffer =
  | { type: "none" }
  | {
      type: "limited_test";
      description: string;
      eligibleItems: PayloadItem[];
      exclusions: string;
      quantityLimit: number | "no_limit" | null;
      redemptionControl: string;
      /** null = unknown. Shown as missing data, never guessed. */
      contributionMarginNote: string | null;
    };

export type ApprovalPayload = {
  version: 1;
  code: string;
  name: string;
  useCase: CampaignUseCase;
  objective: CampaignObjective;
  audience: string;
  offer: PayloadOffer;
  schedule: CampaignSchedule;
  featuredItems: PayloadItem[];
  /** The date the menu names, prices and availability were read from the restaurant's pages. */
  menuCheckedOn: string;
  /** Path on this website for each language, with the campaign code. */
  landing: Record<Locale, string>;
  tracking: Bilingual;
  budgetCents: number;
  creatives: Array<{ kind: CreativeKind; locale: Locale; body: string; origin: CreativeOrigin }>;
  channels: Array<{ channel: Channel; state: typeof CHANNEL_STATE }>;
};

function payloadItem(id: string): PayloadItem {
  const item = getMenuItem(id);
  return item
    ? { id, name: item.name, priceCents: item.priceCents, availability: item.availability }
    : { id, name: null, priceCents: null, availability: "unknown" };
}

/** The exact content an approval would cover, built the same way every time. */
export function buildApprovalPayload(campaign: CampaignContent, creatives: readonly CreativeContent[]): ApprovalPayload {
  const offer: PayloadOffer =
    campaign.offer.type === "limited_test"
      ? {
          type: "limited_test",
          description: campaign.offer.description ?? "",
          eligibleItems: (campaign.offer.eligibleItemIds ?? []).map(payloadItem),
          exclusions: campaign.offer.exclusions ?? "",
          quantityLimit: campaign.offer.quantityLimit ?? null,
          redemptionControl: campaign.offer.redemptionControl ?? "",
          contributionMarginNote: campaign.offer.contributionMarginNote?.trim() ? campaign.offer.contributionMarginNote : null,
        }
      : { type: "none" };

  // Texts in a fixed order (kind, then language) so their order in the database never matters.
  const ordered = CREATIVE_KINDS.flatMap((kind) =>
    LOCALES.flatMap((locale) => {
      const creative = creatives.find((c) => c.kind === kind && c.locale === locale);
      return creative ? [{ kind, locale, body: creative.body, origin: creative.origin }] : [];
    }),
  );

  return {
    version: 1,
    code: campaign.code,
    name: campaign.name,
    useCase: campaign.useCase,
    objective: campaign.objective,
    audience: campaign.audience,
    offer,
    schedule: {
      startsOn: campaign.schedule.startsOn,
      endsOn: campaign.schedule.endsOn,
      weekdays: sortWeekdays(campaign.schedule.weekdays),
      startTime: campaign.schedule.startTime,
      endTime: campaign.schedule.endTime,
    },
    featuredItems: campaign.featuredItemIds.map(payloadItem),
    menuCheckedOn: MENU_CHECKED_ON,
    landing: { en: landingUrlPath(campaign, "en"), es: landingUrlPath(campaign, "es") },
    tracking: { en: growthDict("en").tracking(campaign.code), es: growthDict("es").tracking(campaign.code) },
    budgetCents: campaign.budgetCents,
    creatives: ordered,
    channels: CHANNELS.map((channel) => ({ channel, state: CHANNEL_STATE })),
  };
}

/** Stable SHA-256 fingerprint of the content. Identical content always gives the same value. */
export function hashPayload(payload: ApprovalPayload | Record<string, unknown>): string {
  return sha256Hex(canonicalJson(payload));
}

/** A short form of the fingerprint that a person can read out: "3F2A-9C1B-77AA". */
export function shortReference(payloadHash: string): string {
  return (payloadHash.slice(0, 12).toUpperCase().match(/.{1,4}/g) ?? []).join("-");
}

/**
 * True only when the latest decision is an approval of exactly the content as it is now.
 * Re-hashes the current content, so any edit to the campaign, its texts, or the menu facts
 * behind it makes an earlier approval stop counting.
 */
export function isApprovalCurrent(
  campaign: CampaignContent & { status: CampaignStatus },
  creatives: readonly CreativeContent[],
  latestApproval: { decision: ApprovalDecision; payloadHash: string } | null | undefined,
): boolean {
  if (!latestApproval || latestApproval.decision !== "approved") return false;
  if (campaign.status !== "approved") return false;
  return latestApproval.payloadHash === hashPayload(buildApprovalPayload(campaign, creatives));
}
