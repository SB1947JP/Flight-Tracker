/**
 * Reading an airfield's traffic out of raw ADS-B positions.
 *
 * The flight services answer "what is in the air near this point" and nothing
 * more: there is no free feed of *scheduled* arrivals and departures, so this
 * is not a departure board and can't become one. What it can do — and what this
 * file does — is take every aircraft within a circle and work out, from where
 * it is and what it's doing, whether it is coming down towards the field,
 * climbing away from it, sitting on it, or merely crossing overhead on its way
 * somewhere else entirely.
 *
 * The last of those matters more than it sounds. Central Japan is busy airspace
 * and an aircraft at 38,000 ft over Nagoya on its way from Tokyo to Fukuoka is
 * in the circle, is perfectly real, and has nothing whatever to do with Komaki.
 * A list that didn't separate those out would be mostly noise.
 */

import { bearingDeg, distanceKm, LatLon } from './geo';

export interface Airfield extends LatLon {
  iata: string;
  /** What to call it on screen. */
  name: string;
  /** Field elevation in feet — altitudes are reported above sea level, and the
   *  only interesting question is height above *this* runway. */
  elevationFt: number;
}

/**
 * Nagoya Airfield, still universally called Komaki.
 *
 * Not to be confused with Chubu Centrair (NGO), which took over Nagoya's
 * international and most domestic traffic in 2005 and is the reason Komaki is
 * now a quieter field of Fuji Dream Airlines flights, business aviation and the
 * JASDF base it shares.
 */
export const KOMAKI: Airfield = {
  iata: 'NKM',
  name: 'Nagoya (Komaki)',
  lat: 35.255,
  lon: 136.924,
  elevationFt: 46,
};

/**
 * Chubu Centrair, 25 km south — and the whole reason this file needs care.
 *
 * Any circle around Komaki wide enough to catch aircraft on approach also
 * contains Centrair and everything descending into it. Those are far more
 * numerous than Komaki's own traffic, so without telling the two apart the list
 * would claim a stream of arrivals that are landing somewhere else. Every
 * aircraft is therefore measured against both fields and attributed to the
 * nearer one.
 */
export const CENTRAIR: Airfield = {
  iata: 'NGO',
  name: 'Chubu Centrair',
  lat: 34.858,
  lon: 136.805,
  elevationFt: 15,
};

export type Movement =
  /** Descending towards this field. */
  | 'arriving'
  /** Climbing away from it. */
  | 'departing'
  /** On the ground at it. */
  | 'onGround'
  /** In the circle, but going about its own business — cruising over the top,
   *  or working the other airport down the road. */
  | 'passing';

export interface AirfieldTraffic {
  movement: Movement;
  /** Distance from the field, km. */
  distanceKm: number;
  /** Height above the runway, feet. Undefined on the ground. */
  heightFt?: number;
  /** The field this aircraft is actually operating at, when that isn't the one
   *  being watched — "landing at Centrair" is the useful thing to say about an
   *  aeroplane that would otherwise look like an unexplained arrival. */
  otherField?: Airfield;
}

/** Above this, an aircraft is in the cruise and simply passing over. */
const CRUISE_FT = 13_000;
/** Faster than this up or down is unambiguous intent rather than a wobble. */
const CLIMB_FPM = 250;
/** Inside this, a slow aircraft on the deck is at the field rather than near it. */
const ON_FIELD_KM = 4;
/** Low enough and close enough that the aircraft's track says where it's going:
 *  roughly the last few minutes of an approach, or the first of a climb-out. */
const APPROACH_FT = 6_000;
const APPROACH_KM = 35;

/**
 * What one aircraft is doing with respect to `field`.
 *
 * Deliberately conservative: anything it can't place confidently comes back as
 * 'passing' rather than being guessed into the arrivals list. An over-eager
 * guess here doesn't read as a guess on screen — it reads as the app being
 * wrong about a flight.
 */
export function classify(
  aircraft: {
    lat: number;
    lon: number;
    altitudeFt?: number;
    verticalRateFpm?: number;
    groundSpeedKts?: number;
    headingDeg?: number;
    onGround: boolean;
  },
  field: Airfield,
  rivals: Airfield[] = [],
): AirfieldTraffic {
  const here = { lat: aircraft.lat, lon: aircraft.lon };
  const distance = distanceKm(here, field);
  const nearer = belongsElsewhere(aircraft, here, distance, field, rivals);

  if (aircraft.onGround) {
    return nearer
      ? { movement: 'passing', distanceKm: distance, otherField: nearer }
      : distance <= ON_FIELD_KM
        ? { movement: 'onGround', distanceKm: distance }
        : { movement: 'passing', distanceKm: distance };
  }

  const heightFt = aircraft.altitudeFt === undefined ? undefined : aircraft.altitudeFt - field.elevationFt;
  const rate = aircraft.verticalRateFpm;

  // No altitude at all means no basis for a claim.
  if (heightFt === undefined) {
    return { movement: 'passing', distanceKm: distance, heightFt, otherField: nearer };
  }

  // In the cruise: overhead traffic, belonging to no airfield down here. A
  // descent that begins this high is still a hundred miles from touching down
  // anywhere, so no field is named.
  if (heightFt > CRUISE_FT) {
    return { movement: 'passing', distanceKm: distance, heightFt };
  }

  if (nearer) {
    return { movement: 'passing', distanceKm: distance, heightFt, otherField: nearer };
  }

  if (rate !== undefined && rate <= -CLIMB_FPM) return { movement: 'arriving', distanceKm: distance, heightFt };
  if (rate !== undefined && rate >= CLIMB_FPM) return { movement: 'departing', distanceKm: distance, heightFt };

  // Low and close, but with no useful vertical rate — either the feed isn't
  // sending one, or the aircraft is in level flight for a moment, which is
  // exactly what happens when one is levelled off on an intermediate approach
  // step a few miles out. Calling that "passing over" is plainly wrong to
  // anyone who can see the thing out of the window, so fall back to the
  // question the track answers: is it pointed at this airfield or away from it?
  if (heightFt <= APPROACH_FT && distance <= APPROACH_KM && aircraft.headingDeg !== undefined) {
    const offBearing = angleBetween(aircraft.headingDeg, bearingDeg(here, field));
    if (offBearing <= 60) return { movement: 'arriving', distanceKm: distance, heightFt };
    if (offBearing >= 120) return { movement: 'departing', distanceKm: distance, heightFt };
  }

  // Low, level, and going sideways past the field: in the circuit, or being
  // vectored around. At the field without being on a leg to or from it.
  return { movement: 'passing', distanceKm: distance, heightFt };
}

/**
 * Which other airfield this aircraft is really working, if it isn't this one.
 *
 * Nearest-field was the first rule and it is wrong in the place it matters
 * most: the gap between Komaki and Centrair. An aircraft halfway between them
 * can be marginally nearer Komaki while descending on a heading that points
 * straight at Centrair, and calling that a Komaki movement is exactly the kind
 * of confident error that makes the whole list untrustworthy.
 *
 * So where the aircraft is pointed decides it, and distance only breaks ties.
 * A descent belongs to the field ahead of it; a climb belongs to the field
 * behind it. With no track to go on there is nothing better than nearest.
 */
function belongsElsewhere(
  aircraft: { altitudeFt?: number; verticalRateFpm?: number; headingDeg?: number },
  here: LatLon,
  distance: number,
  field: Airfield,
  rivals: Airfield[],
): Airfield | undefined {
  if (rivals.length === 0) return undefined;

  // Nothing in the cruise belongs to any airfield down here. Attributing an
  // airliner at 29,000 ft to whichever runway it happens to be over reads as
  // "landing at Centrair" when it is on its way to somewhere else entirely.
  const heightFt = aircraft.altitudeFt === undefined ? undefined : aircraft.altitudeFt - field.elevationFt;
  if (heightFt !== undefined && heightFt > CRUISE_FT) return undefined;

  const nearest = () => rivals.find((rival) => distanceKm(here, rival) < distance);

  const track = aircraft.headingDeg;
  if (track === undefined) return nearest();

  // Climbing: the field it came from is behind it. Otherwise: the field it is
  // going to is ahead of it. A level aircraft is treated as arriving, since
  // that is what the low, level stretch of an approach looks like.
  const climbing = (aircraft.verticalRateFpm ?? 0) >= CLIMB_FPM;
  const pointsAt = (to: Airfield) => {
    const off = angleBetween(track, bearingDeg(here, to));
    return climbing ? off >= 120 : off <= 60;
  };

  const candidates = [field, ...rivals].filter(pointsAt);
  if (candidates.length === 0) return nearest();

  // Among the fields it could be heading for, the nearest is the one it is
  // dealing with now.
  const best = candidates.reduce((a, b) => (distanceKm(here, b) < distanceKm(here, a) ? b : a));
  return best === field ? undefined : best;
}

/** Smallest angle between two compass bearings, 0–180°. */
function angleBetween(a: number, b: number): number {
  const diff = Math.abs(((a - b) % 360) + 360) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** Sort order for the list: what is happening at the field first, nearest first
 *  within that, and everything merely passing over at the bottom. */
export function trafficOrder(a: AirfieldTraffic, b: AirfieldTraffic): number {
  const rank: Record<Movement, number> = { arriving: 0, departing: 1, onGround: 2, passing: 3 };
  const byMovement = rank[a.movement] - rank[b.movement];
  return byMovement !== 0 ? byMovement : a.distanceKm - b.distanceKm;
}

export const MOVEMENT_LABEL: Record<Movement, string> = {
  arriving: 'Arriving',
  departing: 'Departing',
  onGround: 'On the ground',
  passing: 'Passing over',
};
