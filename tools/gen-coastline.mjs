/**
 * Generates the bundled coastline used by the flight tracker's basemap.
 *
 * Source: Natural Earth 110m land, via the `world-atlas` npm package (public
 * domain). Run offline; the output is committed so the app has no build-time
 * network dependency and no runtime one either.
 *
 *   node gen-coastline.mjs > ../src/coastline.ts
 */
import { readFileSync } from 'node:fs';
import { feature } from 'topojson-client';

const topo = JSON.parse(readFileSync(new URL('./node_modules/world-atlas/land-110m.json', import.meta.url)));
const land = feature(topo, topo.objects.land);

// Quantise to 2 decimal places (~1.1 km at the equator). At the zoom levels a
// route map uses — the whole world down to a few hundred km across — that is
// well under a pixel, and it roughly halves the payload.
const round = (n) => Math.round(n * 100) / 100;

/** Drop consecutive duplicate points left behind by quantisation. */
function dedupe(ring) {
  const out = [];
  for (const [lon, lat] of ring) {
    const p = [round(lon), round(lat)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}

const rings = [];
for (const f of land.features) {
  const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      const cleaned = dedupe(ring);
      // A ring needs three distinct points to enclose any area at all; below
      // that it is a quantisation artefact, not an island.
      if (cleaned.length >= 4) rings.push(cleaned);
    }
  }
}

const points = rings.reduce((n, r) => n + r.length, 0);
process.stderr.write(`${rings.length} rings, ${points} points\n`);

process.stdout.write(`/**
 * World coastline, Natural Earth 110m land (public domain), as closed rings of
 * [longitude, latitude] in degrees.
 *
 * Generated — do not hand-edit. See \`tools/gen-coastline.mjs\`.
 *
 * This is the basemap. The tracker draws land from these polygons rather than
 * fetching raster map tiles, which is what lets the whole app run with no
 * network at all: no tile host, no third-party origin to allow in the CSP, no
 * attribution requirement, and a map that still works at 38,000 feet with the
 * wifi off — which is, after all, when you most want a flight tracker.
 *
 * 110m is coarse: coastlines and major islands, no borders, no place names. At
 * the scale a route map works at — a whole ocean across the screen — that is
 * the level of detail that survives anyway.
 */
export const COASTLINE: [number, number][][] = ${JSON.stringify(rings)};
`);
