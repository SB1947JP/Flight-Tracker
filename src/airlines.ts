/**
 * Airline codes: the two-character code printed on a ticket, and the
 * three-letter code an aircraft actually broadcasts.
 *
 * These are different things, which is the whole reason this file exists. Your
 * boarding pass says "QF12"; the aeroplane's radio identifies it as "QFA12".
 * Look up live traffic by the ticket number and you find nothing at all.
 *
 * Only the airline prefix is translated — the digits after it are almost always
 * the same on both. ("Almost": a handful of carriers use a different number on
 * the radio, and for those the lookup will come up empty. Typing the radio
 * callsign straight into the flight field is the escape hatch; see `live.ts`.)
 */

/** IATA (ticket) → ICAO (radio). */
export const AIRLINE_CALLSIGNS: Record<string, string> = {
  // Australia / New Zealand / Pacific
  QF: 'QFA', // Qantas
  JQ: 'JST', // Jetstar
  VA: 'VOZ', // Virgin Australia
  ZL: 'RXA', // Rex
  NZ: 'ANZ', // Air New Zealand
  FJ: 'FJI', // Fiji Airways

  // Asia
  NH: 'ANA', // All Nippon
  JL: 'JAL', // Japan Airlines
  MM: 'APJ', // Peach
  KE: 'KAL', // Korean Air
  OZ: 'AAR', // Asiana
  CX: 'CPA', // Cathay Pacific
  CI: 'CAL', // China Airlines
  BR: 'EVA', // EVA Air
  SQ: 'SIA', // Singapore Airlines
  TR: 'SCO', // Scoot
  MH: 'MAS', // Malaysia Airlines
  AK: 'AXM', // AirAsia
  TG: 'THA', // Thai Airways
  VN: 'HVN', // Vietnam Airlines
  VJ: 'VJC', // VietJet
  PR: 'PAL', // Philippine Airlines
  GA: 'GIA', // Garuda Indonesia
  CA: 'CCA', // Air China
  MU: 'CES', // China Eastern
  CZ: 'CSN', // China Southern
  HU: 'CHH', // Hainan
  AI: 'AIC', // Air India
  '6E': 'IGO', // IndiGo
  UK: 'VTI', // Vistara
  UL: 'ALK', // SriLankan

  // Middle East
  EK: 'UAE', // Emirates
  EY: 'ETD', // Etihad
  QR: 'QTR', // Qatar Airways
  SV: 'SVA', // Saudia
  GF: 'GFA', // Gulf Air
  TK: 'THY', // Turkish Airlines
  LY: 'ELY', // El Al

  // Europe
  BA: 'BAW', // British Airways
  VS: 'VIR', // Virgin Atlantic
  EI: 'EIN', // Aer Lingus
  FR: 'RYR', // Ryanair
  U2: 'EZY', // easyJet
  W6: 'WZZ', // Wizz Air
  AF: 'AFR', // Air France
  KL: 'KLM', // KLM
  LH: 'DLH', // Lufthansa
  LX: 'SWR', // Swiss
  OS: 'AUA', // Austrian
  SN: 'BEL', // Brussels
  EW: 'EWG', // Eurowings
  IB: 'IBE', // Iberia
  VY: 'VLG', // Vueling
  UX: 'AEA', // Air Europa
  TP: 'TAP', // TAP Portugal
  AZ: 'ITY', // ITA Airways
  A3: 'AEE', // Aegean
  SK: 'SAS', // SAS
  DY: 'NOZ', // Norwegian
  AY: 'FIN', // Finnair
  FI: 'ICE', // Icelandair
  LO: 'LOT', // LOT
  OK: 'CSA', // Czech Airlines
  RO: 'ROT', // TAROM

  // North America
  AA: 'AAL', // American
  DL: 'DAL', // Delta
  UA: 'UAL', // United
  WN: 'SWA', // Southwest
  AS: 'ASA', // Alaska
  B6: 'JBU', // JetBlue
  NK: 'NKS', // Spirit
  F9: 'FFT', // Frontier
  HA: 'HAL', // Hawaiian
  AC: 'ACA', // Air Canada
  WS: 'WJA', // WestJet
  AM: 'AMX', // Aeroméxico
  Y4: 'VOI', // Volaris

  // South America / Africa
  LA: 'LAN', // LATAM
  AD: 'AZU', // Azul
  G3: 'GLO', // GOL
  AV: 'AVA', // Avianca
  AR: 'ARG', // Aerolíneas Argentinas
  CM: 'CMP', // Copa
  SA: 'SAA', // South African
  ET: 'ETH', // Ethiopian
  KQ: 'KQA', // Kenya Airways
  MS: 'MSR', // EgyptAir
  AT: 'RAM', // Royal Air Maroc
};

/**
 * Turn what someone typed into the callsign an aircraft broadcasts.
 *
 * Accepts either form, because both are things people have to hand: a ticket
 * number like `QF12`, or the radio callsign itself (`QFA12`) for anyone who has
 * it — which is also the way round an unlisted airline, or one whose radio
 * number differs from its ticket number.
 *
 * Returns null when the airline isn't in the table, so the UI can say which
 * airline it didn't recognise rather than searching for nonsense.
 */
export function toCallsign(flightNumber: string): string | null {
  const cleaned = flightNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');

  // The two forms are tested separately, longest prefix first, rather than with
  // one `{2,3}` pattern. A single greedy pattern splits QF12 into "QF1" + "2"
  // and looks up an airline that doesn't exist — which silently disabled live
  // tracking for every two-letter airline, i.e. nearly all of them.

  // Already a radio callsign (three letters, as in QFA12): use it unchanged.
  const asCallsign = /^([A-Z]{3})(\d{1,4})$/.exec(cleaned);
  if (asCallsign) return `${asCallsign[1]}${asCallsign[2]}`;

  // A ticket number (two characters, which may include a digit — 6E, U2, W6).
  const asTicket = /^([A-Z0-9]{2})(\d{1,4})$/.exec(cleaned);
  if (asTicket) {
    const icao = AIRLINE_CALLSIGNS[asTicket[1]];
    return icao ? `${icao}${asTicket[2]}` : null;
  }

  return null;
}
