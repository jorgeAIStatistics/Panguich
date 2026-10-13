import type { ExceptionStatus } from "@/db/schema";
import { can, type Role } from "@/lib/auth/permissions";
import type { Locale } from "@/lib/i18n";
import type { OwnerDict } from "@/lib/owner/i18n";
import type { OperationsDict } from "../i18n";
import type { ExceptionDetail } from "../service";

/** Everything a section of the exception page needs to draw itself. */
export type OpsView = {
  detail: ExceptionDetail;
  t: OperationsDict;
  shared: OwnerDict;
  locale: Locale;
  /** What the signed-in role may do. Only decides what is offered; the server checks every action again. */
  perms: { act: boolean; approve: boolean };
};

export function opsPermissions(role: Role): OpsView["perms"] {
  return { act: can(role, "operations.act"), approve: can(role, "operations.approve_dispute") };
}

export const STATUS_BADGE: Record<ExceptionStatus, string> = {
  suspected: "o-badge--warn",
  validated: "o-badge--info",
  dispute_approved: "o-badge--ink",
  credit_received: "o-badge--ok",
  cash_recovered: "o-badge--ok",
  dismissed: "",
};
