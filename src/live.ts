/**
 * Live aircraft positions.
 *
 * Source is adsb.lol, a free community network: volunteers run receivers that
 * pick up the position aircraft broadcast continuously (ADS-B), and pool them.
 * No account, no key, no cost.
 *
 * The consequence of "volunteers on the ground" is the thing to understand
 * about this whole feature: **coverage follows people, not aeroplanes.** Over
 * Europe, North America, Japan, eastern Australia it is excellent. Over the
 * middle of an ocean there is nobody to hear the broadcast, so a long-haul
 * flight simply goes quiet for hours. That is not a failure to handle; it is
 * the normal condition, and the app falls back to the schedule estimate and
 * says which one it is showing.
 *
 * ---------------------------------------------------------------------------
 * A caution for whoever maintains this next.
 *
 * This module was written without ever being run against the real service —
 * the machine it was built on could not reach the network. The response
 * handling below is therefore deliberately *tolerant*: it accepts several
 * plausible shapes for the same field and reports precisely what it could not
 * understand, instead of assuming a shape and failing with a blank screen.
 * If the API's format is confirmed, this can be tightened considerably.
 * ---------------------------------------------------------------------------
 */

const ENDPOINT = 'https://api.adsb.lol/v2/callsign';

/** Knots → km/h, and feet → metres. The feed speaks aviation units. */
const KMH_PER_KNOT = 1.852;
const METRES_PER_FOOT = 0.3048;

export interface LivePosition {
  lat: number;
  lon: number;
  /** Track over the ground in degrees, if the feed reported one. */
  headingDeg?: number;
  /** Altitude in metres, converted from the feed's feet. */
  altitudeM?: number;
  /** Ground speed in km/h, converted from the feed's knots. */
  groundSpeedKmh?: number;
  /** When this fix was received, as an epoch in ms. */
  receivedAt: number;
}

export type LiveResult =
  | { state: 'found'; position: LivePosition }
  /** Reached the service; it simply has no aircraft with that callsign right now. */
  | { state: 'not-found' }
  /** Could not reach the service, or could not make sense of what came back. */
  | { state: 'error'; message: string };

/** Read a number from any of several possible field names. */
function num(source: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    // The feed sends "ground" for altitude when an aircraft is on the runway,
    // and occasionally sends numbers as strings.
    if (typeof value === 'string' && value !== 'ground') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

/**
 * Look up the current position of an aircraft by its radio callsign.
 *
 * `signal` lets a pending request be abandoned when the user selects a
 * different flight, so a slow reply can't overwrite a newer one.
 */
export async function fetchLivePosition(callsign: string, signal?: AbortSignal): Promise<LiveResult> {
  let payload: unknown;
  try {
    const response = await fetch(`${ENDPOINT}/${encodeURIComponent(callsign)}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return { state: 'error', message: `The flight service replied ${response.status}.` };
    }
    payload = await response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { state: 'error', message: 'cancelled' };
    }
    // Offline, blocked, or the service is down — indistinguishable from here,
    // and the user's next move is the same in every case.
    return { state: 'error', message: 'Could not reach the flight service. Check your connection.' };
  }

  if (typeof payload !== 'object' || payload === null) {
    return { state: 'error', message: 'The flight service sent something unreadable.' };
  }

  // Aircraft have lived under `ac` and under `aircraft` in different versions
  // of this API, and a bare array is a plausible third shape.
  const container = payload as Record<string, unknown>;
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(container.ac)
      ? container.ac
      : Array.isArray(container.aircraft)
        ? container.aircraft
        : null;

  if (!list) {
    // Log the actual payload: this is the one failure a user can't diagnose
    // from the interface, and it is exactly what a maintainer needs to see.
    console.warn('Unrecognised response from the flight service:', payload);
    return { state: 'error', message: "The flight service's reply wasn't in the expected format." };
  }
  if (list.length === 0) return { state: 'not-found' };

  // Prefer an entry that actually carries a position: the feed sometimes knows
  // of an aircraft (from its identifier alone) without a current fix.
  const withPosition = list
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    .map((entry) => ({ entry, lat: num(entry, 'lat', 'latitude'), lon: num(entry, 'lon', 'lng', 'longitude') }))
    .find((c) => c.lat !== undefined && c.lon !== undefined);

  if (!withPosition || withPosition.lat === undefined || withPosition.lon === undefined) {
    return { state: 'not-found' };
  }

  const { entry, lat, lon } = withPosition;
  const altitudeFt = num(entry, 'alt_baro', 'alt_geom', 'altitude', 'alt');
  const speedKts = num(entry, 'gs', 'ground_speed', 'speed');
  const headingDeg = num(entry, 'track', 'heading', 'true_heading');
  // `seen_pos` is how many seconds ago the fix was taken; without it, now is
  // the honest best guess.
  const secondsOld = num(entry, 'seen_pos', 'seen') ?? 0;

  return {
    state: 'found',
    position: {
      lat,
      lon,
      headingDeg,
      altitudeM: altitudeFt === undefined ? undefined : altitudeFt * METRES_PER_FOOT,
      groundSpeedKmh: speedKts === undefined ? undefined : speedKts * KMH_PER_KNOT,
      receivedAt: Date.now() - secondsOld * 1000,
    },
  };
}
