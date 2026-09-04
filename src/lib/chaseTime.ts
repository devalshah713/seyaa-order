// When a chase reminder is allowed to go out, and how far apart they are.
//
// Two rules, kept apart from everything else because they are the fiddly part
// and the only part worth testing on its own:
//
//   * the cadence — a full day after the demand goes to the diamond team,
//     then every six hours until the bags turn up on the jangad;
//   * the working window — Monday to Friday, 08:00 to 19:00 in India. A
//     reminder that falls due outside it waits for the window to open rather
//     than pinging somebody at two in the morning. It never loses its place:
//     the reminder number is kept, only the moment moves.
//
// India keeps a fixed +05:30 all year, so the offset is a constant and not a
// timezone database. Deliberately free of Node APIs and of "server-only" — the
// chase screen shows the next due time in the browser too.

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// The window, in minutes past IST midnight.
export const WORK_FROM_MIN = 8 * 60; // 08:00
export const WORK_TO_MIN = 19 * 60; // 19:00

function istParts(t: Date): { day: number; min: number } {
  const s = new Date(t.getTime() + IST_OFFSET_MS);
  return { day: s.getUTCDay(), min: s.getUTCHours() * 60 + s.getUTCMinutes() };
}

// The instant at a given minute past midnight of the IST day `t` falls on.
function atIstMinute(t: Date, minute: number): Date {
  const s = new Date(t.getTime() + IST_OFFSET_MS);
  s.setUTCHours(0, 0, 0, 0);
  return new Date(s.getTime() + minute * 60_000 - IST_OFFSET_MS);
}

export function inWorkingHours(t: Date): boolean {
  const { day, min } = istParts(t);
  if (day === 0 || day === 6) return false; // Sunday, Saturday
  return min >= WORK_FROM_MIN && min < WORK_TO_MIN;
}

// The first moment at or after `t` that is inside the window. Returns `t`
// itself when it already is.
export function nextWorkingMoment(t: Date): Date {
  if (inWorkingHours(t)) return t;
  let cursor = t;
  // A weekend plus a bank of days off still settles in a handful of steps;
  // the bound is only there so a bad input cannot spin.
  for (let i = 0; i < 14; i++) {
    const { day, min } = istParts(cursor);
    const weekday = day !== 0 && day !== 6;
    // Before the window opens on a working day: it opens today.
    if (weekday && min < WORK_FROM_MIN) return atIstMinute(cursor, WORK_FROM_MIN);
    // Otherwise this IST day is done with (or never started) — try tomorrow.
    cursor = atIstMinute(new Date(cursor.getTime() + 24 * 60 * 60 * 1000), WORK_FROM_MIN);
    if (inWorkingHours(cursor)) return cursor;
  }
  return cursor;
}

// The first reminder waits a full working day — the diamond team is given a
// day to bag and issue before anybody is chased at all. After that it is every
// six hours.
export const FIRST_GAP_HOURS = 24;
export const REPEAT_GAP_HOURS = 6;

// The gap before reminder number `n`, in minutes. `n` counts from 1.
export function gapMinutes(n: number): number {
  return (n <= 1 ? FIRST_GAP_HOURS : REPEAT_GAP_HOURS) * 60;
}

// When reminder number `n` is due, measured from `from` — the moment the
// demand was issued for the first one, and the moment the last reminder went
// out for the ones after it.
export function dueAt(from: Date, n: number): Date {
  return nextWorkingMoment(new Date(from.getTime() + gapMinutes(n) * 60_000));
}

// A chase nobody ever closes would ping every six hours for ever. After this
// many it stops and asks to be dealt with by hand, which is a decision
// somebody has to make anyway — roughly a fortnight of working hours.
export const MAX_REMINDERS = 30;

// "26 hours" / "1 day 2 hours" — how long the diamond team has had it, said
// the way the chase message needs to say it.
export function elapsedWords(fromIso: string, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - Date.parse(fromIso)) / 60_000));
  const hours = Math.floor(mins / 60);
  if (hours < 1) return `${mins} minute${mins === 1 ? "" : "s"}`;
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return `${days} day${days === 1 ? "" : "s"}` + (rest ? ` ${rest} hour${rest === 1 ? "" : "s"}` : "");
}

export function elapsedHours(fromIso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(fromIso)) / 3_600_000));
}

// "03 Sep 2026" — how a date reads in the chase message.
export function istDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = new Date(t + IST_OFFSET_MS);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][s.getUTCMonth()];
  return `${String(s.getUTCDate()).padStart(2, "0")} ${month} ${s.getUTCFullYear()}`;
}

// The same instant written with India's offset on it, which is what the
// webhook payload asks for: "2026-09-03T14:00:00+05:30".
export function istStampOffset(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t + IST_OFFSET_MS).toISOString().replace(/\.\d+Z$/, "+05:30");
}

// "in 25 minutes" / "8 minutes ago" — for the chase screen.
export function relativeTime(iso: string, now = new Date()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const mins = Math.round((t - now.getTime()) / 60_000);
  const size = Math.abs(mins);
  const say =
    size < 1 ? "now"
      : size < 60 ? `${size} minute${size === 1 ? "" : "s"}`
        : size < 60 * 24 ? `${Math.round(size / 60)} hour${Math.round(size / 60) === 1 ? "" : "s"}`
          : `${Math.round(size / (60 * 24))} day${Math.round(size / (60 * 24)) === 1 ? "" : "s"}`;
  if (say === "now") return "now";
  return mins > 0 ? `in ${say}` : `${say} ago`;
}

// "Tue 09:20 IST" — short enough for a table cell, and says which clock.
export function istClock(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = new Date(t + IST_OFFSET_MS);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][s.getUTCDay()];
  const hh = String(s.getUTCHours()).padStart(2, "0");
  const mm = String(s.getUTCMinutes()).padStart(2, "0");
  return `${day} ${s.getUTCDate()}/${s.getUTCMonth() + 1} ${hh}:${mm} IST`;
}
