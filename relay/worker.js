/**
 * A relay between the app and the flight services.
 *
 * Why this exists at all: the ADS-B networks answer requests perfectly well,
 * but they don't send the header that lets a *web page* read the reply, so a
 * browser throws the data away before the app ever sees it. The app has no
 * server of its own — it is a static page — so this is the smallest possible
 * one: it asks on the page's behalf and passes the answer back with permission
 * attached.
 *
 * Deliberately NOT a general-purpose proxy. It will only fetch the handful of
 * URL shapes this app actually uses, from three named hosts, for the origins
 * the app is served from. An open relay is something strangers find and abuse
 * within days, and the abuse would be attributed to whoever owns it.
 *
 * Deploy: see the README section "The relay".
 */

/** The only hosts this will ever talk to, by the short name the app uses. */
const UPSTREAMS = {
  'adsb.lol': 'https://api.adsb.lol',
  'adsb.fi': 'https://opendata.adsb.fi',
  'airplanes.live': 'https://api.airplanes.live',
};

/**
 * The only paths it will fetch. Anything else is refused.
 *
 * These are exactly the two questions the app asks — "where is this callsign"
 * and "what is within N miles of this point" — written out per service, since
 * the three spell them differently.
 */
const ALLOWED_PATHS = [
  /^\/v2\/callsign\/[A-Z0-9]{2,12}$/i,
  /^\/v2\/lat\/-?\d{1,3}(\.\d{1,4})?\/lon\/-?\d{1,3}(\.\d{1,4})?\/dist\/\d{1,3}$/,
  /^\/v2\/point\/-?\d{1,3}(\.\d{1,4})?\/-?\d{1,3}(\.\d{1,4})?\/\d{1,3}$/,
  /^\/api\/v[23]\/callsign\/[A-Z0-9]{2,12}$/i,
  /^\/api\/v[23]\/lat\/-?\d{1,3}(\.\d{1,4})?\/lon\/-?\d{1,3}(\.\d{1,4})?\/dist\/\d{1,3}$/,
];

/** Pages allowed to use this relay. Localhost is here so `npm run dev` works. */
const ALLOWED_ORIGINS = [
  'https://sb1947jp.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
];

/**
 * Who is calling, in the form these services ask for.
 *
 * Browsers won't let a page set this, which is part of why the networks can't
 * tell one web app from another and have grown wary of them. A relay can, so
 * it does: a name and a link, so anyone at adsb.lol looking at their logs can
 * see what this traffic is and get in touch rather than just blocking it.
 */
const USER_AGENT = 'SeanFlightTracker/1.0 (+https://github.com/SB1947JP/Flight-Tracker)';

/**
 * Seconds to reuse an answer for.
 *
 * The app polls every 20s, so this is mostly about several open tabs — or
 * several people — not multiplying into several requests upstream. Aircraft
 * positions are perishable, so it stays well under the poll interval.
 */
const CACHE_SECONDS = 10;

function corsHeaders(origin) {
  return {
    // Named origins rather than '*': this relay is for this app, and a wildcard
    // is an invitation to every other page on the internet.
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
  };
}

function refuse(status, message, origin) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin ?? 'null') },
  });
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') ?? '';
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : null;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin ?? 'null') });
    }
    if (request.method !== 'GET') return refuse(405, 'Only GET.', allowedOrigin);

    // A request with no Origin at all is someone typing the URL into a browser
    // or a script poking at it; neither is this app, and both are refused.
    if (!allowedOrigin) return refuse(403, 'This relay only serves the flight tracker.', null);

    const url = new URL(request.url);
    // The first path segment names the service; the rest is passed through.
    const [, service, ...rest] = url.pathname.split('/');
    const upstream = UPSTREAMS[service];
    if (!upstream) return refuse(404, `Unknown service "${service}".`, allowedOrigin);

    const path = `/${rest.join('/')}`;
    if (!ALLOWED_PATHS.some((allowed) => allowed.test(path))) {
      return refuse(400, 'That is not a request this relay makes.', allowedOrigin);
    }

    let response;
    try {
      response = await fetch(upstream + path, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
      });
    } catch {
      return refuse(502, 'The flight service could not be reached.', allowedOrigin);
    }

    // The upstream's status is passed through rather than flattened, so the app
    // can still tell "nothing found" from "they are refusing us" — which is the
    // distinction that took all morning to establish and is worth keeping.
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
        ...corsHeaders(allowedOrigin),
      },
    });
  },
};
