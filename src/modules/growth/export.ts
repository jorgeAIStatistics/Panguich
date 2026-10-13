import { CREATIVE_KINDS } from "@/db/schema";
import { LOCALES, type Locale } from "@/lib/i18n";
import { formatUsd } from "@/lib/money";
import { formatInstant } from "@/lib/time";
import { shortReference, type ApprovalPayload } from "./approval";
import type { CampaignCheck } from "./checks";
import { growthDict } from "./i18n";
import { datesPhrase, daysPhrase, longDate, windowPhrase } from "./schedule-text";
import { LINK_PLACEHOLDER } from "./templates";

/**
 * The export file: the drafts, the campaign link and notes, as plain Markdown text for the
 * owner to copy from. It is only ever a file download. Nothing here publishes or sends.
 *
 * The first line always says whether the exact content in the file is approved.
 */

/** The file header is always written in English first so it cannot be missed or mistranslated. */
export const EXPORT_DRAFT_HEADER = "DRAFT – NOT APPROVED";
export const EXPORT_APPROVED_HEADER = "APPROVED BY THE OWNER";

export type ExportInput = {
  payload: ApprovalPayload;
  payloadHash: string;
  /** Set only when the latest decision is an approval of exactly this content. */
  currentApproval: { decidedAt: Date; approverName: string } | null;
  isSynthetic: boolean;
  checks: readonly CampaignCheck[];
  locale: Locale;
  /** Where the public website is reachable, e.g. "http://localhost:3210". No trailing slash. */
  siteOrigin: string;
  /** True when the address above is just where the demonstration runs, not a decided domain. */
  siteOriginIsProvisional: boolean;
  exportedAt: Date;
};

export function buildExportBundle(input: ExportInput): { filename: string; body: string } {
  const { payload, locale } = input;
  const t = growthDict(locale);
  const approved = input.currentApproval !== null;
  const link = (language: Locale) => `${input.siteOrigin}${payload.landing[language]}`;
  const exportedAt = formatInstant(input.exportedAt, locale, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  const header = approved
    ? `# ${EXPORT_APPROVED_HEADER}${locale === "es" ? ` · ${t.export.approvedHeader}` : ""}`
    : `# ${EXPORT_DRAFT_HEADER}${locale === "es" ? ` · ${t.export.draftHeader}` : ""}`;

  const lines: string[] = [
    header,
    "",
    approved
      ? t.export.approvedLine(
          input.currentApproval!.approverName,
          formatInstant(input.currentApproval!.decidedAt, locale, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
          shortReference(input.payloadHash),
        )
      : t.export.draftLine,
    t.export.nothingPublished,
    ...(input.isSynthetic ? ["", t.export.sample] : []),
    "",
    `## ${t.export.campaign}`,
    "",
    `- ${t.preview.name}: ${payload.name}`,
    `- ${t.detail.code}: ${payload.code}`,
    `- ${t.preview.useCase}: ${t.useCase[payload.useCase].name}`,
    `- ${t.preview.objective}: ${t.objective[payload.objective]}`,
    `- ${t.preview.audience}: ${payload.audience || "—"}`,
    `- ${t.preview.when}: ${t.preview.whenValue(daysPhrase(payload.schedule.weekdays, locale), windowPhrase(payload.schedule, locale), datesPhrase(payload.schedule, locale))}`,
  ];

  if (payload.featuredItems.length > 0) {
    lines.push(`- ${t.preview.dishes}:`);
    for (const item of payload.featuredItems) {
      lines.push(
        item.name === null || item.priceCents === null
          ? `  - ${item.id} (${t.preview.unknownDish})`
          : `  - ${item.name} — ${formatUsd(item.priceCents, locale)} (${item.availability === "online" ? t.preview.online : t.preview.notOnline})`,
      );
    }
    lines.push(`  ${t.preview.dishesAsOf(longDate(payload.menuCheckedOn, locale))}`);
  } else {
    lines.push(`- ${t.preview.dishes}: ${t.preview.dishesNone}`);
  }

  if (payload.offer.type === "none") {
    lines.push(`- ${t.preview.offer}: ${t.preview.offerNone}`);
  } else {
    const offer = payload.offer;
    lines.push(
      `- ${t.preview.offer}: ${t.preview.offerLimited} — ${offer.description || t.preview.missing}`,
      `  - ${t.preview.offerApplies}: ${offer.eligibleItems.map((item) => item.name ?? item.id).join(", ") || t.preview.missing}`,
      `  - ${t.preview.offerExclusions}: ${offer.exclusions || t.preview.missing}`,
      `  - ${t.preview.offerLimit}: ${t.preview.offerLimitValue(offer.quantityLimit)}`,
      `  - ${t.preview.offerRedemption}: ${offer.redemptionControl || t.preview.missing}`,
      `  - ${t.preview.offerMargin}: ${offer.contributionMarginNote ?? t.preview.offerMarginUnknown}`,
    );
  }
  lines.push(
    `- ${t.preview.budget}: ${payload.budgetCents > 0 ? t.preview.budgetSome(formatUsd(payload.budgetCents, locale)) : t.preview.budgetNone}`,
    `- ${t.preview.channels}: ${payload.channels.map((entry) => `${t.detail.channels[entry.channel]} (${t.detail.channelState})`).join("; ")}`,
    `- ${t.export.exported}: ${exportedAt}`,
    "",
    `## ${t.export.linkTitle}`,
    "",
    ...LOCALES.map((language) => `- ${t.languages[language]}: ${link(language)}`),
    ...(input.siteOriginIsProvisional ? ["", t.export.linkDemoNote] : []),
    "",
    `## ${t.preview.tracking}`,
    "",
    payload.tracking[locale],
    "",
    `## ${t.export.notesTitle}`,
    "",
    `- ${t.export.noteEmail}`,
    `- ${t.export.noteFilming}`,
  );
  if (input.checks.length > 0) {
    lines.push(`- ${t.export.noteChecks}:`);
    for (const check of input.checks) lines.push(`  - [${t.detail.level[check.level]}] ${check.message}`);
  }

  lines.push("", `## ${t.export.textsTitle}`);
  for (const kind of CREATIVE_KINDS) {
    for (const language of LOCALES) {
      const creative = payload.creatives.find((entry) => entry.kind === kind && entry.locale === language);
      if (!creative) continue;
      const body = creative.body.split(LINK_PLACEHOLDER.en).join(link(language)).split(LINK_PLACEHOLDER.es).join(link(language));
      lines.push("", `### ${t.kinds[kind]} — ${t.languages[language]} (${t.origin[creative.origin]})`, "", body);
    }
  }
  lines.push("");

  const slug = payload.code.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  return { filename: `panguich-${slug}-${approved ? "approved" : "draft"}.md`, body: lines.join("\n") };
}
