import { BUSINESS } from "@/content/business";
import type { CampaignSchedule } from "@/db/schema";
import { intlLocale, type Locale } from "@/lib/i18n";
import { formatClockTime, formatIsoDate, weekdayName, type Weekday } from "@/lib/time";

/** Monday first, the way a restaurant week is usually read. */
const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/** Valid weekdays only, without repeats, Monday first. */
export function sortWeekdays(weekdays: readonly number[]): Weekday[] {
  return WEEK_ORDER.filter((day) => weekdays.includes(day));
}

export function joinList(parts: readonly string[], locale: Locale): string {
  return new Intl.ListFormat(intlLocale(locale), { style: "long", type: "conjunction" }).format(parts);
}

/**
 * The selected days in plain words: "Monday to Friday" / "de lunes a viernes",
 * "Saturday and Sunday" / "sábados y domingos", "every day" / "todos los días".
 */
export function daysPhrase(weekdays: readonly number[], locale: Locale): string {
  const days = sortWeekdays(weekdays);
  if (days.length === 0) return locale === "es" ? "sin días elegidos" : "no days chosen";
  if (days.length === 7) return locale === "es" ? "todos los días" : "every day";
  const positions = days.map((day) => WEEK_ORDER.indexOf(day));
  const consecutive = positions.every((position, index) => index === 0 || position === positions[index - 1] + 1);
  if (consecutive && days.length >= 3) {
    const first = weekdayName(days[0], locale);
    const last = weekdayName(days[days.length - 1], locale);
    return locale === "es" ? `de ${first} a ${last}` : `${first} to ${last}`;
  }
  const names = days.map((day) => {
    const name = weekdayName(day, locale);
    // In Spanish a repeating day is plural; only sábado and domingo change.
    return locale === "es" && (day === 6 || day === 0) ? `${name}s` : name;
  });
  return joinList(names, locale);
}

/** "11:00 AM – 2:00 PM" */
export function windowPhrase(schedule: Pick<CampaignSchedule, "startTime" | "endTime">, locale: Locale): string {
  return `${formatClockTime(schedule.startTime, locale)} – ${formatClockTime(schedule.endTime, locale)}`;
}

/** "Oct 19, 2026 – Nov 15, 2026" */
export function datesPhrase(schedule: Pick<CampaignSchedule, "startsOn" | "endsOn">, locale: Locale): string {
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return `${formatIsoDate(schedule.startsOn, locale, options)} – ${formatIsoDate(schedule.endsOn, locale, options)}`;
}

export function longDate(isoDate: string, locale: Locale): string {
  return formatIsoDate(isoDate, locale, { month: "long", day: "numeric", year: "numeric" });
}

/**
 * The verified opening hours in one line, days with the same hours grouped:
 * "Monday to Saturday 8:00 AM – 7:00 PM; Sunday 8:00 AM – 5:00 PM".
 */
export function publishedHoursPhrase(locale: Locale): string {
  const groups: Array<{ days: Weekday[]; open: string; close: string }> = [];
  for (const day of WEEK_ORDER) {
    const hours = BUSINESS.hours[day];
    if (!hours) continue;
    const last = groups[groups.length - 1];
    if (last && last.open === hours.open && last.close === hours.close) last.days.push(day);
    else groups.push({ days: [day], open: hours.open, close: hours.close });
  }
  return groups
    .map((group) => {
      const days = group.days.length === 1 ? weekdayName(group.days[0], locale) : daysPhrase(group.days, locale);
      return `${days} ${windowPhrase({ startTime: group.open, endTime: group.close }, locale)}`;
    })
    .join("; ");
}
