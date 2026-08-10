import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { COASTLINE } from './coastline';
import { UI_COLORS } from './palette';
import { LatLon, samplePath } from './geo';
import { FlightProgress } from './flights';

/**
 * The route map: the great circle, the portion already flown, and the estimated
 * aircraft position, over a vector basemap.
 *
 * Hand-written Web Mercator rather than a map library — the whole job is
 * projecting some polygons and a path, and Leaflet would add a dependency, a
 * stylesheet and marker assets to do it.
 *
 * The basemap is bundled coastline geometry drawn as SVG paths, *not* raster
 * tiles from a tile server. Tiles look better — they carry place names and
 * terrain — but they cost a third-party origin in the CSP, an attribution
 * requirement, and a live connection. Trading them for 28 KB of gzipped
 * coastline buys an app with no external requests at all, which still draws
 * your route at 38,000 feet with the wifi off. For a flight tracker that seems
 * like the better side of the trade.
 *
 * `TILE_SIZE` survives as the projection's scale constant: Web Mercator tile
 * coordinates are defined in 256-pixel tiles, and keeping that unit means the
 * zoom levels here mean the same thing they do on any other slippy map.
 */

const TILE_SIZE = 256;
const MIN_ZOOM = 1;
const MAX_ZOOM = 12;
/** Great circles are sampled, not drawn straight — see `samplePath`. */
const PATH_SEGMENTS = 128;

function lonToTileX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * 2 ** zoom;
}

function latToTileY(lat: number, zoom: number): number {
  // Mercator diverges at the poles; clamp to the standard ±85.0511° web
  // Mercator limit so a polar great circle can't produce an infinite y.
  const clamped = Math.max(-85.0511, Math.min(85.0511, lat));
  const rad = (clamped * Math.PI) / 180;
  return ((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * 2 ** zoom;
}

/**
 * Project a sampled path to tile coordinates, unwrapped across the
 * antimeridian: a Tokyo→Los Angeles route crosses 180°, where the raw
 * longitude jumps from +179 to −179 and would draw a line straight back across
 * the entire world. Each point is instead placed on whichever copy of the world
 * is nearest its predecessor, so the path stays continuous.
 */
function projectPath(points: LatLon[], zoom: number): { x: number; y: number }[] {
  const world = 2 ** zoom;
  const out: { x: number; y: number }[] = [];
  let previousX: number | null = null;
  for (const p of points) {
    let x = lonToTileX(p.lon, zoom);
    if (previousX !== null) {
      // Shift by whole worlds until this point is on the near side.
      x -= Math.round((x - previousX) / world) * world;
    }
    previousX = x;
    out.push({ x, y: latToTileY(p.lat, zoom) });
  }
  return out;
}

/**
 * The coastline as SVG path data, in tile coordinates at a given zoom.
 *
 * Each ring is unwrapped the same way the route is, so land masses that span
 * the antimeridian (Russia, Antarctica, Fiji) don't smear across the map. Rings
 * are then emitted at three world offsets — one world left, centre, one world
 * right — because panning past ±180° should show the same continents again
 * rather than sailing off a flat earth.
 */
function coastlinePath(zoom: number): string {
  const world = 2 ** zoom;
  const parts: string[] = [];
  for (const ring of COASTLINE) {
    const projected = projectPath(
      ring.map(([lon, lat]) => ({ lon, lat })),
      zoom,
    );
    for (const offset of [-world, 0, world]) {
      let d = '';
      for (let i = 0; i < projected.length; i++) {
        const p = projected[i];
        d += `${i === 0 ? 'M' : 'L'}${(p.x + offset).toFixed(3)} ${p.y.toFixed(3)}`;
      }
      parts.push(`${d}Z`);
    }
  }
  return parts.join('');
}

export function RouteMap({
  progress,
  livePosition,
}: {
  /** The route to draw. Null when a flight is being followed by number alone —
   *  then there is only an aircraft to show, and the map centres on it. */
  progress: FlightProgress | null;
  /** A real reported position, when one is available. The aircraft is drawn
   *  here instead of at its scheduled place along the route — which is the
   *  whole point: the gap between the two is the delay. */
  livePosition?: { lat: number; lon: number; headingDeg?: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<{ zoom: number; x: number; y: number } | null>(null);
  const dragRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);

  // With no route, both ends collapse onto the aircraft itself, so the fitting
  // and projection below work unchanged and simply frame a single point.
  const anchor: LatLon = livePosition ?? { lat: 0, lon: 0 };
  const from: LatLon = progress ? { lat: progress.origin.lat, lon: progress.origin.lon } : anchor;
  const to: LatLon = progress ? { lat: progress.destination.lat, lon: progress.destination.lon } : anchor;

  // The full route, in geographic space. Only the endpoints matter here, so
  // this doesn't need recomputing every tick as the aircraft advances.
  // Keyed on the coordinates rather than the objects: `from`/`to` are rebuilt
  // on every render (including every one-second tick), so an object identity
  // dependency would resample the path 128 times a second and re-fit the map
  // out from under a pan.
  const fullPath = useMemo(() => samplePath(from, to, 0, 1, PATH_SEGMENTS), [from.lat, from.lon, to.lat, to.lon]);

  /** Fit the whole route in view with a margin, at the tightest zoom that holds it. */
  const fit = useCallback(() => {
    const { width, height } = size;
    if (width === 0 || height === 0) return;

    // Measure the route's extent on a unit world (zoom 0), then pick the zoom.
    const unit = projectPath(fullPath, 0);
    const xs = unit.map((p) => p.x);
    const ys = unit.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    // Padding keeps the endpoint labels and the aircraft marker off the edge;
    // the epsilon floor stops a zero-length route (same airport twice) from
    // dividing by zero and asking for infinite zoom.
    const spanX = Math.max(maxX - minX, 1e-4);
    const spanY = Math.max(maxY - minY, 1e-4);
    const padding = 56;
    const usableW = Math.max(64, width - padding * 2);
    const usableH = Math.max(64, height - padding * 2);
    // A single point has no extent, so a fitted zoom would run to the maximum.
    // Zoom 5 instead: enough to show which country an aircraft is over, and no
    // closer than the bundled 110m coastline can honestly support — finer data
    // exists but costs ten times the download and sixty thousand points to
    // reproject, for detail a position marker doesn't need.
    const zoom = progress
      ? Math.max(
          MIN_ZOOM,
          Math.min(MAX_ZOOM, Math.floor(Math.log2(Math.min(usableW / (spanX * TILE_SIZE), usableH / (spanY * TILE_SIZE))))),
        )
      : 5;
    const scale = 2 ** zoom;
    setView({ zoom, x: ((minX + maxX) / 2) * scale, y: ((minY + maxY) / 2) * scale });
  }, [fullPath, size, progress]);

  // `fit` closes over `progress`, which is rebuilt every tick, so calling it
  // whenever it changes identity would re-frame the map once a second and undo
  // any pan. Trigger on a *description* of the view instead: the route's
  // endpoints, or — with no route — merely whether a position exists yet. A
  // followed aircraft is then framed once, when its first fix arrives, and left
  // alone as it moves.
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const fitTrigger = progress
    ? `route:${from.lat},${from.lon},${to.lat},${to.lon}:${size.width}x${size.height}`
    : `watch:${livePosition ? 'located' : 'nothing'}:${size.width}x${size.height}`;

  useEffect(() => {
    fitRef.current();
  }, [fitTrigger]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const changeZoom = (delta: number) => {
    setView((v) => {
      if (!v) return v;
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom + delta));
      if (next === v.zoom) return v;
      // Tile coordinates double per zoom level, so rescaling the centre keeps
      // whatever is under the middle of the map there.
      const scale = 2 ** (next - v.zoom);
      return { zoom: next, x: v.x * scale, y: v.y * scale };
    });
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    setView((v) => (v ? { ...v, x: v.x - dx / TILE_SIZE, y: v.y - dy / TILE_SIZE } : v));
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      dragRef.current = null;
    }
  };

  const { width, height } = size;
  const zoom = view?.zoom ?? MIN_ZOOM;

  // Project once, then split into flown/remaining at the aircraft. Projecting
  // the two halves separately would let them unwrap onto different copies of
  // the world and tear the line apart at the antimeridian.
  const projected = view ? projectPath(fullPath, zoom) : [];
  const toPixel = (p: { x: number; y: number }) => ({
    left: (p.x - (view?.x ?? 0)) * TILE_SIZE + width / 2,
    top: (p.y - (view?.y ?? 0)) * TILE_SIZE + height / 2,
  });
  const splitIndex = Math.round((progress?.fraction ?? 0) * PATH_SEGMENTS);
  const toPolyline = (pts: { x: number; y: number }[]) =>
    pts
      .map((p) => {
        const { left, top } = toPixel(p);
        return `${left.toFixed(1)},${top.toFixed(1)}`;
      })
      .join(' ');

  const originPx = projected.length ? toPixel(projected[0]) : { left: 0, top: 0 };
  const destPx = projected.length ? toPixel(projected[projected.length - 1]) : { left: 0, top: 0 };
  const schedulePx = projected.length ? toPixel(projected[Math.min(splitIndex, PATH_SEGMENTS)]) : { left: 0, top: 0 };

  // A live aircraft can be anywhere, including well off the great circle, so it
  // is projected on its own — then shifted onto whichever copy of the world the
  // route was drawn on, or a Pacific flight would land a whole map-width away.
  let planePx = schedulePx;
  let planeHeading = progress?.headingDeg ?? 0;
  if (livePosition && view) {
    const world = 2 ** zoom;
    let x = lonToTileX(livePosition.lon, zoom);
    x -= Math.round((x - view.x) / world) * world;
    planePx = toPixel({ x, y: latToTileY(livePosition.lat, zoom) });
    if (livePosition.headingDeg !== undefined) planeHeading = livePosition.headingDeg;
  }

  // Reprojecting 5,000 coastline points is the one genuinely expensive thing on
  // the page, and it depends only on zoom — so it is memoised and the pan is
  // applied as a cheap <g> translate rather than by rebuilding the geometry.
  const landPath = useMemo(() => (view ? coastlinePath(zoom) : ''), [view, zoom]);

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="relative w-full h-full min-h-[16rem] overflow-hidden rounded border border-neutral-700 bg-neutral-950 cursor-grab active:cursor-grabbing touch-none select-none"
    >
      {view && width > 0 && (
        <svg
          className="absolute inset-0 pointer-events-none"
          width={width}
          height={height}
          aria-label={
            progress ? `Route from ${progress.origin.iata} to ${progress.destination.iata}` : 'Aircraft position'
          }
        >
          {/* The basemap. Geometry is in tile coordinates, so the whole layer
              is positioned by one transform: scale tiles→pixels, then translate
              by the pan. Panning therefore costs a matrix update, not 5,000
              reprojected points. */}
          <g
            transform={`translate(${width / 2} ${height / 2}) scale(${TILE_SIZE}) translate(${-view.x} ${-view.y})`}
          >
            <path
              d={landPath}
              fill={UI_COLORS.land}
              stroke={UI_COLORS.coast}
              // Strokes scale with the transform, so the width has to be
              // divided back out to stay a hairline at every zoom.
              strokeWidth={1 / TILE_SIZE}
              fillRule="nonzero"
            />
          </g>

          {/* Remaining leg: dashed, so "not yet flown" reads at a glance
              without needing a second colour. */}
          {progress && <polyline
            points={toPolyline(projected.slice(splitIndex))}
            fill="none"
            stroke={UI_COLORS.muted}
            strokeWidth={2}
            strokeDasharray="5 5"
            strokeLinecap="round"
          />}
          {/* Flown leg: solid and brighter. */}
          {progress && <polyline
            points={toPolyline(projected.slice(0, splitIndex + 1))}
            fill="none"
            stroke={UI_COLORS.accent}
            strokeWidth={2.25}
            strokeLinecap="round"
          />}

          {(progress
            ? [
                { px: originPx, label: progress.origin.iata },
                { px: destPx, label: progress.destination.iata },
              ]
            : []
          ).map((end) => (
            <g key={end.label}>
              <circle cx={end.px.left} cy={end.px.top} r={4} fill="#0a0a0a" stroke={UI_COLORS.accent} strokeWidth={1.75} />
              <text
                x={end.px.left}
                y={end.px.top - 10}
                textAnchor="middle"
                fill={UI_COLORS.accent}
                className="text-[11px] font-medium"
                style={{ paintOrder: 'stroke', stroke: '#0a0a0a', strokeWidth: 3 }}
              >
                {end.label}
              </text>
            </g>
          ))}

          {/* The aircraft, rotated to its current track. The glyph is drawn
              nose-up, so the rotation is the bearing itself. */}
          {/* Where the schedule says it should be, shown only when the real
              aircraft is somewhere else — a hollow marker the live one can be
              compared against. */}
          {livePosition && progress?.status === 'enroute' && (
            <circle
              cx={schedulePx.left}
              cy={schedulePx.top}
              r={3.5}
              fill="none"
              stroke={UI_COLORS.muted}
              strokeWidth={1.5}
              strokeDasharray="2 2"
            />
          )}

          {(livePosition || (progress && progress.status !== 'scheduled')) && (
            <g transform={`translate(${planePx.left} ${planePx.top}) rotate(${planeHeading})`}>
              <path
                d="M0 -11 L2.6 -3.5 L11 3 L11 5.4 L2.6 2.6 L2.6 8 L5.4 10.4 L5.4 12 L0 10.4 L-5.4 12 L-5.4 10.4 L-2.6 8 L-2.6 2.6 L-11 5.4 L-11 3 L-2.6 -3.5 Z"
                fill={UI_COLORS.danger}
                stroke="#f5f5f5"
                strokeWidth={1}
                strokeLinejoin="round"
              />
            </g>
          )}
        </svg>
      )}

      <div className="absolute top-1 right-1 flex flex-col gap-1">
        {[
          { label: '+', delta: 1, title: 'Zoom in' },
          { label: '−', delta: -1, title: 'Zoom out' },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={() => changeZoom(b.delta)}
            title={b.title}
            aria-label={b.title}
            className="w-6 h-6 flex items-center justify-center rounded bg-neutral-900/85 border border-neutral-600 text-neutral-200 text-sm leading-none hover:bg-neutral-800"
          >
            {b.label}
          </button>
        ))}
        <button
          type="button"
          onClick={fit}
          title="Fit route"
          aria-label="Fit route"
          className="w-6 h-6 flex items-center justify-center rounded bg-neutral-900/85 border border-neutral-600 text-neutral-200 hover:bg-neutral-800"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M1.5 5V1.5H5M11 1.5h3.5V5M14.5 11v3.5H11M5 14.5H1.5V11" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Natural Earth is public domain and asks for no attribution, but
          crediting the map you're standing on is good manners. Plain text, not
          a link: an outbound link is the one thing on this page that would
          take you somewhere else. */}
      <div className="absolute bottom-0 right-0 px-1 text-[9px] leading-tight bg-neutral-950/75 text-neutral-500">
        Coastline: Natural Earth
      </div>
    </div>
  );
}
