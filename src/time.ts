/**
 * Timezone handling, built on `Intl` rather than a date library.
 *
 * A flight tracker that made you enter times in your own timezone would be
 * useless in the one situation it exists for — you read "09:35" off a boarding
 * pass, and that is 09:35 *at the departure airport*. So every time in this
 * page is entered and displayed as airport-local wall-clock time and stored as
 * a UTC instant, with each airport carrying its IANA zone (see `airports.ts`).
 *
 * `Intl.DateTimeFormat` already ships a full, current IANA database in every
 * browser, including historical and future DST rules, so the conversion below
 * is correct across DST transitions without adding a dependency or a data blob
 * that would go stale. (It also keeps the page's strict CSP intact — there is
 * no timezone API to call.)
 */

/**
 * Offset of `timeZone` from UTC, in minutes, *at a given instant*. Positive
 * east of Greenwich. It has to be evaluated at an instant rather than looked
 * up per zone, because the answer changes twice a year in most zones.
 */
function offsetMinutesAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    // h23, not hour12:false — the latter renders midnight as hour "24" in some
    // implementations, which parses into the wrong day.
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // Read the zone's wall clock back as if it were UTC; the difference from the
  // real instant is the offset.
  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asIfUtc - instant) / 60000);
}

/**
 * Convert an airport-local wall-clock time (`YYYY-MM-DDTHH:mm`, the value an
 * `<input type="datetime-local">` produces) to a UTC epoch in milliseconds.
 *
 * Two passes, because the offset depends on the instant we are still solving
 * for: guess with UTC, correct with the offset in force at that guess, then
 * correct once more. The second pass is what fixes times within a day of a DST
 * transition, where the first guess can land on the wrong side of the change.
 */
export function zonedWallClockToUtc(wallClock: string, timeZone: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wallClock);
  if (!match) return NaN;
  const [, y, mo, d, h, mi] = match.map(Number);

  const naive = Date.UTC(y, mo - 1, d, h, mi);
  let utc = naive - offsetMinutesAt(naive, timeZone) * 60000;
  utc = naive - offsetMinutesAt(utc, timeZone) * 60000;
  return utc;
}

/** UTC instant → the `datetime-local` string for that zone's wall clock. */
export function utcToZonedWallClock(utc: number, timeZone: string): string {
  const shifted = utc + offsetMinutesAt(utc, timeZone) * 60000;
  return new Date(shifted).toISOString().slice(0, 16);
}

/** e.g. "09:35" — the time on the wall at that airport. */
export function formatClock(utc: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(utc);
}

/** e.g. "Mon 14 Apr" */
export function formatDate(utc: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(utc);
}

/** e.g. "GMT+9" — shown next to a time so it can't be misread as your own. */
export function formatZoneAbbr(utc: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(utc);
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
}

/** A duration in ms as "12h 40m" (or "45m" under an hour). */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes}m`;
}

/** The timezone this browser is set to, e.g. 'Asia/Tokyo'. */
export function deviceZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * The same instant on the reader's own clock, e.g. "Tue 11 Aug, 06:35".
 *
 * Shown beside every airport-local time. Entering times in each airport's local
 * time is right — it is what a ticket prints — but it is also the single
 * easiest thing to get wrong, because nothing on screen contradicts you if you
 * type your own time instead. Echoing the instant back in the reader's zone
 * makes a mistake visible immediately rather than eight hours later.
 */
export function formatInDeviceZone(utc: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(utc);
}
