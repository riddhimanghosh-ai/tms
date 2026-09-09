/**
 * Dates are rendered in the venue's timezone, not the server's.
 *
 * Vercel runs in UTC, so `toLocaleString` without a timeZone rendered a 6:30 pm
 * door time as 1:00 pm. Pinning the zone also removes a whole class of
 * hydration mismatch, since the server and the viewer's browser would
 * otherwise format the same timestamp differently.
 */
export const EVENT_TZ = "Asia/Kolkata";
const LOCALE = "en-IN";

type Opts = Intl.DateTimeFormatOptions;

function fmt(ts: number, opts: Opts) {
  return new Date(ts * 1000).toLocaleString(LOCALE, { timeZone: EVENT_TZ, ...opts });
}

/** "Tue, 13 Oct" */
export const shortDate = (ts: number) =>
  fmt(ts, { weekday: "short", day: "numeric", month: "short" });

/** "13 Oct" */
export const dayMonth = (ts: number) => fmt(ts, { day: "numeric", month: "short" });

/** "Tuesday, 13 October 2026" */
export const longDate = (ts: number) =>
  fmt(ts, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** "13 October 2026" */
export const dateOnly = (ts: number) =>
  fmt(ts, { day: "numeric", month: "long", year: "numeric" });

/** "07:00 pm" */
export const timeOnly = (ts: number) => fmt(ts, { hour: "2-digit", minute: "2-digit" });

/** "Tue, 13 Oct 2026, 07:00 pm" */
export const dateTime = (ts: number) =>
  fmt(ts, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** "Tuesday, 13 October 2026 at 07:00 pm" */
export const fullDateTime = (ts: number) =>
  fmt(ts, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Just the weekday, for a night picker chip. */
export const weekday = (ts: number) => fmt(ts, { weekday: "short" });

/** Day of the month as a number, for a date tile. */
export const dayNumber = (ts: number) => fmt(ts, { day: "numeric" });

/** "Oct" */
export const monthShort = (ts: number) => fmt(ts, { month: "short" });

/** Sortable stamp for CSV exports. */
export const exportStamp = (ts: number | null) =>
  ts
    ? new Date(ts * 1000)
        .toLocaleString("sv-SE", { timeZone: EVENT_TZ })
        .replace("T", " ")
        .slice(0, 16)
    : "";
