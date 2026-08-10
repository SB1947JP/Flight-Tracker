/**
 * The flight record, its persistence, and everything derived from it.
 *
 * A tracked flight is nothing but what the user typed — number, two airports,
 * two times. Position, progress, phase and ETA are all *derived* on each tick
 * rather than stored, so there is one source of truth and no cached state that
 * can drift out of step with the clock.
 *
 * Note what this is honest about: with no live data feed there is no way to
 * know an aircraft is holding, diverted or an hour late. What the page shows is
 * where a flight *would* be if it flew its schedule — the aeroplane on the map
 * is an estimate, and the UI says so rather than implying a radar contact.
 */

import { Airport, findAirport } from './airports';
import { bearingDeg, distanceKm, interpolate, LatLon } from './geo';

/**
 * A tracked flight.
 *
 * The schedule is **optional**, and that is the important thing about this
 * type. Following an aircraft live needs nothing but its number: the broadcast
 * carries position, altitude, speed and heading on its own. Airports and times
 * buy you the things a broadcast can't give — a route line, progress, time
 * remaining, and a position to fall back on when the signal drops — so they are
 * offered rather than demanded.
 *
 * The four schedule fields travel together: all four or none. `hasSchedule`
 * is the only way this is checked, so the rest of the app can't half-use them.
 * Keeping them as optional flat fields rather than a nested object means
 * flights saved before this existed load unchanged, with no migration.
 */
export interface Flight {
  id: string;
  /** Flight number as printed, e.g. "QF63". Free text — never parsed. */
  number: string;
  /** Departure airport IATA code. */
  from?: string;
  /** Arrival airport IATA code. */
  to?: string;
  /** Scheduled departure, as a UTC epoch in ms. */
  departUtc?: number;
  /** Scheduled arrival, as a UTC epoch in ms. */
  arriveUtc?: number;
  note?: string;
}

/** A flight that carries a full schedule, and so can be drawn as a route. */
export type ScheduledFlight = Flight & {
  from: string;
  to: string;
  departUtc: number;
  arriveUtc: number;
};

export function hasSchedule(flight: Flight): flight is ScheduledFlight {
  return (
    typeof flight.from === 'string' &&
    typeof flight.to === 'string' &&
    typeof flight.departUtc === 'number' &&
    typeof flight.arriveUtc === 'number'
  );
}

export type FlightStatus = 'scheduled' | 'enroute' | 'arrived';
export type FlightPhase = 'climb' | 'cruise' | 'descent';

export interface FlightProgress {
  origin: Airport;
  destination: Airport;
  status: FlightStatus;
  /** 0–1, fraction of the scheduled block time elapsed. Clamped. */
  fraction: number;
  /** Estimated current position along the great circle. */
  position: LatLon;
  /** Track over the ground at the current position, degrees from true north. */
  headingDeg: number;
  phase: FlightPhase;
  totalDistanceKm: number;
  flownKm: number;
  remainingKm: number;
  /** Scheduled block time, ms. */
  durationMs: number;
  /** Negative before departure (i.e. time until departure). */
  elapsedMs: number;
  remainingMs: number;
  /** Average ground speed over the whole leg, km/h. */
  averageSpeedKmh: number;
}

/**
 * Everything derivable from a schedule. Null when there is no schedule to
 * derive it from, or when an airport code doesn't resolve — in both cases the
 * flight can still be followed live, just without a route.
 */
export function resolveProgress(flight: Flight, now: number): FlightProgress | null {
  if (!hasSchedule(flight)) return null;
  const origin = findAirport(flight.from);
  const destination = findAirport(flight.to);
  if (!origin || !destination) return null;

  const durationMs = Math.max(0, flight.arriveUtc - flight.departUtc);
  const elapsedMs = now - flight.departUtc;
  // A zero-length schedule would divide by zero; treat it as instantly arrived.
  const fraction = durationMs === 0 ? (elapsedMs >= 0 ? 1 : 0) : Math.min(1, Math.max(0, elapsedMs / durationMs));

  const status: FlightStatus = elapsedMs < 0 ? 'scheduled' : fraction >= 1 ? 'arrived' : 'enroute';

  const from: LatLon = { lat: origin.lat, lon: origin.lon };
  const to: LatLon = { lat: destination.lat, lon: destination.lon };
  const position = interpolate(from, to, fraction);
  // Bearing from where it is now to where it's going. Taking it from the
  // departure airport instead would leave the marker pointing at its original
  // heading for the whole flight, which on a polar route is wrong by degrees
  // that are plainly visible.
  const headingDeg = fraction >= 1 ? bearingDeg(from, to) : bearingDeg(position, to);

  const totalDistanceKm = distanceKm(from, to);

  return {
    origin,
    destination,
    status,
    fraction,
    position,
    headingDeg,
    phase: phaseAt(fraction, durationMs),
    totalDistanceKm,
    flownKm: totalDistanceKm * fraction,
    remainingKm: totalDistanceKm * (1 - fraction),
    durationMs,
    elapsedMs,
    remainingMs: Math.max(0, flight.arriveUtc - now),
    averageSpeedKmh: durationMs > 0 ? totalDistanceKm / (durationMs / 3600000) : 0,
  };
}

/**
 * Rough flight phase. Real climb and descent are roughly fixed durations, not
 * fixed fractions of the trip, so they're expressed in minutes and only fall
 * back to a fraction of the block time on short hops where 20 minutes of climb
 * would otherwise swallow the whole flight.
 */
function phaseAt(fraction: number, durationMs: number): FlightPhase {
  if (durationMs === 0) return 'cruise';
  const climbEnd = Math.min(20 * 60000, durationMs * 0.15) / durationMs;
  const descentStart = 1 - Math.min(30 * 60000, durationMs * 0.2) / durationMs;
  if (fraction < climbEnd) return 'climb';
  if (fraction > descentStart) return 'descent';
  return 'cruise';
}

export const STATUS_LABEL: Record<FlightStatus, string> = {
  scheduled: 'Scheduled',
  enroute: 'In flight',
  arrived: 'Arrived',
};

export const PHASE_LABEL: Record<FlightPhase, string> = {
  climb: 'Climbing',
  cruise: 'Cruising',
  descent: 'Descending',
};

/* ---------------------------------------------------------------- storage */

// localStorage, not IndexedDB: this is a handful of small records with no blobs
// and no async need, and the editor's IndexedDB handle (`src/lib/idb.ts`) is
// deliberately shared across that app's modules — reaching into it from a
// separate page would tie two independent things together for no gain.
export const STORAGE_KEY = 'flight-tracker/flights/v1';

export function loadFlights(): Flight[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Validate rather than trust: this is user-editable storage, and a single
    // malformed record shouldn't take down the whole page on load.
    return parsed.filter(isFlight);
  } catch {
    return [];
  }
}

export function saveFlights(flights: Flight[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flights));
  } catch {
    // Private-browsing quota errors just mean the list won't survive a reload;
    // the session itself still works, so there's nothing worth interrupting for.
  }
}

function isFlight(value: unknown): value is Flight {
  if (typeof value !== 'object' || value === null) return false;
  const f = value as Record<string, unknown>;
  if (typeof f.id !== 'string' || typeof f.number !== 'string') return false;

  // The schedule is optional, but a half-present one is corrupt rather than
  // absent — a record with a departure and no arrival would produce nonsense.
  const parts = [f.from, f.to, f.departUtc, f.arriveUtc];
  const present = parts.filter((p) => p !== undefined && p !== null);
  if (present.length === 0) return true;
  if (present.length !== 4) return false;
  return (
    typeof f.from === 'string' &&
    typeof f.to === 'string' &&
    typeof f.departUtc === 'number' &&
    Number.isFinite(f.departUtc) &&
    typeof f.arriveUtc === 'number' &&
    Number.isFinite(f.arriveUtc)
  );
}

export function newFlightId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
