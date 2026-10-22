import { describe, expect, it } from "vitest";
import { isPayDay, LAST_DAY, payDayIcs, scheduleStatus } from "@/lib/schedule";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 10);

describe("scheduleStatus", () => {
  it("finds the next payday this month or next", () => {
    expect(scheduleStatus(d(2026, 10, 22), 25, null)).toMatchObject({ daysUntil: 3, missed: false });
    const s = scheduleStatus(d(2026, 10, 26), 25, null);
    expect([s.next.getMonth(), s.next.getDate()]).toEqual([10, 25]);
  });

  it("handles the last day of the month, including February", () => {
    const s = scheduleStatus(d(2026, 2, 10), LAST_DAY, null);
    expect(s.next.getDate()).toBe(28);
    expect(scheduleStatus(d(2026, 10, 31), LAST_DAY, null).daysUntil).toBe(0);
  });

  it("flags a missed payday only for teams that have paid before", () => {
    expect(scheduleStatus(d(2026, 10, 22), LAST_DAY, null).missed).toBe(false);
    expect(scheduleStatus(d(2026, 10, 22), LAST_DAY, "2026-09-29T12:00:00Z").missed).toBe(false);
    expect(scheduleStatus(d(2026, 10, 22), LAST_DAY, "2026-08-31T12:00:00Z").missed).toBe(true);
  });
});

describe("payday", () => {
  it("accepts 1-28 and the last day only", () => {
    expect([1, 28, 31].every(isPayDay)).toBe(true);
    expect([0, 29, 30, 1.5, "5", null].some(isPayDay)).toBe(false);
  });

  it("builds a monthly calendar event with escaped, folded text", () => {
    const ics = payDayIcs(LAST_DAY, "Acme, Inc; " + "x".repeat(80), d(2026, 10, 22), "org-1");
    expect(ics).toContain("RRULE:FREQ=MONTHLY;BYMONTHDAY=-1");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261031");
    expect(ics).toContain(String.raw`Acme\, Inc\;`);
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
  });
});
