/**
 * Generates the bundled airport table from OurAirports data (public domain),
 * shipped in the `@nwpr/airport-codes` npm package.
 *
 *   node gen-airports.mjs > ../src/airports-data.ts
 *
 * The table it replaces was 136 airports typed from memory, which is roughly
 * 2% of the airports that have an IATA code. Anything outside it — Birmingham,
 * Treviso, most of the world — simply could not be entered.
 */
import pkg from '@nwpr/airport-codes';
const all = (pkg.default || pkg);

// Superseded zone names in the source data. Both forms resolve to the same
// times in every browser, but the canonical names are what `Intl` reports and
// what anyone comparing this file against another source will expect.
const TZ_ALIASES = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'Europe/Kiev': 'Europe/Kyiv',
  'Pacific/Ponape': 'Pacific/Pohnpei',
  'Pacific/Truk': 'Pacific/Chuuk',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'America/Godthab': 'America/Nuuk',
};

const rows = [];
const zones = [];
const zoneIndex = new Map();
const seen = new Set();

for (const a of all) {
  if (!a.iata || !/^[A-Z0-9]{3}$/.test(a.iata)) continue;
  if (a.type !== 'airport') continue;
  if (!a.tz || typeof a.latitude !== 'number' || typeof a.longitude !== 'number') continue;
  if (seen.has(a.iata)) continue;               // first entry wins; codes are unique in practice
  seen.add(a.iata);

  const tz = TZ_ALIASES[a.tz] ?? a.tz;
  if (!zoneIndex.has(tz)) { zoneIndex.set(tz, zones.length); zones.push(tz); }

  // Names carry "Airport"/"International" on nearly every row; dropping those
  // words costs nothing to recognisability and takes ~8% off the file.
  const name = String(a.name)
    .replace(/\s+International\b/gi, '')
    .replace(/\s+Airport\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  rows.push([
    a.iata,
    name,
    a.city ?? '',
    a.country ?? '',
    a.latitude.toFixed(3),      // ~110 m, far finer than a route map can show
    a.longitude.toFixed(3),
    zoneIndex.get(tz),
  ].join('\t'));
}

rows.sort();
process.stderr.write(`${rows.length} airports, ${zones.length} timezones\n`);

process.stdout.write(`/**
 * Every airport with an IATA code, from OurAirports (public domain).
 *
 * Generated — do not hand-edit. See \`tools/gen-airports.mjs\`.
 *
 * Stored as one tab-separated line per airport rather than as an array of
 * objects, and timezones as indices into a shared list: the same data as JSON
 * objects is roughly three times the size, and this file is already the largest
 * thing the app ships. It is parsed once, on first use.
 *
 * This replaced a table of 136 airports typed out by hand — about 2% of these —
 * which meant most of the world's airports simply could not be entered.
 */
export const TIMEZONES: string[] = ${JSON.stringify(zones)};

export const AIRPORT_ROWS = ${JSON.stringify(rows.join('\n'))};
`);
