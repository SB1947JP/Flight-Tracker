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
 * The basemap is two layers, and which one you see depends on your connection.
 *
 * On top: OpenStreetMap raster tiles — coastlines that actually look like
 * coastlines, plus place names and terrain. Underneath, and drawn first: the
 * bundled 110m coastline as vector paths. When the tiles load they cover it
 * completely; when they can't — offline, at altitude, behind a blocker — the
 * drawn outline is still there and the route is still legible.
 *
 * The tiles were removed once, on the reasoning that a self-contained app with
 * no external requests was worth a coarse map. That reasoning expired: the app
 * now fetches live aircraft positions, so it already needs a connection for the
 * thing it exists to do, and the coarse outline was buying an offline purity
 * the app no longer has. It survives as a fallback, which is what it was always
 * actually good for.
 *
 * `TILE_SIZE` survives as the projection's scale constant: Web Mercator tile
 * coordinates are defined in 256-pixel tiles, and keeping that unit means the
 * zoom levels here mean the same thing they do on any other slippy map.
 */

/**
 * The aircraft marker: nose at the top, symmetric about x, roughly 32 units long
 * against a 27-unit span — deliberately longer than it is wide, which is what
 * makes it read as an airliner rather than a dart.
 *
 * Curves at the nose and tail, straight swept edges through the wings — which is
 * what makes it read as an aeroplane at 20 pixels rather than as an arrowhead.
 *
 * An airliner seen from above, in the manner of the markers on the big flight
 * tracking sites: long fuselage, swept wings with engines slung under them, and
 * a separate tailplane at the back.
 *
 * This shape solves a problem several earlier attempts had. Those were drawn
 * from the aeroplane glyph a phone shows for flight mode — one shape, wings
 * and tail merged, and no engines — which is a fine icon precisely because it
 * is only ever drawn at one angle. Rotated to a heading it lost its read;
 * around 120-150 degrees it stopped looking like an aeroplane and started
 * looking like a star. The separate tailplane and the engines give the eye
 * enough landmarks to find the aircraft's axis at any angle, which is why the
 * tracking sites all draw it this way.
 *
 * Yellow with a dark outline, which is what every flight tracker uses and is
 * therefore the pairing people already read as "the aeroplane". It is also the
 * combination that holds up over map tiles darkened to half brightness: the
 * yellow separates from pale sea, pale land and dark city alike, and a dark
 * line stays crisp on all three where a white one bulks the shape out and
 * blurs its edges. Checked over all three.
 *
 * Two proportions here exist because of *rotation*, which is the thing that
 * makes a map marker hard and that judging it upright completely hides.
 *
 * The tailplane is small and set back, with a clear run of fuselage between it
 * and the wing. An earlier version had a tail nearly as wide as the wings and
 * immediately behind them; the deep V trapped between the two read as a star
 * rather than an aircraft the moment the marker turned away from vertical.
 *
 * The nose is long. It is the only thing distinguishing front from back on a
 * shape that is otherwise near-symmetric, and without that asymmetry a marker
 * pointing down the screen — a southbound flight, which is half of them — stops
 * looking like an aeroplane at all.
 *
 * Everything is thicker than a drawing wants, because a 0.75 outline is drawn
 * on both sides of every edge and therefore eats about 1.5 units out of any
 * section it borders. A wing tip 3 units deep has essentially no fill left; it
 * renders as two white lines and the aircraft reads as a star. Nothing here is
 * thinner than 5.
 *
 * Candidates were compared side by side at the size the marker actually draws
 * AND at ten times that, at headings of 0, 60, 90, 120, 150 and 210. Every
 * earlier version passed inspection upright and failed at 150 — which is worth
 * remembering before adjusting any of these numbers. The tail went through a notched version first, which is faithful to
 * the glyph at poster size and at twenty-two pixels reads as jagged — a cluster
 * of spikes with a separate tailplane, a letter W once the notch was deepened.
 * A flat trailing edge says "tail" at this size with none of that noise. That
 * icon gets away with hairline proportions because it is solid white
 * on a coloured disc; this one sits on map tiles and needs an outline, and an
 * outline eats into the body from both sides. So the fuselage is a little
 * fuller than the original — enough that it stays a shape rather than becoming
 * two white lines with a sliver of colour between them.
 */
const PLANE_PATH = [
  'M0 -19',
  'C1.3 -18.1 2.4 -14.4 2.5 -9.4', // nose
  'L2.5 -2.6', // fuselage, down to the wing root
  'L15.0 6.2', // wing leading edge, swept
  'L15.0 8.6', // wing tip
  'L2.5 4.6', // wing trailing edge
  'L2.5 11.0', // rear fuselage
  'L6.6 15.2', // tailplane leading edge
  'L6.6 17.0', // tailplane tip
  'L1.5 15.6', // tailplane trailing edge
  'L1.5 18.2', // tail, cut flat
  'L-1.5 18.2',
  'L-1.5 15.6',
  'L-6.6 17.0',
  'L-6.6 15.2',
  'L-2.5 11.0',
  'L-2.5 4.6',
  'L-15.0 8.6',
  'L-15.0 6.2',
  'L-2.5 -2.6',
  'L-2.5 -9.4',
  'C-2.4 -14.4 -1.3 -18.1 0 -19',
  'Z',
].join(' ');

/** Engine nacelles, slung under each wing. Two units wide and easy to dismiss
 *  at this size, but they are a good part of why the silhouette reads as an
 *  airliner rather than a dart. */
const ENGINES = [
  { x: 6.0, y: 1.4 },
  { x: -8.8, y: 1.4 },
];

const TILE_SIZE = 256;
const MIN_ZOOM = 1;
/** Tiles are served to z19; past ~16 a route map has nothing left to say. */
const MAX_ZOOM = 16;
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
  const [expanded, setExpanded] = useState(false);
  const dragRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);

  /**
   * Full screen, by two routes.
   *
   * Desktop browsers have a real Fullscreen API that hides the browser's own
   * chrome. iOS refuses it for anything but video, which is most of the phones
   * this will be read on — so the map also expands to fill the window by itself.
   * The CSS route is what actually runs on a phone; the native call is a bonus
   * where it is allowed, and its failure is expected rather than exceptional.
   */
  const toggleExpanded = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    const el = containerRef.current;
    if (next) {
      el?.requestFullscreen?.().catch(() => {
        // iOS, or a browser refusing the request. The CSS expansion stands on
        // its own, so there is nothing to recover from and nothing to report.
      });
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, [expanded]);

  // Leaving full screen by Escape or the browser's own control has to put the
  // map back in the page, or it would stay expanded over everything.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setExpanded(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Escape closes the CSS expansion too, where there is no native full screen
  // to leave and so no browser affordance for getting out.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

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
    // Padding scaled to the map, not a fixed 56px. On a phone the map is barely
    // 224px tall, where a fixed inset ate half the height and cost a whole zoom
    // level — a Dublin-to-London hop was framed as though it crossed an ocean.
    const padding = Math.min(56, Math.max(14, Math.min(width, height) * 0.12));
    const usableW = Math.max(64, width - padding * 2);
    const usableH = Math.max(64, height - padding * 2);
    // A single point has no extent, so a fitted zoom would run to the maximum.
    // Zoom 7 shows the region an aircraft is over with the towns named.
    const zoom = progress
      ? Math.max(
          MIN_ZOOM,
          Math.min(MAX_ZOOM, Math.floor(Math.log2(Math.min(usableW / (spanX * TILE_SIZE), usableH / (spanY * TILE_SIZE))))),
        )
      : 7;
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
    // The controls sit inside the draggable surface, so a press on one of them
    // reaches this handler first. Capturing the pointer here would send the
    // matching pointerup to the container instead of the button, and the button
    // would never see a click at all — which is exactly what was happening:
    // zoom, fit and full screen were all inert, and the map only appeared to
    // work because dragging never needed them.
    if ((e.target as HTMLElement).closest('button')) return;
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

  const tiles: { key: string; url: string; left: number; top: number }[] = [];
  if (view && width > 0 && height > 0) {
    const world = 2 ** zoom;
    const firstX = Math.floor(view.x - width / 2 / TILE_SIZE);
    const firstY = Math.floor(view.y - height / 2 / TILE_SIZE);
    const cols = Math.ceil(width / TILE_SIZE) + 1;
    const rows = Math.ceil(height / TILE_SIZE) + 1;
    for (let i = 0; i <= cols; i++) {
      for (let j = 0; j <= rows; j++) {
        const tx = firstX + i;
        const ty = firstY + j;
        // Latitude doesn't wrap — above or below the world there is simply no
        // tile, so those slots stay empty rather than requesting a 404.
        if (ty < 0 || ty >= world) continue;
        // Longitude does wrap, so panning past the antimeridian continues into
        // the other side of the world instead of hitting a void.
        const wrappedX = ((tx % world) + world) % world;
        tiles.push({
          key: `${zoom}/${tx}/${ty}`,
          url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${ty}.png`,
          left: (tx - view.x) * TILE_SIZE + width / 2,
          top: (ty - view.y) * TILE_SIZE + height / 2,
        });
      }
    }
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`overflow-hidden bg-neutral-950 cursor-grab active:cursor-grabbing touch-none select-none ${
        expanded
          ? 'fixed inset-0 z-50 w-screen h-screen'
          : 'relative w-full h-full min-h-[16rem] rounded border border-neutral-700'
      }`}
    >
      {/* Fallback layer, drawn first and covered by the tiles when they load. */}
      {view && width > 0 && (
        <svg className="absolute inset-0 pointer-events-none" width={width} height={height} aria-hidden="true">
          <g transform={`translate(${width / 2} ${height / 2}) scale(${TILE_SIZE}) translate(${-view.x} ${-view.y})`}>
            <path
              d={landPath}
              fill={UI_COLORS.land}
              stroke={UI_COLORS.coast}
              strokeWidth={1 / TILE_SIZE}
              fillRule="nonzero"
            />
          </g>
        </svg>
      )}

      {tiles.map((t) => (
        <img
          key={t.key}
          src={t.url}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading="lazy"
          // Don't hand this app's URL to the tile host with every request.
          referrerPolicy="no-referrer"
          width={TILE_SIZE}
          height={TILE_SIZE}
          // Darkened and desaturated rather than made transparent: the route and
          // the aircraft have to stay the brightest things on the map, and any
          // transparency here would let the fallback coastline show through.
          // A tile that fails to load draws the browser's broken-image marker
          // and a faint box, which litters the fallback coastline with debris
          // exactly when the connection is worst. Hide it and let the drawn
          // outline underneath do its job.
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden';
          }}
          onLoad={(e) => {
            e.currentTarget.style.visibility = 'visible';
          }}
          className="absolute max-w-none pointer-events-none"
          style={{
            left: t.left,
            top: t.top,
            width: TILE_SIZE,
            height: TILE_SIZE,
            filter: 'brightness(0.5) saturate(0.55) contrast(1.1)',
          }}
        />
      ))}

      {view && width > 0 && (
        <svg
          className="absolute inset-0 pointer-events-none"
          width={width}
          height={height}
          aria-label={
            progress ? `Route from ${progress.origin.iata} to ${progress.destination.iata}` : 'Aircraft position'
          }
        >
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
            <g
              transform={`translate(${planePx.left} ${planePx.top}) rotate(${planeHeading}) scale(0.95)`}
              fill={UI_COLORS.aircraft}
              stroke="#141414"
              strokeWidth={0.9}
              strokeLinejoin="round"
            >
              {/* A slim swept-wing silhouette in the manner of the aeroplane
                  glyph on a phone's status bar, rather than the blunt
                  straight-edged shape this started as. Drawn nose-up, so the
                  rotation above is simply the aircraft's track.

                  The outline is doing real work: this sits over map tiles that
                  run from pale sea to dark city, and a solid fill alone
                  disappears against half of them. */}
              <path d={PLANE_PATH} />
              {ENGINES.map((e) => (
                <rect key={e.x} x={e.x} y={e.y} width={2.8} height={6.6} rx={1.3} />
              ))}
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
        <button
          type="button"
          onClick={toggleExpanded}
          title={expanded ? 'Leave full screen' : 'Full screen'}
          aria-label={expanded ? 'Leave full screen' : 'Full screen'}
          className="w-6 h-6 flex items-center justify-center rounded bg-neutral-900/85 border border-neutral-600 text-neutral-200 hover:bg-neutral-800"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            {expanded ? (
              <path d="M6.5 1.5v5h-5M9.5 14.5v-5h5M1.5 9.5h5v5M14.5 6.5h-5v-5" />
            ) : (
              <path d="M1.5 6V1.5H6M10 1.5h4.5V6M14.5 10v4.5H10M6 14.5H1.5V10" />
            )}
          </svg>
        </button>
      </div>

      {/* OpenStreetMap's tile usage policy requires visible attribution. */}
      <div className="absolute bottom-0 right-0 px-1 text-[9px] leading-tight bg-neutral-950/75 text-neutral-400">
        ©{' '}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer noopener"
          className="underline hover:text-neutral-200"
        >
          OpenStreetMap
        </a>
      </div>
    </div>
  );
}
