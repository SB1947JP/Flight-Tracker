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
interface Endpoint {
  name: string;
  /** Every aircraft currently broadcasting this callsign. One spelling: this is
   *  the request the app has always made, and it is confirmed working. */
  callsign: (cs: string) => string;
  /**
   * Every aircraft within `nm` nautical miles of a point — in the spellings
   * worth trying, best first.
   *
   * A list rather than one URL because the three services do not agree and
   * their documentation can't be reached from the machine this is written on:
   * adsb.fi has moved this call to `/v3` and marks `/v2` deprecated, adsb.lol
   * inherits ADSB Exchange's `lat/lon/dist` shape (it is a drop-in replacement
   * for that API), and airplanes.live uses a `point` path. Each is tried in
   * turn and the one that answers is remembered, which is the same tactic the
   * callsign padding uses in `airlines.ts` and for the same reason: guessing
   * once and being wrong costs a feature, while trying the plausible spellings
   * costs one extra request the first time.
   *
   * All three cap the radius at 250 nm, and at least one rejects a fractional
   * one, so `nm` arrives as a whole number.
   */
  area: ((lat: number, lon: number, nm: number) => string)[];
}

const ENDPOINTS: Endpoint[] = [
  {
    name: 'adsb.lol',
    callsign: (cs) => `https://api.adsb.lol/v2/callsign/${cs}`,
    area: [
      (lat, lon, nm) => `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${nm}`,
      (lat, lon, nm) => `https://api.adsb.lol/v2/point/${lat}/${lon}/${nm}`,
    ],
  },
  {
    name: 'adsb.fi',
    callsign: (cs) => `https://opendata.adsb.fi/api/v2/callsign/${cs}`,
    area: [
      (lat, lon, nm) => `https://opendata.adsb.fi/api/v3/lat/${lat}/lon/${lon}/dist/${nm}`,
      (lat, lon, nm) => `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${nm}`,
    ],
  },
  {
    name: 'airplanes.live',
    callsign: (cs) => `https://api.airplanes.live/v2/callsign/${cs}`,
    area: [(lat, lon, nm) => `https://api.airplanes.live/v2/point/${lat}/${lon}/${nm}`],
  },
];

/** Which spelling of the area request worked, per service. */
const workingAreaForm = new Map<string, number>();

/**
 * Spellings a service has refused outright, as `name:index`.
 *
 * Asking a free service for a URL it has already said doesn't exist, every
 * twenty seconds, for as long as the page is open, is precisely the behaviour
 * these networks ask people not to engage in — adsb.fi's terms say 4xx replies
 * count towards a temporary block of your address. A refusal is remembered and
 * the question is not asked again.
 */
const deadForms = new Set<string>();

/** The last service that answered, tried first next time. */
let preferred = 0;

/** Sentinel for "the body wouldn't parse as JSON" — distinct from any value a
 *  service could legitimately send, including null. */
const FAILED_TO_PARSE = Symbol('failed-to-parse');

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
async function askOneService(
  /** The spellings to try at one service, best first. Usually one. */
  urlsFor: (endpoint: Endpoint) => string[],
  signal?: AbortSignal,
  /** Called with the index of the spelling that worked, so the caller can
   *  remember it and stop paying for the ones that don't. */
  onSpellingWorked?: (endpoint: Endpoint, formIndex: number) => void,
  /** Called when a service refuses a spelling outright (a 4xx), so the caller
   *  can stop asking. Not called for a network failure, which may be passing. */
  onSpellingRefused?: (endpoint: Endpoint, formIndex: number) => void,
) {
  const failures: string[] = [];

  // Start with whichever service worked last, then the rest.
  for (let i = 0; i < ENDPOINTS.length; i++) {
    const index = (preferred + i) % ENDPOINTS.length;
    const endpoint = ENDPOINTS[index];

    const urls = urlsFor(endpoint);
    for (let form = 0; form < urls.length; form++) {
      // Name the path, not just the service, when something goes wrong: these
      // APIs are undocumented from where this is maintained, so "adsb.lol
      // replied 404" on its own doesn't say *which request* was wrong, and
      // that is precisely the thing a bug report needs to carry.
      const where = `${endpoint.name}${new URL(urls[form]).pathname}`;

      const response = await fetch(urls[form], { signal, headers: { Accept: 'application/json' } }).catch(
        (error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') throw error;
          failures.push(`${where} unreachable`);
          return null;
        },
      );
      if (!response) continue;
      if (!response.ok) {
        failures.push(`${where} replied ${response.status}`);
        // 4xx is the service saying this request is wrong and will stay wrong;
        // 5xx is it having a bad day, which is worth trying again later.
        if (response.status >= 400 && response.status < 500) onSpellingRefused?.(endpoint, form);
        continue;
      }

      // A service can answer 200 with something that isn't JSON at all — an
      // error page, or a captive-wifi login screen standing in for the real
      // reply. Treat that as this service failing rather than letting it
      // throw: the next one along may well be fine, and it is the whole reason
      // there are three.
      const payload = await response.json().catch(() => FAILED_TO_PARSE);
      if (payload === FAILED_TO_PARSE) {
        failures.push(`${where} sent something that wasn't JSON`);
        continue;
      }

      // Remember what worked, so the steady state really is one request per
      // poll rather than a failing service re-tried first every single time.
      preferred = index;
      onSpellingWorked?.(endpoint, form);
      return { payload: payload as unknown, answered: endpoint.name, failures };
    }
  }
  return { payload: undefined, answered: '', failures };
}

/**
 * Why no service answered, in words worth showing someone — or null if one did.
 *
 * "Check your connection" is useless advice on a device whose connection is
 * demonstrably fine, which is the usual case when a blocker is the culprit, so
 * the causes actually worth checking are named instead.
 */
async function whyUnreachable(answered: string, failures: string[], probeUrl: string): Promise<string | null> {
  if (answered) return null;
  if (cspBlocked) {
    return "This page's own security policy blocked the request — that's a bug in the app, not your device.";
  }

  // Two very different things look identical from here: nothing left the device
  // at all, or the request arrived and was answered but the browser refused to
  // hand the reply over because the service doesn't permit web pages to read it
  // (no CORS headers). Both surface as a rejected fetch with no status.
  //
  // A `no-cors` request tells them apart. It is allowed to succeed where the
  // normal one can't, because the page agrees in advance not to look at the
  // result — so it comes back (opaquely) whenever the server is actually
  // reachable, and fails only when the request genuinely didn't get out.
  //
  // One extra request, only when everything has already failed, and the backoff
  // in the polling hooks keeps that rare.
  const reachable = await fetch(probeUrl, { mode: 'no-cors' }).then(
    () => true,
    () => false,
  );

  if (reachable) {
    return `The flight services are answering, but refusing to let a web page read the reply (no CORS headers), so this app can't use them from a browser. That is a change at their end, not a fault on your device or your connection. Tried: ${failures.join(', ')}.`;
  }

  return `Couldn't reach any flight service (${failures.join(', ')}). Nothing left this device, so a tracker/ad blocker, a VPN or a private-relay setting is the usual cause — try another browser to check.`;
}

/**
 * The aircraft array out of whatever shape the service wrapped it in, or null
 * if there isn't one. Aircraft have lived under `ac` and under `aircraft` in
 * different versions of this API, and a bare array is a plausible third shape.
 */
function aircraftList(payload: unknown, answered: string): Record<string, unknown>[] | null {
  if (typeof payload !== 'object' || payload === null) return null;
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
    return null;
  }
  return list.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null);
}

export async function fetchLivePosition(callsign: string, signal?: AbortSignal): Promise<LiveResult> {
  let payload: unknown;
  let answered = '';
  let failures: string[] = [];

  try {
    ({ payload, answered, failures } = await askOneService(
      (endpoint) => [endpoint.callsign(encodeURIComponent(callsign))],
      signal,
    ));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { state: 'error', message: 'cancelled' };
    }
    throw error;
  }

  const unreachable = await whyUnreachable(answered, failures, ENDPOINTS[0].callsign('TEST'));
  if (unreachable) return { state: 'error', message: unreachable };

  const list = aircraftList(payload, answered);
  if (!list) {
    return { state: 'error', message: `${answered} replied in a format this app doesn't recognise.` };
  }
  if (list.length === 0) return { state: 'not-found' };

  // Prefer an entry that actually carries a position: the feed sometimes knows
  // of an aircraft (from its identifier alone) without a current fix.
  const withPosition = list
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

/* ------------------------------------------------------- aircraft in an area */

/**
 * One aircraft in a region, as the feed describes it.
 *
 * Richer than `LivePosition` because an area list is read as a list: a row with
 * no callsign and no vertical rate is a row you can't tell anything from, so
 * the fields a list needs are carried even though a single tracked flight
 * doesn't use them.
 */
export interface AreaAircraft {
  /** Radio callsign as broadcast, trimmed. Null when the aircraft isn't sending
   *  one — common for general aviation and military traffic. */
  callsign: string | null;
  lat: number;
  lon: number;
  /** Barometric altitude in feet, as aviation quotes it. Undefined when the
   *  aircraft reports itself on the ground. */
  altitudeFt?: number;
  /** Climb (+) or descent (−) in feet per minute. The single most telling field
   *  in the list: it is what separates an arrival from a departure. */
  verticalRateFpm?: number;
  groundSpeedKts?: number;
  headingDeg?: number;
  /** The feed says this aircraft is on the ground rather than airborne. */
  onGround: boolean;
  /** Aircraft type code (e.g. "A320"), when the feed carries one. */
  type?: string;
  registration?: string;
  receivedAt: number;
}

export type AreaResult =
  | { state: 'found'; aircraft: AreaAircraft[] }
  /** Reached a service; there is simply nothing flying in that circle. */
  | { state: 'empty' }
  | { state: 'error'; message: string };

/**
 * Every aircraft currently within `radiusNm` of a point.
 *
 * Same three services, same fallback, same tolerance about field names as the
 * callsign lookup above — and the same caution applies: this was written
 * without being able to reach the real services, so it accepts several
 * plausible spellings of each field rather than assuming one.
 */
export async function fetchAircraftNear(
  lat: number,
  lon: number,
  radiusNm: number,
  signal?: AbortSignal,
): Promise<AreaResult> {
  // All three services cap the radius at 250 nm, and a request over the cap is
  // rejected outright rather than clamped for you.
  const nm = Math.max(1, Math.min(250, Math.round(radiusNm)));
  const at = (n: number) => n.toFixed(3);
  /** Which spellings were offered to each service on this call, so a result
   *  reported by position can be mapped back to the spelling it refers to. */
  const offeredForms = new Map<string, number[]>();

  let payload: unknown;
  let answered = '';
  let failures: string[] = [];
  try {
    ({ payload, answered, failures } = await askOneService(
      (endpoint) => {
        const known = workingAreaForm.get(endpoint.name);
        // Once a spelling has answered, ask only in that one; otherwise ask in
        // every spelling the service hasn't already refused.
        const offered =
          known === undefined
            ? endpoint.area.map((_, i) => i).filter((i) => !deadForms.has(`${endpoint.name}:${i}`))
            : [known];
        offeredForms.set(endpoint.name, offered);
        return offered.map((i) => endpoint.area[i](Number(at(lat)), Number(at(lon)), nm));
      },
      signal,
      (endpoint, offeredIndex) => {
        // `offeredIndex` counts within the list that was offered, which may be
        // shorter than `endpoint.area` once a spelling has been refused — so it
        // has to be mapped back before it means anything.
        const actual = offeredForms.get(endpoint.name)?.[offeredIndex];
        if (actual !== undefined && !workingAreaForm.has(endpoint.name)) {
          workingAreaForm.set(endpoint.name, actual);
        }
      },
      (endpoint, offeredIndex) => {
        const actual = offeredForms.get(endpoint.name)?.[offeredIndex];
        if (actual !== undefined) deadForms.add(`${endpoint.name}:${actual}`);
      },
    ));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { state: 'error', message: 'cancelled' };
    }
    throw error;
  }

  const unreachable = await whyUnreachable(answered, failures, ENDPOINTS[0].area[0](Number(at(lat)), Number(at(lon)), nm));
  if (unreachable) return { state: 'error', message: unreachable };

  const list = aircraftList(payload, answered);
  if (!list) return { state: 'error', message: `${answered} replied in a format this app doesn't recognise.` };

  const now = Date.now();
  const aircraft: AreaAircraft[] = [];
  for (const entry of list) {
    const aLat = num(entry, 'lat', 'latitude');
    const aLon = num(entry, 'lon', 'lng', 'longitude');
    if (aLat === undefined || aLon === undefined) continue; // knows of it, can't place it

    // `alt_baro` is the string "ground" for an aircraft on the tarmac, which is
    // why num() rejects that word rather than coercing it to a number — NaN
    // here would read as an altitude of zero feet and nothing would say why.
    const rawAlt = entry.alt_baro ?? entry.altitude ?? entry.alt;
    const onGround = rawAlt === 'ground' || entry.ground === true;

    const secondsOld = num(entry, 'seen_pos', 'seen') ?? 0;
    const callsign = typeof entry.flight === 'string' ? entry.flight.trim() : null;

    aircraft.push({
      callsign: callsign || null,
      lat: aLat,
      lon: aLon,
      altitudeFt: onGround ? undefined : num(entry, 'alt_baro', 'alt_geom', 'altitude', 'alt'),
      verticalRateFpm: num(entry, 'baro_rate', 'geom_rate', 'vert_rate', 'vrate'),
      groundSpeedKts: num(entry, 'gs', 'ground_speed', 'speed'),
      headingDeg: num(entry, 'track', 'heading', 'true_heading'),
      onGround,
      type: typeof entry.t === 'string' ? entry.t : typeof entry.type === 'string' ? entry.type : undefined,
      registration: typeof entry.r === 'string' ? entry.r : undefined,
      receivedAt: now - secondsOld * 1000,
    });
  }

  if (aircraft.length === 0) return { state: 'empty' };
  return { state: 'found', aircraft };
}
