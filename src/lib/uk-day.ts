// Helpers for "today" boundaries in UK wall-clock time (Europe/London), so
// daily counters reset at UK midnight regardless of server timezone or DST.
// The US store reuses the UK boundary so both order alerts share one "today"
// for the (UK-based) operator watching them.

/**
 * The UTC instant of the most recent UK (Europe/London) midnight.
 * In summer (BST, UTC+1) UK midnight is 23:00 UTC the previous day; in winter
 * (GMT) it is 00:00 UTC. Computed from the actual zone offset, so it is correct
 * across DST transitions without hard-coding.
 */
export function ukStartOfTodayUTC(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);

  // The same wall-clock moment, but interpreted as if it were UTC.
  const wallAsUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  // offset = (UK wall clock read as UTC) - (true UTC now)
  const offsetMs = wallAsUTC - now.getTime();
  // UK midnight wall clock, read as UTC, then shifted back by the offset.
  const ukMidnightWallAsUTC = Date.UTC(get("year"), get("month") - 1, get("day"), 0, 0, 0);
  return new Date(ukMidnightWallAsUTC - offsetMs);
}
