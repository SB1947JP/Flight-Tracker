# Flight Tracker

Type in a flight — its number, the two airports, and the two times off your ticket — and see where it is: status and phase, time remaining, how far it has flown and how far is left, and its position on a map.

Everything runs in the browser. Nothing is sent anywhere.

## What it is honest about

There is no live data feed behind this. What it shows is **where a flight would be if it flew its schedule**: a great circle, flown at a constant rate, between two airports. It cannot know that a flight is holding, diverted, or an hour late, and it says so on screen rather than implying a radar contact.

That is a deliberate trade, not a missing feature. A live flight-status API would mean an outbound connection and a third-party origin; keeping the app sealed means it also works with the wifi off, at 38,000 feet, which is the moment you most want it.

## The three decisions worth knowing

**No network, at all.** The Content-Security-Policy in `index.html` allows no external origin — no API, no font host, no map tile server. The basemap is bundled coastline geometry (`src/coastline.ts`, Natural Earth 110m, public domain) drawn as vector paths, not raster tiles. Tiles look better, but they cost a third-party origin, an attribution requirement, and a live connection; 28 KB of gzipped coastline buys a map that always works.

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
| `src/airports.ts` | The bundled airport table |
| `src/coastline.ts` | Generated basemap geometry — do not hand-edit |
| `src/RouteMap.tsx` | Web Mercator projection, the basemap, the route and the aircraft |
| `src/FlightDetail.tsx` | The tracking view for one flight |
| `src/FlightForm.tsx` | Add/edit, with airport search and schedule validation |
| `tools/` | The coastline generator and the single-file bundler |

Position, progress, phase and ETA are all *derived* from the schedule on each tick, never stored — one source of truth, and no cached state that can drift out of step with the clock.

## Origin

This began as a second page inside [Sean's RAW Editor](https://github.com/SB1947JP/seans-raw-editor) and was moved out once it was clear it shared nothing with a photo editor but a repository. The colour tokens in `src/palette.ts` came with it.
