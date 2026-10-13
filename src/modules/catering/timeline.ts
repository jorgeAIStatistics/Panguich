import type { CateringStatus, ConsentChannel, DepositStatus, InquirySource } from "@/db/schema";
import type { Locale } from "@/lib/i18n";
import { formatIsoDate, isIsoDate } from "@/lib/time";
import type { CateringDict } from "./i18n";
import type { Activity, Person } from "./service";

/**
 * Turns a stored timeline row into a sentence in the reader's language.
 * `detail` is text a person typed (a note, a reason). It is shown as written, never interpreted.
 */
export type TimelineLine = { headline: string; detail: string | null };

function has<T extends object>(table: T, key: string | null): key is Extract<keyof T, string> {
  return key !== null && key in table;
}

export function describeActivity(activity: Activity, t: CateringDict, locale: Locale, people: readonly Person[]): TimelineLine {
  const person = activity.actorId ? people.find((p) => p.id === activity.actorId) : undefined;
  const who = person?.name ?? (activity.actorId ? t.timeline.someone : t.timeline.visitor);
  const status = (value: string | null) => (has(t.status, value) ? t.status[value as CateringStatus] : (value ?? ""));
  const deposit = (value: string | null) => (has(t.deposit, value) ? t.deposit[value as DepositStatus] : (value ?? ""));
  const note = activity.note;

  switch (activity.kind) {
    case "created": {
      const source = has(t.sources, note) ? t.sources[note as InquirySource] : "";
      return { headline: activity.actorId ? t.timeline.createdByTeam(who, source) : t.timeline.created(who, source), detail: null };
    }
    case "status_change":
      return { headline: t.timeline.status_change(who, status(activity.fromStatus), status(activity.toStatus)), detail: note };
    case "note":
      return { headline: t.timeline.note(who), detail: note };
    case "follow_up_set":
      return { headline: t.timeline.follow_up_set(who, note && isIsoDate(note) ? formatIsoDate(note, locale) : (note ?? "")), detail: null };
    case "follow_up_cleared":
      return { headline: t.timeline.follow_up_cleared(who), detail: null };
    case "assigned":
      return { headline: t.timeline.assigned(who, people.find((p) => p.id === note)?.name ?? t.timeline.someone), detail: null };
    case "unassigned":
      return { headline: t.timeline.unassigned(who), detail: null };
    case "deposit_change":
      return { headline: t.timeline.deposit_change(who, deposit(activity.fromStatus), deposit(activity.toStatus)), detail: note };
    case "quote_created":
      return { headline: t.timeline.quote_created(who, note ?? ""), detail: null };
    case "quote_approved":
      return { headline: t.timeline.quote_approved(who, note ?? ""), detail: null };
    case "checklist_built":
      return { headline: t.timeline.checklist_built(note ?? "0"), detail: null };
    case "details_updated": {
      const fields = (note ?? "")
        .split(",")
        .filter(Boolean)
        .map((field) => t.timeline.fields[field] ?? field)
        .join(", ");
      return { headline: t.timeline.details_updated(who, fields), detail: null };
    }
    case "unsubscribed":
      return {
        headline: t.timeline.unsubscribed(who, has(t.consent.channel, note) ? t.consent.channel[note as ConsentChannel] : (note ?? "")),
        detail: null,
      };
    default:
      return { headline: t.timeline.other(who), detail: null };
  }
}
