/**
 * Monthly pay schedule. Wagefold never sends money on its own: the schedule only tells the team
 * when payroll is due and warns when a payday passed without a paid run.
 */

/** 1 to 28 is that day of the month; 31 means the last day of every month. */
export type PayDay = number;
export const LAST_DAY = 31;

export function isPayDay(n: unknown): n is PayDay {
  return Number.isInteger(n) && (((n as number) >= 1 && (n as number) <= 28) || n === LAST_DAY);
}

export function payDayLabel(day: PayDay): string {
  if (day === LAST_DAY) return "Last day of the month";
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${day}${suffix} of every month`;
}

function paydayOf(year: number, month: number, day: PayDay): Date {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, day === LAST_DAY ? last : Math.min(day, last));
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const DAY = 86_400_000;

export type ScheduleStatus = {
  next: Date;
  daysUntil: number;
  previous: Date;
  /** The previous payday passed with no paid run in the 10 days before it or since. */
  missed: boolean;
};

export function scheduleStatus(now: Date, day: PayDay, lastPaidAt: string | null): ScheduleStatus {
  const today = startOfDay(now);
  let next = paydayOf(today.getFullYear(), today.getMonth(), day);
  if (next < today) next = paydayOf(today.getFullYear(), today.getMonth() + 1, day);
  const previous = paydayOf(next.getFullYear(), next.getMonth() - 1, day);
  const daysUntil = Math.round((next.getTime() - today.getTime()) / DAY);
  // Teams that haven't paid anyone yet aren't "late"; only flag a cycle that broke a pattern.
  const missed = lastPaidAt !== null && new Date(lastPaidAt).getTime() < previous.getTime() - 10 * DAY;
  return { next, daysUntil, previous, missed };
}

function icsDate(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function icsText(s: string) {
  return s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, " ");
}

/** RFC 5545 lines are at most 75 octets; longer ones continue on lines starting with a space. */
function fold(line: string): string {
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 74) out.push((i ? " " : "") + line.slice(i, i + 74));
  return out.join("\r\n");
}

/** A recurring all-day calendar event for payday, with a reminder two days before. */
export function payDayIcs(day: PayDay, company: string, now: Date, uid: string): string {
  const start = scheduleStatus(now, day, null).next;
  const end = new Date(start.getTime() + DAY);
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Wagefold//Payroll//EN",
    "BEGIN:VEVENT",
    `UID:${uid}@wagefold`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${icsDate(start)}`,
    `DTEND;VALUE=DATE:${icsDate(end)}`,
    `RRULE:FREQ=MONTHLY;BYMONTHDAY=${day === LAST_DAY ? -1 : day}`,
    `SUMMARY:${icsText(`Payroll day: ${company}`)}`,
    "DESCRIPTION:Run payroll in Wagefold. Review the changes and send in one transaction.",
    "BEGIN:VALARM",
    "TRIGGER:-P2D",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(`Payroll for ${company} is due in 2 days`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .map(fold)
    .join("\r\n");
}
