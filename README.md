# Flight Tracker

Type in a flight number and watch the aircraft: its real position, altitude, speed and heading, picked up from what the aeroplane itself is broadcasting.

That is the whole requirement — no airports, no times. Add the schedule as well and you also get the route drawn, how far it has come, how long is left, and an estimated position for the long stretches where nobody on the ground can hear the aircraft. The app always says which of the two you are looking at.

There is a second space, **NKM**, which answers a different question: what is flying around Nagoya Airfield (Komaki) right now. See [The airfield view](#the-airfield-view) for what it can and can't tell you.

## Coverage, and why it comes and goes

Live positions come from free community networks — [adsb.lol](https://adsb.lol), [adsb.fi](https://adsb.fi) and [airplanes.live](https://airplanes.live) — where volunteers run receivers that pick up the position aircraft broadcast continuously (ADS-B) and pool them. No account, no key, no cost. All three are asked in turn until one answers, and the one that answered is tried first next time, so the steady state is a single request per poll.

The consequence of "volunteers on the ground" is the thing to understand about the whole feature: **coverage follows people, not aeroplanes.** Over Europe, North America, Japan and eastern Australia it is excellent. In the middle of an ocean there is nobody to hear the broadcast, so a long-haul flight goes quiet for hours. Filling those gaps needs satellite reception, which is a paid service.

So a gap is the normal condition, not a fault. When the signal drops the app keeps the last known position, says how long ago it was, and goes on estimating from the schedule — a great circle flown at a constant rate. An estimate cannot know about holding, diversions or delays, so figures measured from the aircraft are marked with a `·` and the rest are not.

## The airfield view

The second space lists every aircraft within 40 nautical miles of Nagoya Airfield (Komaki, NKM), labelled by what it appears to be doing: **arriving**, **departing**, **on the ground**, or **passing over**.

**It is not a departure board, and can't become one.** There is no free feed of scheduled flights, so nothing here knows that a flight is due out at 09:15. Every row is an aeroplane broadcasting its position at this moment. One that hasn't pushed back yet isn't listed; one that landed an hour ago is long gone. Komaki is a quiet field — an empty list outside its flying hours is the correct answer, and the empty state says so rather than looking like a failure.

The labels are inferred from altitude, vertical rate and distance, with one piece of local knowledge doing most of the work: **Chubu Centrair is 25 km down the road.** Any circle wide enough to catch Komaki's own arrivals contains Centrair and everything descending into it, and Centrair is far busier. So every aircraft is measured against both fields and attributed to the nearer one; traffic working Centrair is listed as `At NGO` rather than being passed off as a Komaki arrival. Anything the maths can't place confidently — no altitude, no vertical rate, or still in the cruise above 13,000 ft — is called "passing over" rather than guessed at. An over-eager guess doesn't read as a guess on screen; it reads as the app being wrong about a flight.

`src/airfield.ts` holds the thresholds and the reasoning; the view itself is `src/AirfieldView.tsx`. Pointing it at a different airfield is a matter of changing the two constants at the top of `airfield.ts`.

## Look

Light, warm and quiet, with exactly one saturated colour in it — the aircraft. Everything else is ink, grey and hairline, and state is signalled by weight and position rather than by giving each condition its own hue.

The scheme is light for a structural reason rather than a fashionable one: the map is the content, and on a dark interface the map was also the brightest thing on screen, so the chrome and the content competed for attention. On a paper-coloured page the map is the *darkest* thing, and the eye goes there without being directed.

`src/palette.ts` holds the whole vocabulary — seven values. If a new colour seems necessary, it probably isn't.

## The three decisions worth knowing

**The map has two layers.** On top, OpenStreetMap raster tiles — real coastlines, place names, terrain. Underneath, drawn first and covered when the tiles arrive, the bundled 110m coastline (`src/coastline.ts`, Natural Earth, public domain) as vector paths. Offline, at altitude, or behind a blocker, the tiles simply don't appear and the drawn outline carries the route instead.

The tiles were removed at one point in favour of the vector outline alone, on the reasoning that an app with no external requests was worth a coarse map. That reasoning expired the moment live positions were added: the app already needs a connection for the thing it exists to do. The outline survives as the fallback, which is what it was always genuinely good for.

**Little else leaves this page.** The Content-Security-Policy in `index.html` allows the three flight networks and the tile server, and nothing else — no analytics, no font host. Your flights stay in this browser and are never uploaded; the only thing sent out is a radio callsign.

**A flight number is enough.** The schedule is optional throughout: `Flight` carries its four schedule fields as all-or-nothing (`hasSchedule`), `resolveProgress` returns null without them, and the map, the statistics and the polling all adapt rather than requiring them. Flights saved before this was true load unchanged.

**Ticket numbers aren't radio callsigns.** Your boarding pass says `QF12`; the aircraft identifies itself as `QFA12`. Looking up live traffic by the ticket number finds nothing, so `src/airlines.ts` translates the airline prefix. Padding then varies by airline with no rule behind it — the same flight may broadcast as `JST24`, `JST024` or `JST0024` — so the spellings are tried in turn and the one that matched is remembered and reported. Typing a callsign directly also works, which is the way round an airline the table doesn't carry.

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

## Airports

There is nothing to add. `src/airports-data.ts` carries every airport in the world with an IATA code — about 5,500 — generated from [OurAirports](https://ourairports.com) (public domain) by `npm run airports`.

It replaced a table of 136 typed out by hand, which covered roughly one airport in forty: Birmingham, Treviso and most of the world could not be entered at all. The data costs about 145 KB gzipped, which is most of what the app downloads, and that is a deliberate trade — an airport picker that fails on the majority of real journeys makes the whole app worth less than the download saves.

Rows are parsed on first use, so following a flight by number alone never touches them, and the table is built as its own chunk so a code deploy leaves it cached.

## Layout

| Path | What lives there |
| --- | --- |
| `src/geo.ts` | Great-circle maths — distance, bearing, interpolation, sampling |
| `src/time.ts` | Airport-local ⇄ UTC conversion, duration and clock formatting |
| `src/flights.ts` | The flight record, its storage, and everything derived from it |
| `src/live.ts` | Fetching and parsing live aircraft positions, one flight or a whole area |
| `src/useLive.ts` | Polling one flight: only airborne, only when visible, every 20s |
| `src/airfield.ts` | Which field an aircraft belongs to, and whether it's arriving or departing |
| `src/useAirfield.ts` | Polling an airfield's traffic, only while that view is open |
| `src/AirfieldView.tsx` | The NKM space |
| `src/airlines.ts` | Ticket-number → radio-callsign translation |
| `src/airports.ts` | Airport lookup and ranked search |
| `src/airports-data.ts` | Generated airport table — do not hand-edit |
| `src/coastline.ts` | Generated basemap geometry — do not hand-edit |
| `src/RouteMap.tsx` | Web Mercator projection, the basemap, the route, the aircraft, full screen |
| `src/FlightDetail.tsx` | The tracking view for one flight |
| `src/FlightForm.tsx` | Add/edit, with airport search and schedule validation |
| `tools/` | The coastline generator and the single-file bundler |

Position, progress, phase and ETA are all *derived* from the schedule on each tick, never stored — one source of truth, and no cached state that can drift out of step with the clock.

## A caution

The callsign lookup in `src/live.ts` is confirmed against the real services. The **area lookup behind the airfield view is not** — the machine it was written on cannot reach the three hosts (they are blocked at its egress proxy), so its URLs come from the services' own documentation rather than from a reply anyone has seen, and the documentation disagrees between services. Each service is therefore asked in the spellings worth trying, best first, and the one that answers is remembered; when every one fails the error names the exact paths tried, so a screenshot of it is a diagnosis. adsb.fi has moved this call to `/v3`, adsb.lol inherits ADSB Exchange's `lat/lon/dist` shape, and airplanes.live uses `point`.

`src/live.ts` was originally written without ever being run against the real service — the machine it was built on couldn't reach the network. Its response handling is deliberately tolerant, accepting several plausible shapes for each field and reporting precisely what it couldn't understand rather than failing blank. Every state (found, nothing found, offline, malformed reply, server error) is covered by a browser test against a simulated service. But the first contact with the real thing is a live test. If the format turns out to be confirmed, the parsing can be tightened considerably.

## Origin

This began as a second page inside [Sean's RAW Editor](https://github.com/SB1947JP/seans-raw-editor) and was moved out once it was clear it shared nothing with a photo editor but a repository. The colour tokens in `src/palette.ts` came with it.
