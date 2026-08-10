import { ACCENT_BORDER, ACCENT_WASH, UI_COLORS } from './palette';
import { Flight, FlightProgress, PHASE_LABEL, STATUS_LABEL, resolveProgress } from './flights';
import { RouteMap } from './RouteMap';
import { formatClock, formatDate, formatDuration, formatZoneAbbr } from './time';
import { FIX_FRESH_MS, LiveState } from './useLive';

/** The tracking view for one flight: where it is, and when it gets there. */
export function FlightDetail({
  flight,
  now,
  live,
  onEdit,
  onDelete,
}: {
  flight: Flight;
  now: number;
  live: LiveState;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const progress = resolveProgress(flight, now);

  if (!progress) {
    return (
      <div className="p-6 text-sm" style={{ color: UI_COLORS.danger }}>
        This flight refers to an airport code that isn&rsquo;t in the bundled table
        ({flight.from} → {flight.to}). Edit it, or add the airport to{' '}
        <code className="text-neutral-400">src/flights/airports.ts</code>.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      <Header flight={flight} progress={progress} onEdit={onEdit} onDelete={onDelete} />
      <Timeline flight={flight} progress={progress} now={now} />

      <LiveBar live={live} status={progress.status} now={now} />

      <div className="flex-1 min-h-[16rem]">
        <RouteMap progress={progress} livePosition={live.lastFix} />
      </div>

      <Stats progress={progress} live={live} now={now} />
    </div>
  );
}

function Header({
  flight,
  progress,
  onEdit,
  onDelete,
}: {
  flight: Flight;
  progress: FlightProgress;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { origin, destination, status, phase } = progress;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h2 className="text-xl font-medium text-neutral-100">{flight.number}</h2>
          <span
            className="px-2 py-0.5 rounded text-[11px] uppercase tracking-wide border"
            style={
              status === 'enroute'
                ? { borderColor: ACCENT_BORDER, backgroundColor: ACCENT_WASH, color: UI_COLORS.accent }
                : { borderColor: UI_COLORS.muted, color: UI_COLORS.heading }
            }
          >
            {STATUS_LABEL[status]}
            {status === 'enroute' && ` · ${PHASE_LABEL[phase]}`}
          </span>
        </div>
        <p className="mt-1 text-sm text-neutral-400 truncate">
          {origin.city} ({origin.iata}) → {destination.city} ({destination.iata})
        </p>
        {flight.note && <p className="mt-1 text-xs text-neutral-500 truncate">{flight.note}</p>}
      </div>

      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          onClick={onEdit}
          className="px-2.5 py-1 rounded text-xs border border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:border-neutral-600"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="px-2.5 py-1 rounded text-xs border border-neutral-700 hover:border-neutral-600"
          style={{ color: UI_COLORS.danger }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

/** Departure and arrival times, with the progress bar between them. */
function Timeline({ flight, progress, now }: { flight: Flight; progress: FlightProgress; now: number }) {
  const { origin, destination, status, fraction, remainingMs, elapsedMs, durationMs } = progress;

  // One line that answers the only question anyone opens a tracker to ask.
  const headline =
    status === 'scheduled'
      ? `Departs in ${formatDuration(-elapsedMs)}`
      : status === 'arrived'
        ? `Landed ${formatDuration(now - flight.arriveUtc)} ago`
        : `${formatDuration(remainingMs)} remaining`;

  return (
    <div>
      <div className="flex items-end justify-between gap-4 text-sm">
        <Endpoint
          iata={origin.iata}
          clock={formatClock(flight.departUtc, origin.tz)}
          date={formatDate(flight.departUtc, origin.tz)}
          zone={formatZoneAbbr(flight.departUtc, origin.tz)}
        />
        <div className="text-center pb-0.5">
          <div className="text-neutral-200 tabular-nums">{headline}</div>
          <div className="text-[11px] text-neutral-500 tabular-nums">
            {formatDuration(durationMs)} scheduled · {Math.round(fraction * 100)}%
          </div>
        </div>
        <Endpoint
          iata={destination.iata}
          clock={formatClock(flight.arriveUtc, destination.tz)}
          date={formatDate(flight.arriveUtc, destination.tz)}
          zone={formatZoneAbbr(flight.arriveUtc, destination.tz)}
          alignRight
        />
      </div>

      <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: UI_COLORS.muted }}>
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-linear"
          style={{ width: `${fraction * 100}%`, backgroundColor: UI_COLORS.accent }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fraction * 100)}
          aria-label="Flight progress"
        />
      </div>
    </div>
  );
}

/**
 * One line saying where the numbers below are coming from.
 *
 * This is the most important text on the page. Everything else looks identical
 * whether it is a real radio fix from the aircraft or arithmetic on a timetable,
 * and the difference matters enormously — so it is stated outright, every time,
 * rather than left for the reader to infer from a subtle colour.
 */
function LiveBar({ live, status, now }: { live: LiveState; status: FlightProgress['status']; now: number }) {
  const { callsign, lastFix, result, loading, refresh } = live;

  let tone: 'live' | 'stale' | 'idle' = 'idle';
  let text: string;

  if (status !== 'enroute') {
    text = status === 'scheduled' ? 'Live tracking starts when the flight departs.' : 'Flight has landed.';
  } else if (!callsign) {
    text = "Couldn't work out this flight's radio callsign — try entering it directly (e.g. QFA12 instead of QF12).";
  } else if (lastFix && now - lastFix.receivedAt < FIX_FRESH_MS) {
    tone = 'live';
    const age = Math.max(0, Math.round((now - lastFix.receivedAt) / 1000));
    text = `Live position from ${callsign} · ${age}s ago`;
  } else if (lastFix) {
    tone = 'stale';
    text = `No signal from ${callsign} for ${formatDuration(now - lastFix.receivedAt)} — showing its last known position. Long stretches over ocean are normal.`;
  } else if (result?.state === 'not-found') {
    tone = 'stale';
    text = `No aircraft broadcasting as ${callsign} right now. It may be out of range, or the callsign may differ from the flight number.`;
  } else if (result?.state === 'error') {
    tone = 'stale';
    text = result.message;
  } else {
    text = loading ? `Looking for ${callsign}…` : `Waiting for a signal from ${callsign}…`;
  }

  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1.5 rounded border text-xs"
      style={
        tone === 'live'
          ? { borderColor: ACCENT_BORDER, backgroundColor: ACCENT_WASH, color: UI_COLORS.accent }
          : { borderColor: UI_COLORS.muted, color: UI_COLORS.heading }
      }
      role="status"
    >
      {/* A filled dot for a live signal, hollow for anything else — so the
          state is legible without reading, and without adding a colour. */}
      <span
        aria-hidden="true"
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={
          tone === 'live'
            ? { backgroundColor: UI_COLORS.accent }
            : { border: `1px solid ${UI_COLORS.muted}` }
        }
      />
      <span className="min-w-0 flex-1 leading-snug">{text}</span>
      {status === 'enroute' && callsign && (
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="shrink-0 underline hover:text-neutral-200 disabled:opacity-50"
        >
          {loading ? 'Checking…' : 'Check now'}
        </button>
      )}
    </div>
  );
}

function Endpoint({
  iata,
  clock,
  date,
  zone,
  alignRight,
}: {
  iata: string;
  clock: string;
  date: string;
  zone: string;
  alignRight?: boolean;
}) {
  return (
    <div className={alignRight ? 'text-right' : ''}>
      <div className="text-[11px] tracking-widest" style={{ color: UI_COLORS.heading }}>
        {iata}
      </div>
      <div className="text-lg leading-tight text-neutral-100 tabular-nums">{clock}</div>
      {/* The zone label is not decoration: without it a reader has no way to
          tell whether 09:35 is their clock or the airport's. */}
      <div className="text-[11px] text-neutral-500 tabular-nums whitespace-nowrap">
        {date} · {zone}
      </div>
    </div>
  );
}

function Stats({ progress, live, now }: { progress: FlightProgress; live: LiveState; now: number }) {
  const { position, totalDistanceKm, flownKm, remainingKm, averageSpeedKmh, headingDeg, status } = progress;
  const fix = live.lastFix;
  const fixIsFresh = fix !== null && now - fix.receivedAt < FIX_FRESH_MS;

  // Real measurements replace the estimates one by one, wherever the aircraft
  // actually reported them — a feed may carry a position but no altitude.
  const stats: { label: string; value: string; live?: boolean }[] = [
    { label: 'Distance', value: `${Math.round(totalDistanceKm).toLocaleString()} km` },
    { label: 'Flown', value: `${Math.round(flownKm).toLocaleString()} km` },
    { label: 'To run', value: `${Math.round(remainingKm).toLocaleString()} km` },
    fixIsFresh && fix.groundSpeedKmh !== undefined
      ? { label: 'Ground speed', value: `${Math.round(fix.groundSpeedKmh).toLocaleString()} km/h`, live: true }
      : { label: 'Avg ground speed', value: `${Math.round(averageSpeedKmh).toLocaleString()} km/h` },
    fixIsFresh && fix.altitudeM !== undefined
      ? { label: 'Altitude', value: `${Math.round(fix.altitudeM).toLocaleString()} m`, live: true }
      : { label: 'Track', value: `${Math.round(headingDeg)}°` },
    fix
      ? { label: 'Position', value: `${fix.lat.toFixed(2)}, ${fix.lon.toFixed(2)}`, live: fixIsFresh }
      : {
          label: 'Position',
          value: status === 'scheduled' ? 'On the ground' : `${position.lat.toFixed(2)}, ${position.lon.toFixed(2)}`,
        },
  ];

  return (
    <div>
      <dl className="grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-[10px] uppercase tracking-wide" style={{ color: UI_COLORS.heading }}>
              {s.label}
              {s.live && <span style={{ color: UI_COLORS.accent }}> ·</span>}
            </dt>
            <dd className="text-sm text-neutral-200 tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
      {/* Say plainly what this is. There is no radar feed behind it, and a
          tracker that looked authoritative about a diverted flight would be
          worse than one that admits what it knows. */}
      <p className="mt-3 text-[11px] text-neutral-600 leading-snug">
        {fixIsFresh
          ? 'Figures marked · are measured from the aircraft itself. The rest are worked out from the schedule you entered, along a direct route.'
          : 'These are worked out from the schedule you entered — a direct route flown at a constant rate. They do not account for actual routing, winds, holding or delays.'}
      </p>
    </div>
  );
}
