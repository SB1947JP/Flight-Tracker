import { UI_COLORS } from './palette';
import { Flight, FlightProgress, PHASE_LABEL, ScheduledFlight, hasSchedule, resolveProgress } from './flights';
import { RouteMap } from './RouteMap';
import { destinationPoint } from './geo';
import { clockDiffersFrom, formatClock, formatDate, formatDuration, formatInDeviceZone } from './time';
import { FIX_FRESH_MS, LiveState } from './useLive';
import { LivePosition } from './live';

/**
 * How long the aircraft is carried forward from its last report.
 *
 * Between reports the marker advances along the reported track at the reported
 * speed, so it visibly flies rather than sitting still and jumping every twenty
 * seconds. That is an assumption, and assumptions rot: an aircraft that has said
 * nothing for four minutes may have turned, descended or landed. Past this the
 * marker stops where it was last actually seen, which is the honest place for it.
 */
const DEAD_RECKON_MAX_MS = 3 * 60_000;

/** The aircraft's position now, carried forward from its last report. */
function projectedPosition(fix: LivePosition | null, now: number) {
  if (!fix) return null;
  const elapsed = now - fix.receivedAt;
  if (elapsed <= 0 || elapsed > DEAD_RECKON_MAX_MS || fix.groundSpeedKmh === undefined || fix.headingDeg === undefined) {
    return fix;
  }
  const travelled = fix.groundSpeedKmh * (elapsed / 3_600_000);
  const moved = destinationPoint({ lat: fix.lat, lon: fix.lon }, fix.headingDeg, travelled);
  return { ...fix, lat: moved.lat, lon: moved.lon };
}

/**
 * The tracking view for one flight.
 *
 * Ordered by what someone opens the page to find out, which is not the order
 * the data happens to arrive in: how long is left, then where it is, then the
 * detail. The map takes as much height as is going, because it is the content
 * and everything else is a caption for it.
 */
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
  // Recomputed on every tick, so the marker creeps along the map second by
  // second instead of standing still between reports.
  const shownPosition = projectedPosition(live.lastFix, now);
  const fix = live.lastFix;
  const isLive = fix !== null && now - fix.receivedAt < FIX_FRESH_MS;

  // A schedule was given but an airport code in it is unknown, so no route can
  // be drawn. Distinct from having no schedule at all, and worth saying so.
  if (hasSchedule(flight) && !progress) {
    return (
      <div className="px-4 py-6 text-sm" style={{ color: UI_COLORS.danger }}>
        This flight refers to an airport code that isn&rsquo;t in the bundled table ({flight.from} → {flight.to}). Edit
        it, or add the airport to <code>src/airports.ts</code>.
      </div>
    );
  }

  // Capped and centred: at full width on a desktop the departure and arrival
  // times ended up a thousand pixels apart, which is not a line anyone reads as
  // a pair.
  return (
    <div className="flex flex-col h-full min-h-0 w-full max-w-4xl mx-auto">
      <div className="px-4 pt-4 pb-3 flex flex-col gap-3">
        <Heading flight={flight} progress={progress} onEdit={onEdit} onDelete={onDelete} />
        {hasSchedule(flight) && progress ? (
          <Timeline flight={flight} progress={progress} now={now} />
        ) : (
          <p className="text-sm" style={{ color: UI_COLORS.muted }}>
            {fix ? 'Following this aircraft live.' : 'Waiting for this aircraft to start transmitting.'}
          </p>
        )}
        <Signal live={live} status={progress?.status} now={now} isLive={isLive} />
      </div>

      {/* The map gets whatever height is left, and no less than a third of a
          phone screen. It is the reason the page exists. */}
      <div className="flex-1 min-h-[18rem] px-4">
        <RouteMap progress={progress} livePosition={shownPosition} />
      </div>

      <Facts progress={progress} fix={fix} isLive={isLive} />
    </div>
  );
}

function Heading({
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
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-2xl leading-none">{flight.number}</h2>
        <p className="mt-1.5 text-sm truncate" style={{ color: UI_COLORS.muted }}>
          {progress
            ? `${progress.origin.city} → ${progress.destination.city}`
            : hasSchedule(flight)
              ? `${flight.from} → ${flight.to}`
              : 'No schedule'}
          {flight.note && <span> · {flight.note}</span>}
        </p>
      </div>
      {/* Text buttons rather than outlined ones. Two bordered boxes at the top
          of the page were competing with the flight number for attention, and
          neither is something anyone came here to press. */}
      <div className="flex items-center gap-1 shrink-0 -mt-1 -mr-2 text-sm">
        <button type="button" onClick={onEdit} className="px-2 py-1 rounded hover:bg-black/5" style={{ color: UI_COLORS.muted }}>
          Edit
        </button>
        <button type="button" onClick={onDelete} className="px-2 py-1 rounded hover:bg-black/5" style={{ color: UI_COLORS.danger }}>
          Remove
        </button>
      </div>
    </div>
  );
}

/** The headline answer, the progress bar, and the two times under its ends. */
function Timeline({ flight, progress, now }: { flight: ScheduledFlight; progress: FlightProgress; now: number }) {
  const { origin, destination, status, fraction, remainingMs, elapsedMs } = progress;

  const headline =
    status === 'scheduled'
      ? `Departs in ${formatDuration(-elapsedMs)}`
      : status === 'arrived'
        ? `Landed ${formatDuration(now - flight.arriveUtc)} ago`
        : `${formatDuration(remainingMs)} remaining`;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-base tabular-nums">{headline}</span>
        <span className="text-xs tabular-nums" style={{ color: UI_COLORS.muted }}>
          {status === 'enroute' && `${PHASE_LABEL[progress.phase].toLowerCase()} · `}
          {Math.round(fraction * 100)}%
        </span>
      </div>

      <div className="mt-2 h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: UI_COLORS.hairline }}>
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-linear"
          style={{ width: `${fraction * 100}%`, backgroundColor: UI_COLORS.ink }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fraction * 100)}
          aria-label="Flight progress"
        />
      </div>

      <div className="mt-1.5 flex items-start justify-between gap-3 text-xs tabular-nums">
        <End
          iata={origin.iata}
          clock={formatClock(flight.departUtc, origin.tz)}
          date={formatDate(flight.departUtc, origin.tz)}
          yours={clockDiffersFrom(flight.departUtc, origin.tz) ? formatInDeviceZone(flight.departUtc) : undefined}
        />
        <End
          iata={destination.iata}
          clock={formatClock(flight.arriveUtc, destination.tz)}
          date={formatDate(flight.arriveUtc, destination.tz)}
          yours={clockDiffersFrom(flight.arriveUtc, destination.tz) ? formatInDeviceZone(flight.arriveUtc) : undefined}
          alignRight
        />
      </div>
    </div>
  );
}

function End({
  iata,
  clock,
  date,
  yours,
  alignRight,
}: {
  iata: string;
  clock: string;
  date: string;
  /** The same moment on the reader's own clock, when that differs. */
  yours?: string;
  alignRight?: boolean;
}) {
  return (
    <div className={alignRight ? 'text-right' : ''}>
      <div>
        <span className="tracking-wider">{iata}</span> <span className="ml-0.5">{clock}</span>
      </div>
      <div style={{ color: UI_COLORS.muted }}>{date}</div>
      {/* The same instant where the reader is, so a time entered in the wrong
          zone shows up here rather than as a silently wrong countdown. */}
      {yours && <div style={{ color: UI_COLORS.muted }}>{yours} your time</div>}
    </div>
  );
}

/**
 * One line saying where the numbers come from.
 *
 * The most important text on the page, and now the only chrome-free version of
 * it: a dot, a sentence, and a way to ask again. It used to be a bordered box
 * of its own, which made a caption look like a control.
 */
function Signal({
  live,
  status,
  now,
  isLive,
}: {
  live: LiveState;
  status?: FlightProgress['status'];
  now: number;
  isLive: boolean;
}) {
  const { callsign, matchedCallsign, lastFix, result, loading, refresh } = live;
  const found = matchedCallsign ?? callsign;
  const watching = status === undefined || status === 'enroute';

  let text: string;
  if (!watching) {
    text = status === 'scheduled' ? 'Live tracking starts when the flight departs.' : 'Flight has landed.';
  } else if (!callsign) {
    text = "Couldn't work out this flight's radio callsign — try entering it directly, e.g. QFA12 rather than QF12.";
  } else if (isLive && lastFix) {
    text = `Live from ${found}, ${Math.max(0, Math.round((now - lastFix.receivedAt) / 1000))}s ago`;
  } else if (lastFix) {
    text = `No signal from ${found} for ${formatDuration(now - lastFix.receivedAt)} — showing its last known position.`;
  } else if (result?.state === 'not-found') {
    text = `Nothing broadcasting as ${found} right now. Over an ocean, that is normal.`;
  } else if (result?.state === 'error') {
    text = result.message;
  } else {
    text = loading ? `Looking for ${found}…` : `Waiting for a signal from ${found}…`;
  }

  return (
    <div className="flex items-center gap-2 text-xs" role="status" style={{ color: UI_COLORS.muted }}>
      <span
        aria-hidden="true"
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={isLive ? { backgroundColor: UI_COLORS.ink } : { border: `1px solid ${UI_COLORS.muted}` }}
      />
      <span className="min-w-0 flex-1 leading-snug" style={isLive ? { color: UI_COLORS.ink } : undefined}>
        {text}
      </span>
      {watching && callsign && (
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="shrink-0 px-1.5 py-0.5 -mr-1 rounded hover:bg-black/5 disabled:opacity-50"
        >
          {loading ? 'Checking…' : 'Refresh'}
        </button>
      )}
    </div>
  );
}

/**
 * The measurements, along the bottom.
 *
 * Cut to four. There were six, plus a paragraph explaining which were measured
 * and which inferred — on a phone that filled the screen below the map with
 * things nobody had asked for. Anything measured from the aircraft is set in
 * ink; anything worked out from the schedule is set in grey, and the caption
 * says so once in six words.
 */
function Facts({
  progress,
  fix,
  isLive,
}: {
  progress: FlightProgress | null;
  fix: LivePosition | null;
  isLive: boolean;
}) {
  const items: { label: string; value: string; measured: boolean }[] = [];

  if (isLive && fix?.groundSpeedKmh !== undefined) {
    items.push({ label: 'Speed', value: `${Math.round(fix.groundSpeedKmh).toLocaleString()} km/h`, measured: true });
  } else if (progress) {
    items.push({ label: 'Avg speed', value: `${Math.round(progress.averageSpeedKmh).toLocaleString()} km/h`, measured: false });
  }

  if (isLive && fix?.altitudeM !== undefined) {
    items.push({ label: 'Altitude', value: `${Math.round(fix.altitudeM).toLocaleString()} m`, measured: true });
  }

  if (progress) {
    items.push({ label: 'To run', value: `${Math.round(progress.remainingKm).toLocaleString()} km`, measured: false });
    items.push({ label: 'Distance', value: `${Math.round(progress.totalDistanceKm).toLocaleString()} km`, measured: false });
  } else if (isLive && fix?.headingDeg !== undefined) {
    items.push({ label: 'Track', value: `${Math.round(fix.headingDeg)}°`, measured: true });
  }

  if (items.length === 0) return null;

  return (
    <div className="shrink-0 px-4 pt-3 pb-4 mt-3 border-t" style={{ borderColor: UI_COLORS.hairline }}>
      <dl className="flex flex-wrap gap-x-7 gap-y-2">
        {items.slice(0, 4).map((item) => (
          <div key={item.label}>
            <dt className="text-[10px] uppercase tracking-wider" style={{ color: UI_COLORS.muted }}>
              {item.label}
            </dt>
            <dd
              className="text-sm tabular-nums"
              style={{ color: item.measured ? UI_COLORS.ink : UI_COLORS.muted }}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2.5 text-[11px]" style={{ color: UI_COLORS.muted }}>
        {items.some((i) => i.measured)
          ? 'In black: measured from the aircraft. In grey: from your schedule.'
          : 'From your schedule — a direct route at a constant speed.'}
      </p>
    </div>
  );
}
