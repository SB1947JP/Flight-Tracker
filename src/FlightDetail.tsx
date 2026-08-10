import { ACCENT_BORDER, ACCENT_WASH, UI_COLORS } from './palette';
import { Flight, FlightProgress, PHASE_LABEL, STATUS_LABEL, ScheduledFlight, hasSchedule, resolveProgress } from './flights';
import { RouteMap } from './RouteMap';
import { clockDiffersFrom, formatClock, formatDate, formatDuration, formatInDeviceZone, formatZoneAbbr } from './time';
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

  // A schedule was given but an airport code in it is unknown, so no route can
  // be drawn. Distinct from having no schedule at all, and worth saying so.
  if (hasSchedule(flight) && !progress) {
    return (
      <div className="p-6 text-sm" style={{ color: UI_COLORS.danger }}>
        This flight refers to an airport code that isn&rsquo;t in the bundled table ({flight.from} → {flight.to}). Edit
        it, or add the airport to <code className="text-neutral-400">src/airports.ts</code>.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      <Header flight={flight} progress={progress} onEdit={onEdit} onDelete={onDelete} />

      {hasSchedule(flight) && progress ? (
        <Timeline flight={flight} progress={progress} now={now} />
      ) : (
        <NoSchedule live={live} onEdit={onEdit} />
      )}

      <LiveBar live={live} status={progress?.status} now={now} />

      <div className="flex-1 min-h-[16rem]">
        <RouteMap progress={progress} livePosition={live.lastFix} />
      </div>

      <Stats progress={progress} live={live} now={now} />
    </div>
  );
}

/**
 * Stands in for the timeline when a flight is being followed by number alone.
 *
 * Rather than an empty space where the departure and arrival times would be,
 * this says what the app does and doesn't know — and offers the schedule as an
 * addition, since that is exactly what would fill the gap.
 */
function NoSchedule({ live, onEdit }: { live: LiveState; onEdit: () => void }) {
  const fix = live.lastFix;
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <p className="text-neutral-400 leading-snug">
        {fix
          ? 'Following this aircraft live. No schedule, so no route or time remaining.'
          : 'Following by flight number alone — nothing to show until the aircraft is transmitting.'}
      </p>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 px-2.5 py-1 rounded text-xs border border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:border-neutral-600"
      >
        Add a schedule
      </button>
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
  progress: FlightProgress | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h2 className="text-xl font-medium text-neutral-100">{flight.number}</h2>
          {progress && (
            <span
              className="px-2 py-0.5 rounded text-[11px] uppercase tracking-wide border"
              style={
                progress.status === 'enroute'
                  ? { borderColor: ACCENT_BORDER, backgroundColor: ACCENT_WASH, color: UI_COLORS.accent }
                  : { borderColor: UI_COLORS.muted, color: UI_COLORS.heading }
              }
            >
              {STATUS_LABEL[progress.status]}
              {progress.status === 'enroute' && ` · ${PHASE_LABEL[progress.phase]}`}
            </span>
          )}
        </div>
        {progress && (
          <p className="mt-1 text-sm text-neutral-400 truncate">
            {progress.origin.city} ({progress.origin.iata}) → {progress.destination.city} (
            {progress.destination.iata})
          </p>
        )}
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
function Timeline({ flight, progress, now }: { flight: ScheduledFlight; progress: FlightProgress; now: number }) {
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
          yours={clockDiffersFrom(flight.departUtc, origin.tz) ? formatInDeviceZone(flight.departUtc) : undefined}
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
          yours={clockDiffersFrom(flight.arriveUtc, destination.tz) ? formatInDeviceZone(flight.arriveUtc) : undefined}
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
function LiveBar({ live, status, now }: { live: LiveState; status?: FlightProgress['status']; now: number }) {
  const { callsign, matchedCallsign, lastFix, result, loading, refresh } = live;
  // Name the spelling that actually matched — it is not always the one searched
  // for, and when it differs that difference is worth seeing.
  const found = matchedCallsign ?? callsign;

  // Without a schedule there is no "not yet departed" to wait for — the aircraft
  // is either transmitting or it isn't, so the search runs continuously.
  const watching = status === undefined || status === 'enroute';

  let tone: 'live' | 'stale' | 'idle' = 'idle';
  let text: string;

  if (!watching) {
    text = status === 'scheduled' ? 'Live tracking starts when the flight departs.' : 'Flight has landed.';
  } else if (!callsign) {
    text = "Couldn't work out this flight's radio callsign — try entering it directly (e.g. QFA12 instead of QF12).";
  } else if (lastFix && now - lastFix.receivedAt < FIX_FRESH_MS) {
    tone = 'live';
    const age = Math.max(0, Math.round((now - lastFix.receivedAt) / 1000));
    text = `Live position from ${found} · ${age}s ago`;
  } else if (lastFix) {
    tone = 'stale';
    text = `No signal from ${found} for ${formatDuration(now - lastFix.receivedAt)} — showing its last known position. Long stretches over ocean are normal.`;
  } else if (result?.state === 'not-found') {
    tone = 'stale';
    text = `Nothing broadcasting as ${callsign} right now. Over an ocean or anywhere without receivers on the ground below, that is normal and expected — the position above is the schedule estimate.`;
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
      {watching && callsign && (
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
  yours,
  alignRight,
}: {
  iata: string;
  clock: string;
  date: string;
  zone: string;
  /** The same moment on the reader's own clock, when that differs. */
  yours?: string;
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
      {/* The same instant where the reader is, so a time entered in the wrong
          zone shows up here rather than as a silently wrong countdown. */}
      {yours && <div className="text-[11px] text-neutral-600 tabular-nums whitespace-nowrap">{yours} your time</div>}
    </div>
  );
}

function Stats({ progress, live, now }: { progress: FlightProgress | null; live: LiveState; now: number }) {
  const fix = live.lastFix;
  const fixIsFresh = fix !== null && now - fix.receivedAt < FIX_FRESH_MS;

  // Real measurements replace the estimates one by one, wherever the aircraft
  // actually reported them — a feed may carry a position but no altitude. With
  // no schedule, only the measured ones exist at all.
  const stats: { label: string; value: string; live?: boolean }[] = [];

  if (progress) {
    stats.push(
      { label: 'Distance', value: `${Math.round(progress.totalDistanceKm).toLocaleString()} km` },
      { label: 'Flown', value: `${Math.round(progress.flownKm).toLocaleString()} km` },
      { label: 'To run', value: `${Math.round(progress.remainingKm).toLocaleString()} km` },
    );
  }

  if (fixIsFresh && fix.groundSpeedKmh !== undefined) {
    stats.push({ label: 'Ground speed', value: `${Math.round(fix.groundSpeedKmh).toLocaleString()} km/h`, live: true });
  } else if (progress) {
    stats.push({ label: 'Avg ground speed', value: `${Math.round(progress.averageSpeedKmh).toLocaleString()} km/h` });
  }

  if (fixIsFresh && fix.altitudeM !== undefined) {
    stats.push({ label: 'Altitude', value: `${Math.round(fix.altitudeM).toLocaleString()} m`, live: true });
  } else if (progress) {
    stats.push({ label: 'Track', value: `${Math.round(progress.headingDeg)}°` });
  }

  if (fixIsFresh && fix.headingDeg !== undefined) {
    stats.push({ label: 'Track', value: `${Math.round(fix.headingDeg)}°`, live: true });
  }

  if (fix) {
    stats.push({ label: 'Position', value: `${fix.lat.toFixed(2)}, ${fix.lon.toFixed(2)}`, live: fixIsFresh });
  } else if (progress) {
    stats.push({
      label: 'Position',
      value:
        progress.status === 'scheduled'
          ? 'On the ground'
          : `${progress.position.lat.toFixed(2)}, ${progress.position.lon.toFixed(2)}`,
    });
  }

  if (stats.length === 0) return null;

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
        {fixIsFresh && progress
          ? 'Figures marked · are measured from the aircraft itself. The rest are worked out from the schedule you entered, along a direct route.'
          : fixIsFresh
            ? 'All of these are measured from the aircraft itself.'
            : 'These are worked out from the schedule you entered — a direct route flown at a constant rate. They do not account for actual routing, winds, holding or delays.'}
      </p>
    </div>
  );
}
