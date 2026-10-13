import { can, type Role } from "@/lib/auth/permissions";
import type { Locale } from "@/lib/i18n";
import type { CateringDict } from "../i18n";
import type { InquiryDetail } from "../service";

/**
 * What the role may do on a request. Used only to decide which forms to draw: every action is
 * checked again on the server by the service functions, so hiding a form is never the control.
 */
export type DetailPermissions = {
  manage: boolean;
  fulfill: boolean;
  approveQuote: boolean;
  recordDeposit: boolean;
  waiveDeposit: boolean;
};

export function detailPermissions(role: Role): DetailPermissions {
  return {
    manage: can(role, "catering.manage"),
    fulfill: can(role, "catering.fulfill"),
    approveQuote: can(role, "catering.quote.approve"),
    recordDeposit: can(role, "catering.deposit.record"),
    waiveDeposit: can(role, "catering.deposit.waive"),
  };
}

/** Sections of the request page that can show the result of an action right where it happened. */
export const DETAIL_SECTIONS = ["stage", "quote", "deposit", "assign", "pack", "consent", "history"] as const;
export type DetailSection = (typeof DETAIL_SECTIONS)[number];

/** The result of the last action: already-translated words, and the section it belongs to. */
export type Flash = { tone: "ok" | "danger"; text: string; at: DetailSection | null };

export type DetailView = {
  detail: InquiryDetail;
  t: CateringDict;
  locale: Locale;
  perms: DetailPermissions;
  flash?: Flash | null;
};

export function toDetailSection(value: string | undefined): DetailSection | null {
  return DETAIL_SECTIONS.find((section) => section === value) ?? null;
}

export function personName(view: Pick<DetailView, "detail" | "t">, id: string | null): string {
  if (!id) return view.t.timeline.someone;
  return view.detail.people.find((person) => person.id === id)?.name ?? view.t.timeline.someone;
}
