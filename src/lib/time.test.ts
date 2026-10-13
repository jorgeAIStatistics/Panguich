import { describe, expect, it } from "vitest";
import { BUSINESS } from "@/content/business";
import {
  addDaysToIsoDate,
  businessDateString,
  businessWallClock,
  businessWallTimeToInstant,
  daysBetweenIsoDates,
  formatClockTime,
  isClockTime,
  isIsoDate,
  openStateAt,
  weekdayOfIsoDate,
} from "./time";

describe("Cooper City business time (America/New_York)", () => {
  it("reads the local wall clock on both sides of daylight saving", () => {
    // Summer: EDT is UTC-4. Winter: EST is UTC-5.
    expect(businessWallClock(new Date("2026-07-01T16:00:00Z"))).toMatchObject({ hour: 12, weekday: 3 });
    expect(businessWallClock(new Date("2026-12-01T17:00:00Z"))).toMatchObject({ hour: 12, weekday: 2 });
  });

  it("keeps the business date when UTC has already rolled over", () => {
    // 9:30 PM in Cooper City on Oct 13 is already Oct 14 in UTC.
    expect(businessDateString(new Date("2026-10-14T01:30:00Z"))).toBe("2026-10-13");
  });

  it("converts wall time to the right instant across the fall-back change (Nov 1, 2026)", () => {
    expect(businessWallTimeToInstant("2026-10-31", "08:00").instant.toISOString()).toBe("2026-10-31T12:00:00.000Z");
    expect(businessWallTimeToInstant("2026-11-01", "08:00").instant.toISOString()).toBe("2026-11-01T13:00:00.000Z");
    // 1:30 AM happens twice that night: use the first, and say so.
    const twice = businessWallTimeToInstant("2026-11-01", "01:30");
    expect(twice.ambiguous).toBe(true);
    expect(twice.instant.toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });

  it("handles the spring-forward gap (Mar 8, 2026) without inventing a time", () => {
    const skipped = businessWallTimeToInstant("2026-03-08", "02:30");
    expect(skipped.adjusted).toBe(true);
    expect(businessWallClock(skipped.instant)).toMatchObject({ hour: 3, minute: 30 });
    expect(businessWallTimeToInstant("2026-03-08", "08:00").instant.toISOString()).toBe("2026-03-08T12:00:00.000Z");
  });

  it("knows open and closed from verified hours, including the shorter Sunday", () => {
    const at = (date: string, time: string) => openStateAt(businessWallTimeToInstant(date, time).instant, BUSINESS.hours);
    // 2026-10-13 is a Tuesday; 2026-10-18 is a Sunday.
    expect(at("2026-10-13", "07:59")).toEqual({ state: "closed", opensAt: "08:00", opensWeekday: 2 });
    expect(at("2026-10-13", "08:00")).toEqual({ state: "open", closesAt: "19:00" });
    expect(at("2026-10-13", "18:59")).toEqual({ state: "open", closesAt: "19:00" });
    expect(at("2026-10-13", "19:00")).toEqual({ state: "closed", opensAt: "08:00", opensWeekday: 3 });
    expect(at("2026-10-18", "16:30")).toEqual({ state: "open", closesAt: "17:00" });
    expect(at("2026-10-18", "17:30")).toEqual({ state: "closed", opensAt: "08:00", opensWeekday: 1 });
  });

  it("stays correct on the day the clocks change", () => {
    // Sunday Nov 1, 2026: clocks fall back at 2 AM. 8:00 AM local must still read as open.
    const open = openStateAt(new Date("2026-11-01T13:00:00Z"), BUSINESS.hours);
    expect(open.state).toBe("open");
    const before = openStateAt(new Date("2026-11-01T12:30:00Z"), BUSINESS.hours);
    expect(before).toEqual({ state: "closed", opensAt: "08:00", opensWeekday: 0 });
  });

  it("does calendar-date arithmetic without time zones", () => {
    expect(weekdayOfIsoDate("2026-11-01")).toBe(0);
    expect(daysBetweenIsoDates("2026-10-31", "2026-11-02")).toBe(2);
    expect(addDaysToIsoDate("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysToIsoDate("2026-03-07", 2)).toBe("2026-03-09");
  });

  it("validates dates and clock times strictly", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("10/13/2026")).toBe(false);
    expect(isClockTime("24:00")).toBe(false);
    expect(isClockTime("08:05")).toBe(true);
    expect(formatClockTime("17:00", "en")).toBe("5:00 PM");
  });
});
