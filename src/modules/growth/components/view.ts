import type { CampaignStatus } from "@/db/schema";
import { can, type Role } from "@/lib/auth/permissions";
import type { Locale } from "@/lib/i18n";
import type { OwnerDict } from "@/lib/owner/i18n";
import type { CheckLevel } from "../checks";
import type { GrowthDict } from "../i18n";
import type { CampaignView } from "../service";

/** Everything a section of the campaign page needs to draw itself. */
export type GrowView = {
  view: CampaignView;
  t: GrowthDict;
  shared: OwnerDict;
  locale: Locale;
  /** What the signed-in role may do. Only decides what is offered; the server checks every action again. */
  perms: { edit: boolean; approve: boolean };
};

export function growPermissions(role: Role): GrowView["perms"] {
  return { edit: can(role, "growth.edit"), approve: can(role, "growth.approve") };
}

export const STATUS_BADGE: Record<CampaignStatus, string> = {
  draft: "o-badge--outline",
  pending_approval: "o-badge--warn",
  approved: "o-badge--ok",
  archived: "",
};

export const CHECK_NOTICE: Record<CheckLevel, string> = {
  block: "o-notice o-notice--danger",
  warn: "o-notice o-notice--warn",
  info: "o-notice",
};
