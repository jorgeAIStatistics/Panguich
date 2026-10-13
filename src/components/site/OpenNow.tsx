"use client";

import { BUSINESS } from "@/content/business";
import { fill, siteCopy } from "@/content/site-copy";
import type { Locale } from "@/lib/i18n";
import { businessWallClock, formatClockTime, openStateAt, weekdayName } from "@/lib/time";
import { useBusinessMinute } from "./useBusinessMinute";

/** "Open now · until 7:00 PM", worked out in Cooper City time on the visitor's device. */
export function OpenNow({ locale }: { locale: Locale }) {
  const t = siteCopy(locale).open;
  const minute = useBusinessMinute();
  if (minute === null) {
    return (
      <span className="s-open">
        <span className="s-open__dot" aria-hidden="true" />
        {t.fallback}
      </span>
    );
  }
  const now = new Date(minute * 60_000);
  const state = openStateAt(now, BUSINESS.hours);
  let label: string = t.fallback;
  if (state.state === "open") {
    label = fill(t.openUntil, { time: formatClockTime(state.closesAt, locale) });
  } else if (state.opensAt && state.opensWeekday !== null) {
    const today = businessWallClock(now).weekday;
    label =
      state.opensWeekday === today
        ? fill(t.opensToday, { time: formatClockTime(state.opensAt, locale) })
        : fill(t.opensAt, { day: weekdayName(state.opensWeekday, locale), time: formatClockTime(state.opensAt, locale) });
  }
  return (
    <span className="s-open" data-state={state.state}>
      <span className="s-open__dot" aria-hidden="true" />
      {label}
    </span>
  );
}
