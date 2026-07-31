// Delivery date estimation for the US store.
//
// Orders ship from our fulfillment partner in Bolingbrook, IL. Two different
// calendars apply and they are not the same:
//
//   Dispatch  Mon-Fri only. InSync's warehouse receives and ships Mon-Fri
//             8-5, with a same-business-day SLA before 1pm CT and next
//             business day after. Nothing leaves the building at a weekend,
//             so a Friday afternoon or Saturday order sits until Monday.
//   Transit   Mon-Sat. OSM runs seven days a week with no weekend surcharge
//             and UniUni's gig network also delivers weekends, so a parcel
//             genuinely can land on a Saturday. Sunday is excluded anyway,
//             to keep the estimate on the conservative side.

// US federal holidays, update annually
const US_HOLIDAYS: Set<string> = new Set([
  // 2025
  "2025-01-01", "2025-01-20", "2025-02-17", "2025-05-26",
  "2025-06-19", "2025-07-04", "2025-09-01", "2025-10-13",
  "2025-11-11", "2025-11-27", "2025-12-25",
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-10-12",
  "2026-11-11", "2026-11-26", "2026-12-25",
]);

/** Local calendar date as YYYY-MM-DD. Deliberately not toISOString(), which
 *  converts to UTC and can roll the date forward for US-timezone visitors. */
function toLocalIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Mon-Fri, excluding federal holidays. Governs when the 3PL can dispatch. */
export function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  return !US_HOLIDAYS.has(toLocalIso(date));
}

/** Mon-Sat, excluding federal holidays. Governs transit, because both
 *  carriers deliver on Saturdays even though the warehouse is shut. */
export function isDeliveryDay(date: Date): boolean {
  const day = date.getDay();
  if (day === 0) return false;
  return !US_HOLIDAYS.has(toLocalIso(date));
}

/** The first business day the 3PL can dispatch on, honouring the 1pm CT cutoff.
 *  The hour is read in Central Time so every visitor sees the same cutoff
 *  regardless of their own timezone. */
export function getDispatchDay(now: Date = new Date()): Date {
  const ctHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
    10,
  );

  const dispatchDay = new Date(now);
  if (ctHour >= 13) {
    dispatchDay.setDate(dispatchDay.getDate() + 1);
  }
  while (!isBusinessDay(dispatchDay)) {
    dispatchDay.setDate(dispatchDay.getDate() + 1);
  }
  return dispatchDay;
}

/** Advance by N transit days (Mon-Sat), starting the day after dispatch. */
export function addTransitDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    if (isDeliveryDay(result)) added++;
  }
  return result;
}

export interface DeliveryRange {
  from: string;
  to: string;
  /** True when both ends land on the same day, so callers can show one date. */
  sameDay: boolean;
}

/** Turn a zone transit band into a pair of display dates. */
export function getDeliveryWindow(
  minDays: number,
  maxDays: number,
  now: Date = new Date(),
): DeliveryRange {
  const dispatch = getDispatchDay(now);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const from = fmt(addTransitDays(dispatch, minDays));
  const to = fmt(addTransitDays(dispatch, maxDays));
  return { from, to, sameDay: from === to };
}
