"use client";

import { BUSINESS } from "@/content/business";
import { siteCopy } from "@/content/site-copy";
import type { Locale } from "@/lib/i18n";
import { businessWallClock, formatClockTime, weekdayName, type Weekday } from "@/lib/time";
import { useBusinessMinute } from "./useBusinessMinute";

const ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export function HoursTable({ locale }: { locale: Locale }) {
  const t = siteCopy(locale).visit;
  const minute = useBusinessMinute();
  const today = minute === null ? null : businessWallClock(new Date(minute * 60_000)).weekday;
  return (
    <table className="s-hours">
      <caption className="visually-hidden">{t.hours}</caption>
      <tbody>
        {ORDER.map((weekday) => {
          const day = BUSINESS.hours[weekday];
          const isToday = today === weekday;
          return (
            <tr key={weekday} data-today={isToday ? "true" : undefined}>
              <th scope="row">
                {weekdayName(weekday, locale)}
                {isToday ? ` · ${t.today}` : ""}
              </th>
              <td>{day ? `${formatClockTime(day.open, locale)} – ${formatClockTime(day.close, locale)}` : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
