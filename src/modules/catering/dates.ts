import { isIsoDate } from "@/lib/time";

/**
 * Adds whole calendar months to a `YYYY-MM-DD` date, clamping to the last day of the target
 * month (Aug 31 + 6 months = Feb 28/29). Works on plain calendar dates, so daylight-saving
 * changes cannot shift the result.
 */
export function addMonthsToIsoDate(isoDate: string, months: number): string {
  if (!isIsoDate(isoDate)) throw new Error(`Invalid date: ${isoDate}`);
  const [y, m, d] = isoDate.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** How far ahead an event or follow-up date may be set. */
export const MAX_MONTHS_AHEAD = 18;
