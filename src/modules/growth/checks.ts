import { BUSINESS, KNOWN_CONFLICTS } from "@/content/business";
import { getMenuItem, MENU_CHECKED_ON } from "@/content/menu";
import { CREATIVE_KINDS, type CampaignOffer } from "@/db/schema";
import { LOCALES, type Locale } from "@/lib/i18n";
import { formatUsd } from "@/lib/money";
import { formatClockTime, isClockTime, isIsoDate, weekdayName } from "@/lib/time";
import { growthDict } from "./i18n";
import { joinList, longDate, sortWeekdays, windowPhrase } from "./schedule-text";
import { LINK_PLACEHOLDER } from "./templates";
import type { CampaignContent, CreativeContent } from "./types";

/**
 * Deterministic checks on a campaign before anyone approves it.
 *
 * Pure: the same campaign, texts, language and date always give the same list. The checks use
 * only verified facts from content/business and content/menu. They are shown on the campaign
 * page and run again at the moment of approval.
 *
 *   block — approval is refused until it is fixed
 *   warn  — the owner should look before approving
 *   info  — good to know
 */
export type CheckLevel = "block" | "warn" | "info";

export type CheckCode =
  | "no_days"
  | "bad_window"
  | "outside_hours"
  | "sunday_close_conflict"
  | "not_online"
  | "unknown_item"
  | "dates_reversed"
  | "already_ended"
  | "budget_set"
  | "offer_incomplete"
  | "margin_unknown"
  | "creative_empty"
  | "link_missing";

export type CampaignCheck = { level: CheckLevel; code: CheckCode; message: string };

/**
 * One public page shows Sunday closing at 4:00 PM while two show 5:00 PM (see KNOWN_CONFLICTS,
 * "sunday-close"). Until the owner settles it, anything promoted past 4:00 PM on a Sunday
 * gets a warning.
 */
export const SUNDAY_EARLIEST_PUBLISHED_CLOSE = "16:00";

type LimitedTest = Extract<CampaignOffer, { type: "limited_test" }>;

/** Which required parts of a limited test are still missing. Empty = complete. */
export function missingOfferParts(offer: LimitedTest): Array<"description" | "eligible" | "exclusions" | "limit" | "redemption"> {
  const missing: Array<"description" | "eligible" | "exclusions" | "limit" | "redemption"> = [];
  if (!offer.description?.trim()) missing.push("description");
  if (!Array.isArray(offer.eligibleItemIds) || offer.eligibleItemIds.length === 0) missing.push("eligible");
  if (!offer.exclusions?.trim()) missing.push("exclusions");
  const limit = offer.quantityLimit;
  if (!(limit === "no_limit" || (typeof limit === "number" && Number.isSafeInteger(limit) && limit > 0))) missing.push("limit");
  if (!offer.redemptionControl?.trim()) missing.push("redemption");
  return missing;
}

export function runCampaignChecks(
  campaign: CampaignContent,
  creatives: readonly CreativeContent[],
  locale: Locale,
  /** Today's calendar date in Cooper City, YYYY-MM-DD. */
  today: string,
): CampaignCheck[] {
  const t = growthDict(locale).checks;
  const names = growthDict(locale);
  const checks: CampaignCheck[] = [];
  const { schedule } = campaign;
  const days = sortWeekdays(schedule.weekdays);

  // --- When: dates ---
  const datesValid = isIsoDate(schedule.startsOn) && isIsoDate(schedule.endsOn);
  if (!datesValid || schedule.endsOn < schedule.startsOn) {
    checks.push({ level: "block", code: "dates_reversed", message: t.datesReversed });
  } else if (schedule.endsOn < today) {
    checks.push({ level: "block", code: "already_ended", message: t.alreadyEnded(longDate(schedule.endsOn, locale)) });
  }

  // --- When: days and hours, against the verified opening hours ---
  const windowValid = isClockTime(schedule.startTime) && isClockTime(schedule.endTime) && schedule.startTime < schedule.endTime;
  if (days.length === 0) checks.push({ level: "block", code: "no_days", message: t.noDays });
  if (!windowValid) {
    checks.push({ level: "block", code: "bad_window", message: t.badWindow });
  } else {
    const outside = days.flatMap((day) => {
      const hours = BUSINESS.hours[day];
      const name = weekdayName(day, locale);
      if (!hours) return [t.closedDay(name)];
      if (schedule.startTime < hours.open || schedule.endTime > hours.close) {
        return [t.openDay(name, windowPhrase({ startTime: hours.open, endTime: hours.close }, locale))];
      }
      return [];
    });
    if (outside.length > 0) {
      checks.push({ level: "block", code: "outside_hours", message: t.outsideHours(windowPhrase(schedule, locale), joinList(outside, locale)) });
    }
    const sundayConflict = KNOWN_CONFLICTS.find((conflict) => conflict.id === "sunday-close");
    if (sundayConflict && days.includes(0) && schedule.endTime > SUNDAY_EARLIEST_PUBLISHED_CLOSE) {
      checks.push({
        level: "warn",
        code: "sunday_close_conflict",
        message: t.sundayConflict(formatClockTime(schedule.endTime, locale), sundayConflict.detail[locale]),
      });
    }
  }

  // --- What: dishes ---
  const unknown = campaign.featuredItemIds.filter((id) => !getMenuItem(id));
  if (unknown.length > 0) checks.push({ level: "block", code: "unknown_item", message: t.unknownItem(unknown.join(", ")) });
  if (campaign.objective === "order_pickup") {
    const notOnline = campaign.featuredItemIds
      .map(getMenuItem)
      .filter((item) => item && item.availability !== "online")
      .map((item) => item!.name);
    if (notOnline.length > 0) {
      checks.push({ level: "warn", code: "not_online", message: t.notOnline(joinList(notOnline, locale), longDate(MENU_CHECKED_ON, locale)) });
    }
  }

  // --- Offer ---
  if (campaign.offer.type === "limited_test") {
    const missing = missingOfferParts(campaign.offer);
    if (missing.length > 0) {
      checks.push({ level: "block", code: "offer_incomplete", message: t.offerIncomplete(joinList(missing.map((part) => t.offerParts[part]), locale)) });
    }
    const unknownEligible = (campaign.offer.eligibleItemIds ?? []).filter((id) => !getMenuItem(id));
    if (unknownEligible.length > 0 && unknown.length === 0) {
      checks.push({ level: "block", code: "unknown_item", message: t.unknownItem(unknownEligible.join(", ")) });
    }
    if (!campaign.offer.contributionMarginNote?.trim()) {
      checks.push({ level: "warn", code: "margin_unknown", message: t.marginUnknown });
    }
  }

  // --- Spend ---
  if (campaign.budgetCents > 0) {
    checks.push({ level: "warn", code: "budget_set", message: t.budgetSet(formatUsd(campaign.budgetCents, locale)) });
  }

  // --- Texts ---
  const label = (creative: Pick<CreativeContent, "kind" | "locale">) => `${names.kinds[creative.kind]} (${names.languages[creative.locale]})`;
  const required = CREATIVE_KINDS.flatMap((kind) => LOCALES.map((language) => ({ kind, locale: language })));
  const empty = required.filter((slot) => !creatives.find((c) => c.kind === slot.kind && c.locale === slot.locale)?.body.trim());
  if (empty.length > 0) {
    checks.push({ level: "block", code: "creative_empty", message: t.creativeEmpty(joinList(empty.map(label), locale)) });
  }
  // Captions and emails are what people tap. Without the link, their taps cannot be counted.
  const withoutLink = creatives.filter(
    (creative) => (creative.kind === "caption" || creative.kind === "email") && creative.body.trim() && !creative.body.includes(LINK_PLACEHOLDER[creative.locale]),
  );
  if (withoutLink.length > 0) {
    checks.push({
      level: "info",
      code: "link_missing",
      message: t.linkMissing(joinList(withoutLink.map(label), locale), joinList([...new Set(withoutLink.map((c) => LINK_PLACEHOLDER[c.locale]))], locale)),
    });
  }

  const order: Record<CheckLevel, number> = { block: 0, warn: 1, info: 2 };
  return checks.sort((a, b) => order[a.level] - order[b.level]);
}

export function hasBlockingCheck(checks: readonly CampaignCheck[]): boolean {
  return checks.some((check) => check.level === "block");
}
