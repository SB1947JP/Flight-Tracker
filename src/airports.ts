/**
 * Airport lookup and search.
 *
 * The table itself is generated into `airports-data.ts` from OurAirports —
 * every airport in the world with an IATA code, about 5,500 of them. It
 * replaced a list of 136 typed out by hand, covering roughly one in forty:
 * anything outside that list, Birmingham and Treviso included, simply could not
 * be entered.
 *
 * It costs about 145 KB gzipped, which is most of what this app downloads. That
 * is a deliberate trade. The alternative is an airport picker that fails on the
 * majority of real journeys, and a tracker that cannot draw the route you are
 * actually on is worth a great deal less than a fast one that can.
 *
 * The rows are parsed on first use rather than at import, so starting the app
 * and following a flight by number alone never touches them.
 */
import { AIRPORT_ROWS, TIMEZONES } from './airports-data';

export interface Airport {
  /** IATA code, uppercase — the code printed on a boarding pass. */
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  /** IANA zone, e.g. 'Australia/Sydney'. This, rather than a fixed UTC offset,
   *  is what makes a boarding-pass time mean the right instant across a
   *  daylight-saving change. */
  tz: string;
}

/**
 * The busiest airports, carried over from the hand-written table this replaced.
 *
 * Purely a ranking hint. The dataset says nothing about how busy an airport is,
 * so without this a search for "London" offers whichever airfield happens to
 * sort first and Heathrow turns up somewhere below it.
 */
const MAJOR = new Set(["ADD", "ADL", "AKL", "AMS", "ANC", "ARN", "ATH", "ATL", "AUH", "BCN", "BER", "BKK", "BLR", "BNE", "BOG", "BOM", "BOS", "BRU", "BUD", "CAI", "CAN", "CDG", "CGK", "CHC", "CMB", "CMN", "CNS", "CPH", "CPT", "CTS", "CTU", "CUN", "DCA", "DEL", "DEN", "DFW", "DMK", "DOH", "DPS", "DRW", "DUB", "DXB", "EDI", "EWR", "EZE", "FCO", "FRA", "FUK", "GIG", "GMP", "GRU", "GVA", "HAN", "HBA", "HEL", "HKG", "HKT", "HND", "HNL", "HYD", "IAD", "IAH", "ICN", "IST", "ITM", "JED", "JFK", "JNB", "KEF", "KIX", "KTM", "KUL", "LAS", "LAX", "LGA", "LGW", "LHR", "LIM", "LIS", "LOS", "MAA", "MAD", "MAN", "MCO", "MEL", "MEX", "MIA", "MNL", "MRU", "MSP", "MUC", "MXP", "NAN", "NBO", "NCE", "NGO", "NRT", "OKA", "OPO", "ORD", "ORY", "OSL", "PDX", "PEK", "PER", "PHX", "PKX", "PMI", "PPT", "PRG", "PTY", "PVG", "RUH", "SAN", "SAW", "SCL", "SEA", "SFO", "SGN", "SHA", "SIN", "STN", "SYD", "SZX", "TFU", "TLV", "TPE", "VCE", "VIE", "WAW", "WLG", "YUL", "YVR", "YYC", "YYZ", "ZRH"]);

let all: Airport[] | null = null;
let byIata: Map<string, Airport> | null = null;

function parsed(): { all: Airport[]; byIata: Map<string, Airport> } {
  if (!all || !byIata) {
    all = [];
    byIata = new Map();
    for (const line of AIRPORT_ROWS.split('\n')) {
      const [iata, name, city, country, lat, lon, tz] = line.split('\t');
      const airport: Airport = {
        iata,
        // A few airports carry no name distinct from their city.
        name: name || city,
        city,
        country,
        lat: Number(lat),
        lon: Number(lon),
        tz: TIMEZONES[Number(tz)],
      };
      all.push(airport);
      byIata.set(iata, airport);
    }
  }
  return { all, byIata };
}

export function findAirport(iata: string): Airport | undefined {
  return parsed().byIata.get(iata.trim().toUpperCase());
}

/** Every airport, for tooling and tests. */
export function allAirports(): Airport[] {
  return parsed().all;
}

/**
 * Search by code, city, name or country, ranked so the obvious answer is first.
 *
 * With 5,500 airports the ranking is doing real work: an exact code beats
 * everything, then a city that starts with what you typed, and a major airport
 * beats a minor one at the same rank — otherwise "London" surfaces an airfield
 * in Ontario before Heathrow.
 */
export function searchAirports(query: string, limit = 8): Airport[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored: { airport: Airport; score: number }[] = [];
  for (const airport of parsed().all) {
    const iata = airport.iata.toLowerCase();
    const city = airport.city.toLowerCase();
    let score = -1;
    if (iata === q) score = 0;
    else if (city === q) score = 1;
    else if (city.startsWith(q)) score = 2;
    else if (iata.startsWith(q)) score = 3;
    else if (airport.name.toLowerCase().startsWith(q)) score = 4;
    else if (airport.name.toLowerCase().includes(q) || city.includes(q)) score = 5;
    else if (airport.country.toLowerCase().startsWith(q)) score = 6;
    if (score < 0) continue;
    // A major airport outranks a minor one that matched equally well.
    scored.push({ airport, score: score * 2 + (MAJOR.has(airport.iata) ? 0 : 1) });
  }

  scored.sort((a, b) => a.score - b.score || a.airport.city.localeCompare(b.airport.city));
  return scored.slice(0, limit).map((s) => s.airport);
}
