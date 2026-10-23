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

import { distanceKm, LatLon } from './geo';

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

/**
 * What one aircraft is doing with respect to `field`.
 *
 * Deliberately conservative: anything it can't place confidently comes back as
 * 'passing' rather than being guessed into the arrivals list. An over-eager
 * guess here doesn't read as a guess on screen — it reads as the app being
 * wrong about a flight.
 */
export function classify(
  aircraft: { lat: number; lon: number; altitudeFt?: number; verticalRateFpm?: number; groundSpeedKts?: number; onGround: boolean },
  field: Airfield,
  rivals: Airfield[] = [],
): AirfieldTraffic {
  const here = { lat: aircraft.lat, lon: aircraft.lon };
  const distance = distanceKm(here, field);

  // Attribute to whichever field it is closest to. Distance alone is the right
  // test near the ground and a meaningless one in the cruise, which is why this
  // only decides between fields — whether it is landing at all comes after.
  const nearer = rivals.find((rival) => distanceKm(here, rival) < distance);

  if (aircraft.onGround) {
    return nearer
      ? { movement: 'passing', distanceKm: distance, otherField: nearer }
      : distance <= ON_FIELD_KM
        ? { movement: 'onGround', distanceKm: distance }
        : { movement: 'passing', distanceKm: distance };
  }

  const heightFt = aircraft.altitudeFt === undefined ? undefined : aircraft.altitudeFt - field.elevationFt;
  const rate = aircraft.verticalRateFpm;

  // No altitude, or no vertical rate, means no basis for a claim.
  if (heightFt === undefined || rate === undefined) {
    return { movement: 'passing', distanceKm: distance, heightFt, otherField: nearer };
  }

  // In the cruise: overhead traffic, whoever it belongs to. A descent that
  // begins this high is still a hundred miles from touching down anywhere.
  if (heightFt > CRUISE_FT) {
    return { movement: 'passing', distanceKm: distance, heightFt, otherField: nearer };
  }

  if (nearer) {
    return { movement: 'passing', distanceKm: distance, heightFt, otherField: nearer };
  }

  if (rate <= -CLIMB_FPM) return { movement: 'arriving', distanceKm: distance, heightFt };
  if (rate >= CLIMB_FPM) return { movement: 'departing', distanceKm: distance, heightFt };

  // Low, level and close: in the circuit, or being vectored around. Belongs to
  // the field without being on an obvious leg to or from it.
  return { movement: 'passing', distanceKm: distance, heightFt };
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
