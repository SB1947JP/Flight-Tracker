/**
 * Live aircraft positions.
 *
 * Sources are free community networks — adsb.lol, adsb.fi, airplanes.live —
 * where volunteers run receivers that pick up the position aircraft broadcast
 * continuously (ADS-B) and pool them. No account, no key, no cost.
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

/**
 * Three community networks, tried in order.
 *
 * They all run the same open server software and answer the same shape, so
 * accepting whichever one replies costs nothing and removes a single point of
 * failure. That matters more than usual here: a browser cannot tell you *why* a
 * request failed — a service refusing cross-origin requests, a tracker blocker
 * eating it, a captive wifi portal and being genuinely offline all arrive as
 * the same empty error — so the only way to distinguish "this service won't
 * talk to browsers" from "this device has no connection" is to ask more than
 * one and see whether they all fail.
 *
 * The one that answered last is remembered and tried first, so the steady state
 * is a single request per poll.
 */
const ENDPOINTS = [
  { name: 'adsb.lol', url: (cs: string) => `https://api.adsb.lol/v2/callsign/${cs}` },
  { name: 'adsb.fi', url: (cs: string) => `https://opendata.adsb.fi/api/v2/callsign/${cs}` },
  { name: 'airplanes.live', url: (cs: string) => `https://api.airplanes.live/v2/callsign/${cs}` },
];

/** The last service that answered, tried first next time. */
let preferred = 0;

/**
 * Whether the browser's own security policy blocked one of these requests.
 *
 * A policy refusal is indistinguishable from a network failure to the code that
 * made the request, but the browser announces it separately — so listening for
 * that announcement is the only way to tell a user which of the two happened.
 */
let cspBlocked = false;
if (typeof document !== 'undefined') {
  document.addEventListener('securitypolicyviolation', (event) => {
    if (event.violatedDirective.startsWith('connect-src')) cspBlocked = true;
  });
}

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
  const encoded = encodeURIComponent(callsign);
  const failures: string[] = [];
  let payload: unknown;
  let answered = '';

  // Start with whichever service worked last, then the rest.
  const order = ENDPOINTS.map((_, i) => ENDPOINTS[(preferred + i) % ENDPOINTS.length]);

  for (const endpoint of order) {
    try {
      const response = await fetch(endpoint.url(encoded), { signal, headers: { Accept: 'application/json' } });
      if (!response.ok) {
        failures.push(`${endpoint.name} replied ${response.status}`);
        continue;
      }
      payload = await response.json();
      answered = endpoint.name;
      preferred = ENDPOINTS.indexOf(endpoint);
      break;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { state: 'error', message: 'cancelled' };
      }
      failures.push(`${endpoint.name} unreachable`);
    }
  }

  if (!answered) {
    // Every service failed. Say which, and name the causes worth checking —
    // "check your connection" is useless advice on a device whose connection is
    // demonstrably fine, which is the usual case when a blocker is the culprit.
    if (cspBlocked) {
      return {
        state: 'error',
        message: "This page's own security policy blocked the request — that's a bug in the app, not your device.",
      };
    }
    return {
      state: 'error',
      message: `Couldn't reach any flight service (${failures.join(', ')}). If other sites work, a tracker/ad blocker or a private-relay setting is the usual cause — try another browser to check.`,
    };
  }

  if (typeof payload !== 'object' || payload === null) {
    return { state: 'error', message: `${answered} sent something unreadable.` };
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
    console.warn(`Unrecognised response from ${answered}:`, payload);
    return { state: 'error', message: `${answered} replied in a format this app doesn't recognise.` };
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
