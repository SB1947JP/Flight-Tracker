# Flight Tracker

Type in a flight — its number, the two airports, and the two times off your ticket — and see where it is: status and phase, time remaining, how far it has flown and how far is left, and its position on a map.

Where there's coverage it shows the aircraft's **real** position, altitude and speed, picked up from what the aeroplane itself is broadcasting. Where there isn't, it falls back to working the position out from the schedule. It always says which of the two you are looking at.

## Coverage, and why it comes and goes

Live positions come from [adsb.lol](https://adsb.lol), a free community network: volunteers run receivers that pick up the position aircraft broadcast continuously (ADS-B), and pool them. No account, no key, no cost.

The consequence of "volunteers on the ground" is the thing to understand about the whole feature: **coverage follows people, not aeroplanes.** Over Europe, North America, Japan and eastern Australia it is excellent. In the middle of an ocean there is nobody to hear the broadcast, so a long-haul flight goes quiet for hours. Filling those gaps needs satellite reception, which is a paid service.

So a gap is the normal condition, not a fault. When the signal drops the app keeps the last known position, says how long ago it was, and goes on estimating from the schedule — a great circle flown at a constant rate. An estimate cannot know about holding, diversions or delays, so figures measured from the aircraft are marked with a `·` and the rest are not.

## The three decisions worth knowing

**Exactly one outside connection.** The Content-Security-Policy in `index.html` allows `api.adsb.lol` and nothing else — no analytics, no font host, no map tile server. Your flights stay in this browser and are never uploaded; the only thing sent out is a radio callsign. The basemap is bundled coastline geometry (`src/coastline.ts`, Natural Earth 110m, public domain) drawn as vector paths rather than fetched tiles, so everything except the live position still works with no connection at all — which matters on a plane, where the schedule estimate is all anyone can have anyway.

**Ticket numbers aren't radio callsigns.** Your boarding pass says `QF12`; the aircraft identifies itself as `QFA12`. Looking up live traffic by the ticket number finds nothing, so `src/airlines.ts` translates the airline prefix. Typing a callsign directly also works, which is the way round an airline the table doesn't carry.

**Times are airport-local.** You enter times the way they are printed on a boarding pass — each in its own airport's local time — and they are stored as UTC instants. The conversion uses `Intl.DateTimeFormat`, which already ships a current IANA timezone database in every browser, so it is correct across DST transitions with no dependency and no data to go stale. This is why each row in `src/airports.ts` carries an IANA zone name rather than a fixed UTC offset, which would be wrong half the year anywhere that observes summer time.

**Routes are real great circles**, computed on the sphere and projected to pixels only at draw time — interpolating in Mercator space would put the aircraft visibly off its own track. The path is sampled into 128 segments and unwrapped across ±180°, so a Pacific crossing draws as one continuous line instead of tearing back across the world.

## Running it

```sh
npm install
npm run dev        # development
npm run build      # production build into dist/
npm run preview    # serve the production build
```

Two extras:

```sh
npm run coastline                  # regenerate src/coastline.ts from Natural Earth
node tools/build-singlefile.mjs    # after a build: inline everything into dist/single.html
```

`single.html` is the whole app as one self-contained file, which is what makes it publishable anywhere that serves a single page.

## Adding an airport

`src/airports.ts` holds about 130 of the busiest passenger airports. Adding one is a row: IATA code, position in degrees, and its IANA timezone name. An unrecognised code is reported in the form rather than silently accepted.

## Layout

| Path | What lives there |
| --- | --- |
| `src/geo.ts` | Great-circle maths — distance, bearing, interpolation, sampling |
| `src/time.ts` | Airport-local ⇄ UTC conversion, duration and clock formatting |
| `src/flights.ts` | The flight record, its storage, and everything derived from it |
| `src/live.ts` | Fetching and parsing live aircraft positions |
| `src/useLive.ts` | Polling: only airborne, only when visible, every 20s |
| `src/airlines.ts` | Ticket-number → radio-callsign translation |
| `src/airports.ts` | The bundled airport table |
| `src/coastline.ts` | Generated basemap geometry — do not hand-edit |
| `src/RouteMap.tsx` | Web Mercator projection, the basemap, the route and the aircraft |
| `src/FlightDetail.tsx` | The tracking view for one flight |
| `src/FlightForm.tsx` | Add/edit, with airport search and schedule validation |
| `tools/` | The coastline generator and the single-file bundler |

Position, progress, phase and ETA are all *derived* from the schedule on each tick, never stored — one source of truth, and no cached state that can drift out of step with the clock.

## A caution

`src/live.ts` was written without ever being run against the real service — the machine it was built on couldn't reach the network. Its response handling is deliberately tolerant, accepting several plausible shapes for each field and reporting precisely what it couldn't understand rather than failing blank. Every state (found, nothing found, offline, malformed reply, server error) is covered by a browser test against a simulated service. But the first contact with the real thing is a live test. If the format turns out to be confirmed, the parsing can be tightened considerably.

## Origin

This began as a second page inside [Sean's RAW Editor](https://github.com/SB1947JP/seans-raw-editor) and was moved out once it was clear it shared nothing with a photo editor but a repository. The colour tokens in `src/palette.ts` came with it.
