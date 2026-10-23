import { UI_COLORS } from './palette';
import { Airfield, CENTRAIR, KOMAKI, MOVEMENT_LABEL, Movement } from './airfield';
import { TrafficRow, useAirfield } from './useAirfield';

/**
 * Everything flying around one airfield, right now.
 *
 * What this is **not** is a departure board. There is no free source of
 * scheduled flights, so nothing here knows that JH1234 is due out at 09:15 —
 * every row is an aeroplane that is in the air (or on the tarmac) at this
 * moment and broadcasting its position. A flight that hasn't pushed back yet
 * isn't here, and one that landed an hour ago is long gone. The heading says
 * "in the air now" rather than "departures" for exactly that reason.
 *
 * Komaki is a quiet field, so an empty list in the small hours is the correct
 * answer rather than a failure, and the empty state says so plainly instead of
 * looking like something broke.
 */

/**
 * How far out to look, in nautical miles.
 *
 * 40 nm (75 km) catches an airliner on final approach and the first few minutes
 * of a climb out, which is the span over which "arriving" and "departing" mean
 * anything. Wider mostly adds cruise traffic crossing the area, which is
 * already the least interesting part of the list.
 */
const RADIUS_NM = 40;

/** The other field in the circle; see airfield.ts for why this matters here. */
const RIVALS: Airfield[] = [CENTRAIR];

export function AirfieldView() {
  const { traffic, result, loading, updatedAt, refresh } = useAirfield(KOMAKI, RADIUS_NM, RIVALS, true);

  const working = traffic.filter((row) => row.movement !== 'passing');
  const passing = traffic.filter((row) => row.movement === 'passing');

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-4">
      <header className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl leading-none">{KOMAKI.iata}</h2>
          <p className="mt-1.5 text-sm" style={{ color: UI_COLORS.muted }}>
            {KOMAKI.name} · in the air now
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="shrink-0 text-sm px-2 py-1 -mr-1 rounded hover:bg-black/5 disabled:opacity-50"
          style={{ color: UI_COLORS.muted }}
        >
          {loading ? 'Checking…' : 'Refresh'}
        </button>
      </header>

      <Status result={result} loading={loading} updatedAt={updatedAt} count={traffic.length} />

      {working.length > 0 && (
        <ul className="mt-4 space-y-px">
          {working.map((row) => (
            <Row key={rowKey(row)} row={row} />
          ))}
        </ul>
      )}

      {/* Overflying traffic is kept, but set apart and below: it is in the
          circle rather than at the airfield, and mixing the two would bury the
          handful of aircraft actually using Komaki under everything crossing
          central Japan at 38,000 feet. */}
      {passing.length > 0 && (
        <section className="mt-6">
          <h3 className="text-[11px] uppercase tracking-[0.18em] pb-1 border-b" style={{ color: UI_COLORS.muted, borderColor: UI_COLORS.hairline }}>
            Also in the area
          </h3>
          <ul className="mt-1 space-y-px">
            {passing.map((row) => (
              <Row key={rowKey(row)} row={row} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Callsign isn't unique and can be absent; position always distinguishes. */
function rowKey(row: TrafficRow): string {
  return `${row.callsign ?? 'unknown'}:${row.lat.toFixed(3)}:${row.lon.toFixed(3)}`;
}

function Status({
  result,
  loading,
  updatedAt,
  count,
}: {
  result: ReturnType<typeof useAirfield>['result'];
  loading: boolean;
  updatedAt: number | null;
  count: number;
}) {
  let text: string;
  if (result?.state === 'error') {
    text = result.message;
  } else if (count === 0 && updatedAt !== null) {
    text = `Nothing flying within ${RADIUS_NM} nautical miles. Komaki is a quiet field — outside its flying hours this is normal.`;
  } else if (updatedAt === null) {
    text = loading ? 'Looking…' : 'Waiting for the first reading…';
  } else {
    text = `${count} aircraft within ${RADIUS_NM} nautical miles.`;
  }

  return (
    <p className="mt-3 text-xs leading-snug" style={{ color: UI_COLORS.muted }}>
      {text}
    </p>
  );
}

function Row({ row }: { row: TrafficRow }) {
  const emphasis = row.movement === 'passing' ? UI_COLORS.muted : UI_COLORS.ink;

  // What's worth reading at a glance, in the order it's worth reading: how
  // high, how far out, how fast. An aircraft parked on the apron has none of
  // those — "0 km · 0 km/h" is three facts that say nothing — so its row is
  // just its label.
  const facts =
    row.movement === 'onGround'
      ? []
      : [
          row.heightFt !== undefined ? `${(Math.round(row.heightFt / 100) * 100).toLocaleString()} ft` : null,
          `${row.distanceKm.toFixed(0)} km`,
          row.groundSpeedKts ? `${Math.round(row.groundSpeedKts * 1.852)} km/h` : null,
        ].filter(Boolean);

  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5 border-b" style={{ borderColor: UI_COLORS.hairline }}>
      <span className="min-w-0 flex items-baseline gap-2">
        <span className="tabular-nums tracking-wide" style={{ color: emphasis }}>
          {row.callsign ?? row.registration ?? '—'}
        </span>
        {row.type && (
          <span className="text-[11px] shrink-0" style={{ color: UI_COLORS.muted }}>
            {row.type}
          </span>
        )}
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-xs" style={{ color: emphasis }}>
          {label(row)}
        </span>
        <span className="block text-[11px] tabular-nums" style={{ color: UI_COLORS.muted }}>
          {facts.join(' · ')}
        </span>
      </span>
    </li>
  );
}

/** "Passing over" is the honest label for cruise traffic, but when an aircraft
 *  is plainly working the *other* airport, saying which is far more use than
 *  leaving someone to wonder why it's in a Komaki list at all. */
function label(row: TrafficRow): string {
  if (row.movement === 'passing' && row.otherField) return `At ${row.otherField.iata}`;
  return MOVEMENT_LABEL[row.movement as Movement];
}
