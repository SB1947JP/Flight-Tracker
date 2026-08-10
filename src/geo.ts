/**
 * Great-circle maths for the flight tracker.
 *
 * Aircraft fly great circles, not straight lines on a Mercator map, so every
 * distance, bearing and interpolated position here is computed on the sphere
 * and only projected to pixels at draw time. Interpolating in projected
 * (Mercator) space instead would put the aeroplane visibly off its own route
 * on any long-haul leg — a Tokyo→London flight would appear to fly across
 * Siberia's southern edge rather than over the pole.
 *
 * A sphere, not WGS84's ellipsoid: the error is ~0.3%, which is a few km on a
 * 10,000 km leg and far below the precision of the hand-entered times this
 * whole page is driven by.
 */

export const EARTH_RADIUS_KM = 6371;

export interface LatLon {
  lat: number;
  lon: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Angular separation of two points, in radians. */
function centralAngle(a: LatLon, b: LatLon): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const dφ = φ2 - φ1;
  const dλ = toRad(b.lon - a.lon);
  // Haversine rather than the spherical law of cosines: the latter loses
  // precision to floating-point cancellation for points close together, which
  // is exactly the case while a flight is still near its origin.
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Great-circle distance in kilometres. */
export function distanceKm(a: LatLon, b: LatLon): number {
  return centralAngle(a, b) * EARTH_RADIUS_KM;
}

/**
 * Initial bearing (degrees clockwise from true north) along the great circle
 * from `a` to `b`. This is the *initial* heading — it changes continuously
 * along the route, which is why the aeroplane marker is rotated using the
 * bearing from its current position rather than one computed once at
 * departure.
 */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const dλ = toRad(b.lon - a.lon);
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * The point a fraction `f` of the way along the great circle from `a` to `b`
 * (spherical linear interpolation of the two position vectors).
 */
export function interpolate(a: LatLon, b: LatLon, f: number): LatLon {
  const δ = centralAngle(a, b);
  // Coincident endpoints: sin δ is zero and the general form divides by it.
  if (δ < 1e-9) return { lat: a.lat, lon: a.lon };

  const A = Math.sin((1 - f) * δ) / Math.sin(δ);
  const B = Math.sin(f * δ) / Math.sin(δ);
  const φ1 = toRad(a.lat);
  const λ1 = toRad(a.lon);
  const φ2 = toRad(b.lat);
  const λ2 = toRad(b.lon);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return {
    lat: toDeg(Math.atan2(z, Math.hypot(x, y))),
    lon: toDeg(Math.atan2(y, x)),
  };
}

/**
 * Sample the great circle between two points into a polyline of `segments`+1
 * positions, for drawing. Straight <line> elements between the endpoints would
 * cut the corner off the real route on anything longer than a short hop.
 */
export function samplePath(a: LatLon, b: LatLon, from: number, to: number, segments: number): LatLon[] {
  const points: LatLon[] = [];
  for (let i = 0; i <= segments; i++) {
    points.push(interpolate(a, b, from + ((to - from) * i) / segments));
  }
  return points;
}

/**
 * The point reached by travelling `distanceKm` from `start` on a constant
 * bearing, along a great circle.
 *
 * Used to carry the aircraft forward between position reports. A report arrives
 * every twenty seconds or so; without this the marker sits still and then jumps,
 * which reads as a broken app rather than a flying aeroplane. With it the marker
 * advances every second along the track and at the speed the aircraft itself
 * last reported — the same dead reckoning a navigator would do, and the same
 * thing every other tracker does between updates.
 *
 * It is an assumption, not a measurement, and it decays: see the cap in
 * `FlightDetail`.
 */
export function destinationPoint(start: LatLon, bearingDegrees: number, distanceKm: number): LatLon {
  const δ = distanceKm / EARTH_RADIUS_KM;
  const θ = toRad(bearingDegrees);
  const φ1 = toRad(start.lat);
  const λ1 = toRad(start.lon);

  const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(Math.min(1, Math.max(-1, sinφ2)));
  const λ2 =
    λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * sinφ2);

  return {
    lat: toDeg(φ2),
    // Keep longitude in -180..180 so the map's unwrapping has a sane input.
    lon: ((toDeg(λ2) + 540) % 360) - 180,
  };
}
