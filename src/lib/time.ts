import { intlLocale, type Locale } from "./i18n";

/** The restaurant runs on Eastern time, including daylight-saving changes. */
export const BUSINESS_TZ = "America/New_York";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export type WallClock = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  weekday: Weekday;
};

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The wall-clock time in Cooper City for a given instant. */
export function businessWallClock(instant: Date): WallClock {
  const parts = Object.fromEntries(partsFormatter.formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday) as Weekday,
  };
}

/** Calendar date in Cooper City as YYYY-MM-DD. */
export function businessDateString(instant: Date): string {
  const w = businessWallClock(instant);
  return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

export function isClockTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Weekday (0 = Sunday) of a calendar date, independent of any time zone. */
export function weekdayOfIsoDate(isoDate: string): Weekday {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() as Weekday;
}

/** Whole days from one calendar date to another (positive when `to` is later). */
export function daysBetweenIsoDates(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Converts a Cooper City wall-clock date + time into the matching instant.
 *
 * Daylight saving makes two edge cases:
 *  - a time that does not exist (2:30 AM on the spring-forward day) resolves to the
 *    instant one hour later on the clock (3:30 AM), and `adjusted` is true;
 *  - a time that happens twice (1:30 AM on the fall-back day) resolves to the first
 *    occurrence, and `ambiguous` is true.
 */
export function businessWallTimeToInstant(
  isoDate: string,
  clockTime: string,
): { instant: Date; adjusted: boolean; ambiguous: boolean } {
  if (!isIsoDate(isoDate) || !isClockTime(clockTime)) {
    throw new Error(`Invalid business date/time: ${isoDate} ${clockTime}`);
  }
  const [y, m, d] = isoDate.split("-").map(Number);
  const [hh, mm] = clockTime.split(":").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);

  const matches: number[] = [];
  // Eastern time is UTC-5 or UTC-4; probe both offsets.
  for (const offsetHours of [4, 5]) {
    const candidate = asUtc + offsetHours * 3_600_000;
    const w = businessWallClock(new Date(candidate));
    if (w.year === y && w.month === m && w.day === d && w.hour === hh && w.minute === mm) {
      matches.push(candidate);
    }
  }
  if (matches.length === 0) {
    // Nonexistent local time: clocks skipped it. Use standard-time offset, which lands one hour later on the clock.
    return { instant: new Date(asUtc + 5 * 3_600_000), adjusted: true, ambiguous: false };
  }
  return { instant: new Date(Math.min(...matches)), adjusted: false, ambiguous: matches.length > 1 };
}

export type DayHours = { open: string; close: string } | null; // "HH:MM" 24h, null = closed
export type WeeklyHours = Record<Weekday, DayHours>;

function minutesOf(clockTime: string): number {
  const [h, m] = clockTime.split(":").map(Number);
  return h * 60 + m;
}

export type OpenState =
  | { state: "open"; closesAt: string }
  | { state: "closed"; opensAt: string | null; opensWeekday: Weekday | null };

/** Whether the restaurant is open at an instant, using Cooper City wall-clock hours. */
export function openStateAt(instant: Date, hours: WeeklyHours): OpenState {
  const now = businessWallClock(instant);
  const nowMinutes = now.hour * 60 + now.minute;
  const today = hours[now.weekday];
  if (today && nowMinutes >= minutesOf(today.open) && nowMinutes < minutesOf(today.close)) {
    return { state: "open", closesAt: today.close };
  }
  if (today && nowMinutes < minutesOf(today.open)) {
    return { state: "closed", opensAt: today.open, opensWeekday: now.weekday };
  }
  for (let step = 1; step <= 7; step += 1) {
    const weekday = ((now.weekday + step) % 7) as Weekday;
    const next = hours[weekday];
    if (next) return { state: "closed", opensAt: next.open, opensWeekday: weekday };
  }
  return { state: "closed", opensAt: null, opensWeekday: null };
}

/** "8:00 AM" style label for a 24h "HH:MM" string. */
export function formatClockTime(clockTime: string, locale: Locale = "en"): string {
  const [h, m] = clockTime.split(":").map(Number);
  return new Intl.DateTimeFormat(intlLocale(locale), { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, 0, 1, h, m)),
  );
}

export function formatIsoDate(
  isoDate: string,
  locale: Locale = "en",
  options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" },
): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(intlLocale(locale), { ...options, timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** Formats an instant in Cooper City time. */
export function formatInstant(
  instant: Date,
  locale: Locale = "en",
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { ...options, timeZone: BUSINESS_TZ }).format(instant);
}

export function weekdayName(weekday: Weekday, locale: Locale = "en", style: "long" | "short" = "long"): string {
  // 2023-01-01 was a Sunday.
  return new Intl.DateTimeFormat(intlLocale(locale), { weekday: style, timeZone: "UTC" }).format(
    new Date(Date.UTC(2023, 0, 1 + weekday)),
  );
}

/** "2 hours ago" / "hace 2 horas" for freshness labels. */
export function formatRelative(instant: Date, now: Date, locale: Locale = "en"): string {
  const seconds = Math.round((instant.getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(Math.trunc(seconds), "second");
  if (abs < 3600) return rtf.format(Math.trunc(seconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.trunc(seconds / 3600), "hour");
  return rtf.format(Math.trunc(seconds / 86_400), "day");
}
