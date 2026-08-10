import { FormEvent, useMemo, useState } from 'react';
import { ACCENT_BORDER, ACCENT_WASH, UI_COLORS } from './palette';
import { Airport, findAirport, searchAirports } from './airports';
import { Flight, newFlightId } from './flights';
import { deviceZone, formatDuration, formatInDeviceZone, utcToZonedWallClock, zonedWallClockToUtc } from './time';

/**
 * Add/edit form for a flight.
 *
 * The times are held as airport wall-clock strings and only converted to UTC on
 * submit. That ordering matters: "09:35" on a boarding pass is a fact about the
 * departure airport's clock, so changing the origin airport should move the
 * instant the flight departs, not rewrite the time you typed.
 */

const inputClass =
  'w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 ' +
  'placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500';

const labelClass = 'block text-[11px] uppercase tracking-wide mb-1';

/** IATA-code field with a search-as-you-type list of matching airports. */
function AirportField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (iata: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const resolved = findAirport(value);
  const matches = useMemo(() => searchAirports(query), [query]);

  return (
    <div>
      <label htmlFor={id} className={labelClass} style={{ color: UI_COLORS.heading }}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
        // Uppercased on the way in so "syd" resolves without the user having to
        // shout; the stored value is always the canonical IATA code.
          value={value}
          onChange={(e) => {
            const next = e.target.value.toUpperCase().slice(0, 3);
            onChange(next);
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // A click on a suggestion fires after blur, so closing is deferred.
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder="e.g. SYD"
          autoComplete="off"
          spellCheck={false}
          className={`${inputClass} uppercase tracking-widest`}
        />

        {/* Suggestions are suppressed once the typed text is itself a valid
            code, so picking "SYD" doesn't leave a list hanging over the form. */}
        {open && matches.length > 0 && !findAirport(query) && (
          <ul className="absolute z-10 left-0 right-0 top-full mt-1 max-h-56 overflow-auto rounded border border-neutral-700 bg-neutral-900 shadow-lg">
            {matches.map((a: Airport) => (
              <li key={a.iata}>
                <button
                  type="button"
                  // Keep the blur from firing before the click lands.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(a.iata);
                    setQuery('');
                    setOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 text-xs hover:bg-neutral-800"
                >
                  <span className="font-medium tracking-widest text-neutral-200">{a.iata}</span>{' '}
                  <span className="text-neutral-400">
                    {a.city}, {a.country}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-1 text-[11px] leading-tight min-h-[1.5rem]">
        {resolved ? (
          <span className="text-neutral-400">
            {resolved.city} — {resolved.name}
          </span>
        ) : value.length > 0 ? (
          <span style={{ color: UI_COLORS.danger }}>Unknown code</span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A time field that says what it just understood.
 *
 * The label alone ("Departs (SYD local)") was not enough: it describes the rule
 * without showing the consequence, so someone who types their own time instead
 * of the airport's gets no signal at all until every figure on the next screen
 * is hours out. The echo underneath states the same instant on the reader's own
 * clock, where a mistake is obvious at once.
 */
function TimeField({
  id,
  label,
  airport,
  value,
  onChange,
}: {
  id: string;
  label: string;
  airport: Airport | undefined;
  value: string;
  onChange: (value: string) => void;
}) {
  const utc = airport && value ? zonedWallClockToUtc(value, airport.tz) : NaN;
  // No point telling someone in Sydney that 09:35 in Sydney is 09:35 for them.
  const showEcho = Number.isFinite(utc) && airport !== undefined && airport.tz !== deviceZone();

  return (
    <div>
      <label htmlFor={id} className={labelClass} style={{ color: UI_COLORS.heading }}>
        {label} {airport ? `— ${airport.iata} local time` : ''}
      </label>
      <input
        id={id}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
      <div className="mt-1 text-[11px] leading-tight min-h-[1.25rem] text-neutral-500">
        {showEcho && <>That is {formatInDeviceZone(utc)} where you are.</>}
      </div>
    </div>
  );
}

export function FlightForm({
  existing,
  others,
  onSave,
  onCancel,
}: {
  existing?: Flight;
  /** Flights already saved, so a second copy of one can be pointed out. */
  others: Flight[];
  onSave: (flight: Flight) => void;
  onCancel: () => void;
}) {
  const [number, setNumber] = useState(existing?.number ?? '');
  const [from, setFrom] = useState(existing?.from ?? '');
  const [to, setTo] = useState(existing?.to ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [departLocal, setDepartLocal] = useState(() =>
    existing?.departUtc !== undefined
      ? utcToZonedWallClock(existing.departUtc, findAirport(existing.from ?? '')?.tz ?? 'UTC')
      : '',
  );
  const [arriveLocal, setArriveLocal] = useState(() =>
    existing?.arriveUtc !== undefined
      ? utcToZonedWallClock(existing.arriveUtc, findAirport(existing.to ?? '')?.tz ?? 'UTC')
      : '',
  );
  const [error, setError] = useState<string | null>(null);

  const origin = findAirport(from);
  const destination = findAirport(to);

  // Correcting a mistake by adding a second entry rather than editing the first
  // is a natural thing to do, and it leaves two flights that look identical
  // everywhere except their dates.
  const duplicate = others.find(
    (f) => f.number === number.trim().toUpperCase() && (f.from ?? '') === from && (f.to ?? '') === to,
  );

  /**
   * What this schedule means *right now* — already landed, already flying, or
   * still to come.
   *
   * Entering a flight that has secretly already departed is the easiest mistake
   * this form allows: set the time, leave the date on today, and a flight that
   * takes off tomorrow evening is stored as one that took off this morning. The
   * app then does exactly as it is told and shows it halfway across an ocean,
   * with no hint that anything is wrong.
   *
   * Tracking a flight that is genuinely already in the air is a real thing to
   * want, so this states the situation rather than blocking it.
   */
  const timing = useMemo(() => {
    if (!origin || !destination || !departLocal || !arriveLocal) return null;
    const depart = zonedWallClockToUtc(departLocal, origin.tz);
    const arrive = zonedWallClockToUtc(arriveLocal, destination.tz);
    if (!Number.isFinite(depart) || !Number.isFinite(arrive) || arrive <= depart) return null;
    const now = Date.now();
    if (depart > now) return null;
    return arrive > now
      ? { kind: 'airborne' as const, text: `Note: this departed ${formatDuration(now - depart)} ago, so it will show as already in the air.` }
      : { kind: 'landed' as const, text: `Note: this flight landed ${formatDuration(now - arrive)} ago. Check the date if you meant a future flight.` };
  }, [origin, destination, departLocal, arriveLocal]);

  // Live block time, so a mistyped date (the classic overnight-flight one, where
  // arrival is the next day) is visible before saving rather than after.
  const previewDuration = useMemo(() => {
    if (!origin || !destination || !departLocal || !arriveLocal) return null;
    const depart = zonedWallClockToUtc(departLocal, origin.tz);
    const arrive = zonedWallClockToUtc(arriveLocal, destination.tz);
    if (!Number.isFinite(depart) || !Number.isFinite(arrive) || arrive <= depart) return null;
    return arrive - depart;
  }, [origin, destination, departLocal, arriveLocal]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!number.trim()) return setError('Give the flight a number or a name.');

    const base = {
      id: existing?.id ?? newFlightId(),
      number: number.trim().toUpperCase(),
      note: note.trim() || undefined,
    };

    // The schedule is all-or-nothing. Leaving every field blank is a complete,
    // valid answer — follow this aircraft, that's all — so an empty section is
    // not an error to be nagged about.
    const filled = [from, to, departLocal, arriveLocal].filter((v) => v.trim() !== '');
    if (filled.length === 0) return onSave(base);
    if (filled.length < 4) {
      return setError('Fill in both airports and both times, or leave all four blank to just follow it live.');
    }

    if (!origin) return setError('Departure airport code not recognised.');
    if (!destination) return setError('Arrival airport code not recognised.');

    const departUtc = zonedWallClockToUtc(departLocal, origin.tz);
    const arriveUtc = zonedWallClockToUtc(arriveLocal, destination.tz);
    if (!Number.isFinite(departUtc) || !Number.isFinite(arriveUtc)) return setError("Those times couldn't be read.");
    if (arriveUtc <= departUtc) {
      return setError('Arrival is at or before departure. Check the date — overnight flights land the next day.');
    }

    onSave({ ...base, from: origin.iata, to: destination.iata, departUtc, arriveUtc });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="flight-number" className={labelClass} style={{ color: UI_COLORS.heading }}>
          Flight
        </label>
        <input
          id="flight-number"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="e.g. QF63"
          autoComplete="off"
          className={`${inputClass} uppercase`}
        />
      </div>

      <p className="text-[11px] text-neutral-500 leading-snug -mt-2">
        That is all you need to follow it live — the aircraft broadcasts its own position, altitude and speed.
      </p>

      <div className="pt-1 border-t border-neutral-800">
        <p className="pt-3 text-[11px] uppercase tracking-wide" style={{ color: UI_COLORS.heading }}>
          Schedule <span className="normal-case tracking-normal text-neutral-600">— optional</span>
        </p>
        <p className="mt-1 mb-3 text-[11px] text-neutral-500 leading-snug">
          Add the airports and times and you also get the route drawn, how far it has come, and how long is left —
          including while the aircraft is out of radio range.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <AirportField id="flight-from" label="From" value={from} onChange={setFrom} />
          <AirportField id="flight-to" label="To" value={to} onChange={setTo} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TimeField
          id="flight-depart"
          label="Departs"
          airport={origin}
          value={departLocal}
          onChange={setDepartLocal}
        />
        <TimeField
          id="flight-arrive"
          label="Arrives"
          airport={destination}
          value={arriveLocal}
          onChange={setArriveLocal}
        />
      </div>

      <p className="text-[11px] text-neutral-500 leading-snug -mt-2">
        Enter the times exactly as printed on the ticket — each one is the time on the clock{' '}
        <em className="not-italic text-neutral-300">at that airport</em>, not on yours.
        {previewDuration !== null && (
          <>
            {' '}
            That makes the flight{' '}
            <span className="text-neutral-300 tabular-nums">{formatDuration(previewDuration)}</span> long.
          </>
        )}
      </p>

      <div>
        <label htmlFor="flight-note" className={labelClass} style={{ color: UI_COLORS.heading }}>
          Note <span className="normal-case tracking-normal text-neutral-600">(optional)</span>
        </label>
        <input
          id="flight-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Seat 42K, terminal 1…"
          className={inputClass}
        />
      </div>

      {duplicate && (
        <p className="text-xs leading-snug text-neutral-400">
          You already have a {duplicate.number} from {duplicate.from} to {duplicate.to} saved. Adding this makes a
          second one — edit the existing flight instead if you meant to correct it.
        </p>
      )}

      {timing && (
        <p className="text-xs leading-snug" style={{ color: UI_COLORS.danger }}>
          {timing.text}
        </p>
      )}

      {error && (
        <p className="text-xs leading-snug" style={{ color: UI_COLORS.danger }} role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="px-3 py-1.5 rounded text-sm border"
          style={{ borderColor: ACCENT_BORDER, backgroundColor: ACCENT_WASH, color: UI_COLORS.accent }}
        >
          {existing ? 'Save changes' : 'Track flight'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded text-sm border border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:border-neutral-600"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
