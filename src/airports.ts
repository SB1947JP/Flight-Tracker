/**
 * A small, bundled airport table.
 *
 * Deliberately hand-held and offline rather than fetched: this page inherits
 * the project's `connect-src 'self'` stance, so there is no airport API to
 * call, and a full 8,000-row OurAirports dump would be a ~1 MB download to
 * support a page whose whole job is tracking one flight you typed in yourself.
 * These are the ~130 busiest passenger airports plus a spread of regional ones,
 * which covers the overwhelming majority of hand-entered itineraries.
 *
 * Extending it is the intended path: add a row. Each needs an IATA code, a
 * position (degrees, positive north/east) and an **IANA timezone name** — the
 * zone is what makes a boarding-pass time mean the right instant (see
 * `time.ts`), so a plain UTC offset is not good enough; it would be wrong for
 * half the year everywhere that observes DST.
 */

export interface Airport {
  /** IATA code, uppercase — the code printed on a boarding pass. */
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  /** IANA zone, e.g. 'Australia/Sydney'. */
  tz: string;
}

export const AIRPORTS: Airport[] = [
  // Australia / New Zealand / Pacific
  { iata: 'SYD', name: 'Kingsford Smith', city: 'Sydney', country: 'Australia', lat: -33.946, lon: 151.177, tz: 'Australia/Sydney' },
  { iata: 'MEL', name: 'Tullamarine', city: 'Melbourne', country: 'Australia', lat: -37.669, lon: 144.841, tz: 'Australia/Melbourne' },
  { iata: 'BNE', name: 'Brisbane', city: 'Brisbane', country: 'Australia', lat: -27.384, lon: 153.117, tz: 'Australia/Brisbane' },
  { iata: 'PER', name: 'Perth', city: 'Perth', country: 'Australia', lat: -31.94, lon: 115.967, tz: 'Australia/Perth' },
  { iata: 'ADL', name: 'Adelaide', city: 'Adelaide', country: 'Australia', lat: -34.945, lon: 138.531, tz: 'Australia/Adelaide' },
  { iata: 'CNS', name: 'Cairns', city: 'Cairns', country: 'Australia', lat: -16.886, lon: 145.755, tz: 'Australia/Brisbane' },
  { iata: 'DRW', name: 'Darwin', city: 'Darwin', country: 'Australia', lat: -12.415, lon: 130.877, tz: 'Australia/Darwin' },
  { iata: 'HBA', name: 'Hobart', city: 'Hobart', country: 'Australia', lat: -42.836, lon: 147.51, tz: 'Australia/Hobart' },
  { iata: 'AKL', name: 'Auckland', city: 'Auckland', country: 'New Zealand', lat: -37.008, lon: 174.792, tz: 'Pacific/Auckland' },
  { iata: 'CHC', name: 'Christchurch', city: 'Christchurch', country: 'New Zealand', lat: -43.489, lon: 172.532, tz: 'Pacific/Auckland' },
  { iata: 'WLG', name: 'Wellington', city: 'Wellington', country: 'New Zealand', lat: -41.327, lon: 174.805, tz: 'Pacific/Auckland' },
  { iata: 'NAN', name: 'Nadi', city: 'Nadi', country: 'Fiji', lat: -17.755, lon: 177.443, tz: 'Pacific/Fiji' },
  { iata: 'HNL', name: 'Daniel K. Inouye', city: 'Honolulu', country: 'United States', lat: 21.319, lon: -157.922, tz: 'Pacific/Honolulu' },
  { iata: 'PPT', name: "Fa'a'ā", city: 'Papeete', country: 'French Polynesia', lat: -17.557, lon: -149.612, tz: 'Pacific/Tahiti' },

  // Japan / Korea / China / Taiwan
  { iata: 'HND', name: 'Haneda', city: 'Tokyo', country: 'Japan', lat: 35.549, lon: 139.78, tz: 'Asia/Tokyo' },
  { iata: 'NRT', name: 'Narita', city: 'Tokyo', country: 'Japan', lat: 35.772, lon: 140.393, tz: 'Asia/Tokyo' },
  { iata: 'KIX', name: 'Kansai', city: 'Osaka', country: 'Japan', lat: 34.427, lon: 135.244, tz: 'Asia/Tokyo' },
  { iata: 'ITM', name: 'Itami', city: 'Osaka', country: 'Japan', lat: 34.786, lon: 135.438, tz: 'Asia/Tokyo' },
  { iata: 'CTS', name: 'New Chitose', city: 'Sapporo', country: 'Japan', lat: 42.775, lon: 141.692, tz: 'Asia/Tokyo' },
  { iata: 'FUK', name: 'Fukuoka', city: 'Fukuoka', country: 'Japan', lat: 33.586, lon: 130.451, tz: 'Asia/Tokyo' },
  { iata: 'OKA', name: 'Naha', city: 'Okinawa', country: 'Japan', lat: 26.196, lon: 127.646, tz: 'Asia/Tokyo' },
  { iata: 'NGO', name: 'Chubu Centrair', city: 'Nagoya', country: 'Japan', lat: 34.858, lon: 136.805, tz: 'Asia/Tokyo' },
  { iata: 'ICN', name: 'Incheon', city: 'Seoul', country: 'South Korea', lat: 37.463, lon: 126.44, tz: 'Asia/Seoul' },
  { iata: 'GMP', name: 'Gimpo', city: 'Seoul', country: 'South Korea', lat: 37.558, lon: 126.791, tz: 'Asia/Seoul' },
  { iata: 'PEK', name: 'Capital', city: 'Beijing', country: 'China', lat: 40.08, lon: 116.585, tz: 'Asia/Shanghai' },
  { iata: 'PKX', name: 'Daxing', city: 'Beijing', country: 'China', lat: 39.509, lon: 116.411, tz: 'Asia/Shanghai' },
  { iata: 'PVG', name: 'Pudong', city: 'Shanghai', country: 'China', lat: 31.143, lon: 121.805, tz: 'Asia/Shanghai' },
  { iata: 'SHA', name: 'Hongqiao', city: 'Shanghai', country: 'China', lat: 31.198, lon: 121.336, tz: 'Asia/Shanghai' },
  { iata: 'CAN', name: 'Baiyun', city: 'Guangzhou', country: 'China', lat: 23.392, lon: 113.299, tz: 'Asia/Shanghai' },
  { iata: 'SZX', name: "Bao'an", city: 'Shenzhen', country: 'China', lat: 22.639, lon: 113.811, tz: 'Asia/Shanghai' },
  { iata: 'CTU', name: 'Tianfu', city: 'Chengdu', country: 'China', lat: 30.313, lon: 104.442, tz: 'Asia/Shanghai' },
  { iata: 'HKG', name: 'Hong Kong Intl', city: 'Hong Kong', country: 'Hong Kong', lat: 22.308, lon: 113.918, tz: 'Asia/Hong_Kong' },
  { iata: 'TPE', name: 'Taoyuan', city: 'Taipei', country: 'Taiwan', lat: 25.078, lon: 121.233, tz: 'Asia/Taipei' },

  // South & Southeast Asia
  { iata: 'SIN', name: 'Changi', city: 'Singapore', country: 'Singapore', lat: 1.364, lon: 103.991, tz: 'Asia/Singapore' },
  { iata: 'BKK', name: 'Suvarnabhumi', city: 'Bangkok', country: 'Thailand', lat: 13.69, lon: 100.75, tz: 'Asia/Bangkok' },
  { iata: 'DMK', name: 'Don Mueang', city: 'Bangkok', country: 'Thailand', lat: 13.913, lon: 100.607, tz: 'Asia/Bangkok' },
  { iata: 'HKT', name: 'Phuket', city: 'Phuket', country: 'Thailand', lat: 8.113, lon: 98.317, tz: 'Asia/Bangkok' },
  { iata: 'KUL', name: 'Kuala Lumpur Intl', city: 'Kuala Lumpur', country: 'Malaysia', lat: 2.746, lon: 101.71, tz: 'Asia/Kuala_Lumpur' },
  { iata: 'CGK', name: 'Soekarno–Hatta', city: 'Jakarta', country: 'Indonesia', lat: -6.126, lon: 106.656, tz: 'Asia/Jakarta' },
  { iata: 'DPS', name: 'Ngurah Rai', city: 'Denpasar', country: 'Indonesia', lat: -8.748, lon: 115.167, tz: 'Asia/Makassar' },
  { iata: 'MNL', name: 'Ninoy Aquino', city: 'Manila', country: 'Philippines', lat: 14.509, lon: 121.02, tz: 'Asia/Manila' },
  { iata: 'SGN', name: 'Tan Son Nhat', city: 'Ho Chi Minh City', country: 'Vietnam', lat: 10.819, lon: 106.652, tz: 'Asia/Ho_Chi_Minh' },
  { iata: 'HAN', name: 'Noi Bai', city: 'Hanoi', country: 'Vietnam', lat: 21.221, lon: 105.807, tz: 'Asia/Ho_Chi_Minh' },
  { iata: 'DEL', name: 'Indira Gandhi', city: 'Delhi', country: 'India', lat: 28.556, lon: 77.1, tz: 'Asia/Kolkata' },
  { iata: 'BOM', name: 'Chhatrapati Shivaji', city: 'Mumbai', country: 'India', lat: 19.089, lon: 72.868, tz: 'Asia/Kolkata' },
  { iata: 'BLR', name: 'Kempegowda', city: 'Bengaluru', country: 'India', lat: 13.199, lon: 77.71, tz: 'Asia/Kolkata' },
  { iata: 'MAA', name: 'Chennai', city: 'Chennai', country: 'India', lat: 12.994, lon: 80.171, tz: 'Asia/Kolkata' },
  { iata: 'HYD', name: 'Rajiv Gandhi', city: 'Hyderabad', country: 'India', lat: 17.231, lon: 78.43, tz: 'Asia/Kolkata' },
  { iata: 'CMB', name: 'Bandaranaike', city: 'Colombo', country: 'Sri Lanka', lat: 7.181, lon: 79.884, tz: 'Asia/Colombo' },
  { iata: 'KTM', name: 'Tribhuvan', city: 'Kathmandu', country: 'Nepal', lat: 27.697, lon: 85.359, tz: 'Asia/Kathmandu' },

  // Middle East / Africa
  { iata: 'DXB', name: 'Dubai Intl', city: 'Dubai', country: 'UAE', lat: 25.253, lon: 55.365, tz: 'Asia/Dubai' },
  { iata: 'AUH', name: 'Zayed Intl', city: 'Abu Dhabi', country: 'UAE', lat: 24.433, lon: 54.651, tz: 'Asia/Dubai' },
  { iata: 'DOH', name: 'Hamad', city: 'Doha', country: 'Qatar', lat: 25.273, lon: 51.608, tz: 'Asia/Qatar' },
  { iata: 'RUH', name: 'King Khalid', city: 'Riyadh', country: 'Saudi Arabia', lat: 24.958, lon: 46.699, tz: 'Asia/Riyadh' },
  { iata: 'JED', name: 'King Abdulaziz', city: 'Jeddah', country: 'Saudi Arabia', lat: 21.68, lon: 39.157, tz: 'Asia/Riyadh' },
  { iata: 'TLV', name: 'Ben Gurion', city: 'Tel Aviv', country: 'Israel', lat: 32.011, lon: 34.887, tz: 'Asia/Jerusalem' },
  { iata: 'IST', name: 'Istanbul', city: 'Istanbul', country: 'Türkiye', lat: 41.262, lon: 28.742, tz: 'Europe/Istanbul' },
  { iata: 'SAW', name: 'Sabiha Gökçen', city: 'Istanbul', country: 'Türkiye', lat: 40.899, lon: 29.309, tz: 'Europe/Istanbul' },
  { iata: 'CAI', name: 'Cairo Intl', city: 'Cairo', country: 'Egypt', lat: 30.112, lon: 31.4, tz: 'Africa/Cairo' },
  { iata: 'JNB', name: 'O. R. Tambo', city: 'Johannesburg', country: 'South Africa', lat: -26.139, lon: 28.246, tz: 'Africa/Johannesburg' },
  { iata: 'CPT', name: 'Cape Town Intl', city: 'Cape Town', country: 'South Africa', lat: -33.971, lon: 18.602, tz: 'Africa/Johannesburg' },
  { iata: 'NBO', name: 'Jomo Kenyatta', city: 'Nairobi', country: 'Kenya', lat: -1.319, lon: 36.928, tz: 'Africa/Nairobi' },
  { iata: 'ADD', name: 'Bole', city: 'Addis Ababa', country: 'Ethiopia', lat: 8.978, lon: 38.799, tz: 'Africa/Addis_Ababa' },
  { iata: 'LOS', name: 'Murtala Muhammed', city: 'Lagos', country: 'Nigeria', lat: 6.577, lon: 3.321, tz: 'Africa/Lagos' },
  { iata: 'CMN', name: 'Mohammed V', city: 'Casablanca', country: 'Morocco', lat: 33.367, lon: -7.59, tz: 'Africa/Casablanca' },
  { iata: 'MRU', name: 'Sir Seewoosagur Ramgoolam', city: 'Mauritius', country: 'Mauritius', lat: -20.43, lon: 57.683, tz: 'Indian/Mauritius' },

  // Europe
  { iata: 'LHR', name: 'Heathrow', city: 'London', country: 'United Kingdom', lat: 51.47, lon: -0.454, tz: 'Europe/London' },
  { iata: 'LGW', name: 'Gatwick', city: 'London', country: 'United Kingdom', lat: 51.148, lon: -0.19, tz: 'Europe/London' },
  { iata: 'STN', name: 'Stansted', city: 'London', country: 'United Kingdom', lat: 51.885, lon: 0.235, tz: 'Europe/London' },
  { iata: 'MAN', name: 'Manchester', city: 'Manchester', country: 'United Kingdom', lat: 53.365, lon: -2.273, tz: 'Europe/London' },
  { iata: 'EDI', name: 'Edinburgh', city: 'Edinburgh', country: 'United Kingdom', lat: 55.95, lon: -3.372, tz: 'Europe/London' },
  { iata: 'DUB', name: 'Dublin', city: 'Dublin', country: 'Ireland', lat: 53.427, lon: -6.244, tz: 'Europe/Dublin' },
  { iata: 'CDG', name: 'Charles de Gaulle', city: 'Paris', country: 'France', lat: 49.01, lon: 2.548, tz: 'Europe/Paris' },
  { iata: 'ORY', name: 'Orly', city: 'Paris', country: 'France', lat: 48.726, lon: 2.365, tz: 'Europe/Paris' },
  { iata: 'NCE', name: "Côte d'Azur", city: 'Nice', country: 'France', lat: 43.658, lon: 7.216, tz: 'Europe/Paris' },
  { iata: 'AMS', name: 'Schiphol', city: 'Amsterdam', country: 'Netherlands', lat: 52.311, lon: 4.764, tz: 'Europe/Amsterdam' },
  { iata: 'FRA', name: 'Frankfurt', city: 'Frankfurt', country: 'Germany', lat: 50.036, lon: 8.562, tz: 'Europe/Berlin' },
  { iata: 'MUC', name: 'Munich', city: 'Munich', country: 'Germany', lat: 48.354, lon: 11.786, tz: 'Europe/Berlin' },
  { iata: 'BER', name: 'Brandenburg', city: 'Berlin', country: 'Germany', lat: 52.366, lon: 13.503, tz: 'Europe/Berlin' },
  { iata: 'ZRH', name: 'Zurich', city: 'Zurich', country: 'Switzerland', lat: 47.458, lon: 8.548, tz: 'Europe/Zurich' },
  { iata: 'GVA', name: 'Geneva', city: 'Geneva', country: 'Switzerland', lat: 46.238, lon: 6.109, tz: 'Europe/Zurich' },
  { iata: 'VIE', name: 'Vienna', city: 'Vienna', country: 'Austria', lat: 48.11, lon: 16.57, tz: 'Europe/Vienna' },
  { iata: 'MAD', name: 'Barajas', city: 'Madrid', country: 'Spain', lat: 40.472, lon: -3.561, tz: 'Europe/Madrid' },
  { iata: 'BCN', name: 'El Prat', city: 'Barcelona', country: 'Spain', lat: 41.297, lon: 2.083, tz: 'Europe/Madrid' },
  { iata: 'PMI', name: 'Palma de Mallorca', city: 'Palma', country: 'Spain', lat: 39.552, lon: 2.739, tz: 'Europe/Madrid' },
  { iata: 'LIS', name: 'Humberto Delgado', city: 'Lisbon', country: 'Portugal', lat: 38.774, lon: -9.134, tz: 'Europe/Lisbon' },
  { iata: 'OPO', name: 'Francisco Sá Carneiro', city: 'Porto', country: 'Portugal', lat: 41.248, lon: -8.681, tz: 'Europe/Lisbon' },
  { iata: 'FCO', name: 'Fiumicino', city: 'Rome', country: 'Italy', lat: 41.8, lon: 12.239, tz: 'Europe/Rome' },
  { iata: 'MXP', name: 'Malpensa', city: 'Milan', country: 'Italy', lat: 45.63, lon: 8.723, tz: 'Europe/Rome' },
  { iata: 'VCE', name: 'Marco Polo', city: 'Venice', country: 'Italy', lat: 45.505, lon: 12.352, tz: 'Europe/Rome' },
  { iata: 'ATH', name: 'Eleftherios Venizelos', city: 'Athens', country: 'Greece', lat: 37.937, lon: 23.945, tz: 'Europe/Athens' },
  { iata: 'CPH', name: 'Kastrup', city: 'Copenhagen', country: 'Denmark', lat: 55.618, lon: 12.656, tz: 'Europe/Copenhagen' },
  { iata: 'ARN', name: 'Arlanda', city: 'Stockholm', country: 'Sweden', lat: 59.652, lon: 17.919, tz: 'Europe/Stockholm' },
  { iata: 'OSL', name: 'Gardermoen', city: 'Oslo', country: 'Norway', lat: 60.194, lon: 11.1, tz: 'Europe/Oslo' },
  { iata: 'HEL', name: 'Helsinki-Vantaa', city: 'Helsinki', country: 'Finland', lat: 60.317, lon: 24.963, tz: 'Europe/Helsinki' },
  { iata: 'KEF', name: 'Keflavík', city: 'Reykjavík', country: 'Iceland', lat: 63.985, lon: -22.606, tz: 'Atlantic/Reykjavik' },
  { iata: 'BRU', name: 'Brussels', city: 'Brussels', country: 'Belgium', lat: 50.901, lon: 4.484, tz: 'Europe/Brussels' },
  { iata: 'PRG', name: 'Václav Havel', city: 'Prague', country: 'Czechia', lat: 50.101, lon: 14.26, tz: 'Europe/Prague' },
  { iata: 'WAW', name: 'Chopin', city: 'Warsaw', country: 'Poland', lat: 52.166, lon: 20.967, tz: 'Europe/Warsaw' },
  { iata: 'BUD', name: 'Ferenc Liszt', city: 'Budapest', country: 'Hungary', lat: 47.437, lon: 19.256, tz: 'Europe/Budapest' },

  // North America
  { iata: 'JFK', name: 'John F. Kennedy', city: 'New York', country: 'United States', lat: 40.641, lon: -73.778, tz: 'America/New_York' },
  { iata: 'EWR', name: 'Newark Liberty', city: 'Newark', country: 'United States', lat: 40.689, lon: -74.174, tz: 'America/New_York' },
  { iata: 'LGA', name: 'LaGuardia', city: 'New York', country: 'United States', lat: 40.777, lon: -73.872, tz: 'America/New_York' },
  { iata: 'BOS', name: 'Logan', city: 'Boston', country: 'United States', lat: 42.366, lon: -71.02, tz: 'America/New_York' },
  { iata: 'IAD', name: 'Dulles', city: 'Washington', country: 'United States', lat: 38.953, lon: -77.456, tz: 'America/New_York' },
  { iata: 'DCA', name: 'Reagan National', city: 'Washington', country: 'United States', lat: 38.852, lon: -77.038, tz: 'America/New_York' },
  { iata: 'ATL', name: 'Hartsfield–Jackson', city: 'Atlanta', country: 'United States', lat: 33.641, lon: -84.427, tz: 'America/New_York' },
  { iata: 'MIA', name: 'Miami Intl', city: 'Miami', country: 'United States', lat: 25.793, lon: -80.291, tz: 'America/New_York' },
  { iata: 'MCO', name: 'Orlando Intl', city: 'Orlando', country: 'United States', lat: 28.431, lon: -81.308, tz: 'America/New_York' },
  { iata: 'ORD', name: "O'Hare", city: 'Chicago', country: 'United States', lat: 41.978, lon: -87.905, tz: 'America/Chicago' },
  { iata: 'DFW', name: 'Dallas/Fort Worth', city: 'Dallas', country: 'United States', lat: 32.897, lon: -97.038, tz: 'America/Chicago' },
  { iata: 'IAH', name: 'Bush Intercontinental', city: 'Houston', country: 'United States', lat: 29.99, lon: -95.336, tz: 'America/Chicago' },
  { iata: 'MSP', name: 'Minneapolis–St Paul', city: 'Minneapolis', country: 'United States', lat: 44.882, lon: -93.222, tz: 'America/Chicago' },
  { iata: 'DEN', name: 'Denver Intl', city: 'Denver', country: 'United States', lat: 39.856, lon: -104.674, tz: 'America/Denver' },
  { iata: 'PHX', name: 'Sky Harbor', city: 'Phoenix', country: 'United States', lat: 33.435, lon: -112.008, tz: 'America/Phoenix' },
  { iata: 'LAS', name: 'Harry Reid', city: 'Las Vegas', country: 'United States', lat: 36.084, lon: -115.154, tz: 'America/Los_Angeles' },
  { iata: 'LAX', name: 'Los Angeles Intl', city: 'Los Angeles', country: 'United States', lat: 33.942, lon: -118.408, tz: 'America/Los_Angeles' },
  { iata: 'SFO', name: 'San Francisco Intl', city: 'San Francisco', country: 'United States', lat: 37.619, lon: -122.375, tz: 'America/Los_Angeles' },
  { iata: 'SAN', name: 'San Diego Intl', city: 'San Diego', country: 'United States', lat: 32.734, lon: -117.19, tz: 'America/Los_Angeles' },
  { iata: 'SEA', name: 'Seattle–Tacoma', city: 'Seattle', country: 'United States', lat: 47.443, lon: -122.302, tz: 'America/Los_Angeles' },
  { iata: 'PDX', name: 'Portland Intl', city: 'Portland', country: 'United States', lat: 45.589, lon: -122.597, tz: 'America/Los_Angeles' },
  { iata: 'ANC', name: 'Ted Stevens', city: 'Anchorage', country: 'United States', lat: 61.174, lon: -149.996, tz: 'America/Anchorage' },
  { iata: 'YYZ', name: 'Pearson', city: 'Toronto', country: 'Canada', lat: 43.678, lon: -79.625, tz: 'America/Toronto' },
  { iata: 'YUL', name: 'Trudeau', city: 'Montréal', country: 'Canada', lat: 45.468, lon: -73.741, tz: 'America/Toronto' },
  { iata: 'YVR', name: 'Vancouver Intl', city: 'Vancouver', country: 'Canada', lat: 49.194, lon: -123.184, tz: 'America/Vancouver' },
  { iata: 'YYC', name: 'Calgary Intl', city: 'Calgary', country: 'Canada', lat: 51.114, lon: -114.02, tz: 'America/Edmonton' },
  { iata: 'MEX', name: 'Benito Juárez', city: 'Mexico City', country: 'Mexico', lat: 19.436, lon: -99.072, tz: 'America/Mexico_City' },
  { iata: 'CUN', name: 'Cancún', city: 'Cancún', country: 'Mexico', lat: 21.037, lon: -86.877, tz: 'America/Cancun' },

  // Central & South America
  { iata: 'PTY', name: 'Tocumen', city: 'Panama City', country: 'Panama', lat: 9.072, lon: -79.384, tz: 'America/Panama' },
  { iata: 'BOG', name: 'El Dorado', city: 'Bogotá', country: 'Colombia', lat: 4.702, lon: -74.146, tz: 'America/Bogota' },
  { iata: 'LIM', name: 'Jorge Chávez', city: 'Lima', country: 'Peru', lat: -12.022, lon: -77.114, tz: 'America/Lima' },
  { iata: 'SCL', name: 'Arturo Merino Benítez', city: 'Santiago', country: 'Chile', lat: -33.393, lon: -70.786, tz: 'America/Santiago' },
  { iata: 'EZE', name: 'Ministro Pistarini', city: 'Buenos Aires', country: 'Argentina', lat: -34.822, lon: -58.536, tz: 'America/Argentina/Buenos_Aires' },
  { iata: 'GRU', name: 'Guarulhos', city: 'São Paulo', country: 'Brazil', lat: -23.435, lon: -46.473, tz: 'America/Sao_Paulo' },
  { iata: 'GIG', name: 'Galeão', city: 'Rio de Janeiro', country: 'Brazil', lat: -22.809, lon: -43.251, tz: 'America/Sao_Paulo' },
];

const BY_IATA = new Map(AIRPORTS.map((a) => [a.iata, a]));

export function findAirport(iata: string): Airport | undefined {
  return BY_IATA.get(iata.trim().toUpperCase());
}

/**
 * Search airports by code, city, name or country, ranked so that an exact code
 * match comes first — typing "SIN" should offer Singapore before every airport
 * whose name happens to contain those letters.
 */
export function searchAirports(query: string, limit = 8): Airport[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { airport: Airport; score: number }[] = [];
  for (const airport of AIRPORTS) {
    const iata = airport.iata.toLowerCase();
    const city = airport.city.toLowerCase();
    let score = -1;
    if (iata === q) score = 0;
    else if (city.startsWith(q)) score = 1;
    else if (iata.startsWith(q)) score = 2;
    else if (airport.name.toLowerCase().includes(q)) score = 3;
    else if (city.includes(q) || airport.country.toLowerCase().includes(q)) score = 4;
    if (score >= 0) scored.push({ airport, score });
  }
  scored.sort((a, b) => a.score - b.score || a.airport.city.localeCompare(b.airport.city));
  return scored.slice(0, limit).map((s) => s.airport);
}
