import { useEffect, useMemo, useState } from 'react';
import { UI_COLORS } from './palette';
import { Flight, STATUS_LABEL, hasSchedule, loadFlights, resolveProgress, saveFlights } from './flights';
import { useLive } from './useLive';
import { FlightDetail } from './FlightDetail';
import { FlightForm } from './FlightForm';
import { formatDate } from './time';

/**
 * Which flight was last being looked at.
 *
 * Kept across reloads because the fallback below — "show whatever is in the
 * air" — is a good guess only when there is nothing better. Without this, a
 * reload silently jumped away from the flight you had selected to a different
 * one that happened to be airborne. With two entries for the same flight number
 * (easily made by correcting a mistyped date by adding a second one rather than
 * editing the first) the two are indistinguishable in the header, and it reads
 * as the app claiming your unflown flight is halfway to its destination.
 */
const SELECTED_KEY = 'flight-tracker/selected/v1';

/**
 * A simple flight tracker.
 *
 * A flight number alone is enough: the aircraft broadcasts its own position,
 * and `useLive` listens for it. The schedule — two airports and two times — is
 * an optional addition that buys the things a broadcast cannot give you: the
 * route drawn, distance flown, time remaining, and a position to fall back on
 * across the long stretches where nobody on the ground can hear the aircraft.
 *
 * Everything except that one lookup is local. Flights live in this browser and
 * are never uploaded; the map is bundled geometry rather than fetched tiles, so
 * the schedule half of the app keeps working with no connection at all.
 */

/** Wall-clock tick driving every derived value on the page. */
function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function App() {
  const now = useNow();
  const [flights, setFlights] = useState<Flight[]>(() => loadFlights());
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SELECTED_KEY);
    } catch {
      return null;
    }
  });
  const [editing, setEditing] = useState<{ mode: 'new' } | { mode: 'edit'; flight: Flight } | null>(null);

  useEffect(() => {
    saveFlights(flights);
  }, [flights]);

  useEffect(() => {
    try {
      if (selectedId) localStorage.setItem(SELECTED_KEY, selectedId);
      else localStorage.removeItem(SELECTED_KEY);
    } catch {
      // Losing the selection on reload is a small inconvenience, not a failure.
    }
  }, [selectedId]);

  // Sorted by departure so the list reads as an itinerary rather than as the
  // order things happened to be entered in. Flights being followed by number
  // alone have no departure to sort by and belong at the top: they are about
  // right now, not about a day in the diary.
  const ordered = useMemo(
    () =>
      [...flights].sort((a, b) => {
        if (a.departUtc === undefined || b.departUtc === undefined) {
          return (a.departUtc === undefined ? 0 : 1) - (b.departUtc === undefined ? 0 : 1);
        }
        return a.departUtc - b.departUtc;
      }),
    [flights],
  );

  // Default selection: whatever is in the air, else the next one to depart,
  // else the most recent. Opening the page mid-trip should land on the flight
  // you are actually on.
  const selected =
    ordered.find((f) => f.id === selectedId) ??
    ordered.find((f) => hasSchedule(f) && now >= f.departUtc && now < f.arriveUtc) ??
    ordered.find((f) => hasSchedule(f) && f.departUtc > now) ??
    ordered[ordered.length - 1];

  const selectedProgress = selected ? resolveProgress(selected, now) : null;
  // With no schedule there is no departure to wait for, so the search runs
  // whenever such a flight is on screen — that is the entire point of adding
  // one by number alone.
  const live = useLive(
    selected,
    selected !== undefined && (!hasSchedule(selected) || selectedProgress?.status === 'enroute'),
  );

  const save = (flight: Flight) => {
    setFlights((current) => {
      const index = current.findIndex((f) => f.id === flight.id);
      if (index === -1) return [...current, flight];
      const next = [...current];
      next[index] = flight;
      return next;
    });
    setSelectedId(flight.id);
    setEditing(null);
  };

  const remove = (id: string) => {
    setFlights((current) => current.filter((f) => f.id !== id));
    setSelectedId(null);
  };

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: UI_COLORS.page, color: UI_COLORS.ink }}>
      <header
        className="shrink-0 flex items-center justify-between gap-4 px-4 h-12 border-b"
        style={{ borderColor: UI_COLORS.hairline }}
      >
        <h1 className="text-[11px] uppercase tracking-[0.18em]" style={{ color: UI_COLORS.muted }}>
          Flight Tracker
        </h1>
        <button
          type="button"
          onClick={() => setEditing({ mode: 'new' })}
          className="text-sm px-2.5 py-1 -mr-1 rounded hover:bg-black/5 active:bg-black/10"
        >
          + Add
        </button>
      </header>

      {/* The list of flights is a row of names, not a column of cards, and it
          disappears entirely when there is only one flight — which is the usual
          case. A list of one is pure furniture. */}
      {!editing && ordered.length > 1 && (
        <nav
          className="shrink-0 flex gap-1 px-3 py-2 overflow-x-auto border-b"
          style={{ borderColor: UI_COLORS.hairline }}
        >
          {ordered.map((flight) => {
            const progress = resolveProgress(flight, now);
            const isSelected = selected?.id === flight.id;
            const isLive = progress ? progress.status === 'enroute' : true;
            return (
              <button
                key={flight.id}
                type="button"
                onClick={() => {
                  setSelectedId(flight.id);
                  setEditing(null);
                }}
                aria-current={isSelected ? 'true' : undefined}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm whitespace-nowrap"
                style={
                  isSelected
                    ? { backgroundColor: UI_COLORS.ink, color: UI_COLORS.surface }
                    : { color: UI_COLORS.muted }
                }
              >
                {/* A filled dot for in the air, hollow for not — state without a
                    second colour or a second word. */}
                <span
                  aria-hidden="true"
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={
                    isLive
                      ? { backgroundColor: isSelected ? UI_COLORS.surface : UI_COLORS.ink }
                      : { border: `1px solid ${isSelected ? UI_COLORS.surface : UI_COLORS.hairline}` }
                  }
                />
                {flight.number}
                {progress && hasSchedule(flight) && (
                  <span className="text-[11px] opacity-60">{formatDate(flight.departUtc, progress.origin.tz)}</span>
                )}
                {!progress && !hasSchedule(flight) && (
                  <span className="text-[11px] opacity-60">{STATUS_LABEL.enroute}</span>
                )}
              </button>
            );
          })}
        </nav>
      )}

      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch]">
        {editing ? (
          <div className="max-w-lg mx-auto px-4 py-5">
            <h2 className="text-[11px] uppercase tracking-[0.18em] mb-5" style={{ color: UI_COLORS.muted }}>
              {editing.mode === 'new' ? 'New flight' : `Edit ${editing.flight.number}`}
            </h2>
            <FlightForm
              existing={editing.mode === 'edit' ? editing.flight : undefined}
              others={ordered.filter((f) => f.id !== (editing.mode === 'edit' ? editing.flight.id : null))}
              onSave={save}
              onCancel={() => setEditing(null)}
            />
          </div>
        ) : selected ? (
          <FlightDetail
            flight={selected}
            now={now}
            live={live}
            onEdit={() => setEditing({ mode: 'edit', flight: selected })}
            onDelete={() => remove(selected.id)}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-center px-6">
            <div className="max-w-xs">
              <p className="text-lg">No flights yet</p>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: UI_COLORS.muted }}>
                A flight number on its own is enough to follow an aircraft live. Add the airports and times too and you
                also get its route and how long is left.
              </p>
              <button
                type="button"
                onClick={() => setEditing({ mode: 'new' })}
                className="mt-5 px-4 py-2 rounded-full text-sm"
                style={{ backgroundColor: UI_COLORS.ink, color: UI_COLORS.surface }}
              >
                Add a flight
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
