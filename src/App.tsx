import { useEffect, useMemo, useState } from 'react';
import { ACCENT_BORDER, ACCENT_WASH, UI_COLORS } from './palette';
import { Flight, STATUS_LABEL, loadFlights, resolveProgress, saveFlights } from './flights';
import { useLive } from './useLive';
import { FlightDetail } from './FlightDetail';
import { FlightForm } from './FlightForm';
import { formatDate, formatDuration } from './time';

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
 * Everything is typed in by hand and stored locally — there is no flight-status
 * API behind it. That is a deliberate consequence of where this lives: the
 * editor it ships alongside holds people's private photographs and enforces
 * `connect-src 'self'` so their data has nowhere to be exfiltrated to, and this
 * page keeps the same policy rather than punching the first hole in it. What
 * you get for that is a tracker that works on a plane, offline, forever.
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
  // order things happened to be entered in.
  const ordered = useMemo(() => [...flights].sort((a, b) => a.departUtc - b.departUtc), [flights]);

  // Default selection: whatever is in the air, else the next one to depart,
  // else the most recent. Opening the page mid-trip should land on the flight
  // you are actually on.
  const selected =
    ordered.find((f) => f.id === selectedId) ??
    ordered.find((f) => now >= f.departUtc && now < f.arriveUtc) ??
    ordered.find((f) => f.departUtc > now) ??
    ordered[ordered.length - 1];

  // Live tracking follows whatever is on screen, and only while it's flying —
  // see `useLive` for why the polling is kept as narrow as it is.
  const selectedProgress = selected ? resolveProgress(selected, now) : null;
  const live = useLive(selected, selectedProgress?.status === 'enroute');

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
    <div className="h-full flex flex-col bg-neutral-950 text-neutral-100">
      <header className="shrink-0 flex items-baseline justify-between gap-4 px-4 py-3 border-b border-neutral-800">
        <h1 className="text-sm uppercase tracking-widest" style={{ color: UI_COLORS.heading }}>
          Flight tracker
        </h1>
        {/* The per-flight bar says which of the two any given number is; this
            just sets the expectation that both exist. */}
        <p className="text-xs text-neutral-600">Live where there's coverage · schedule elsewhere</p>
      </header>

      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <aside className="md:w-72 shrink-0 border-b md:border-b-0 md:border-r border-neutral-800 flex flex-col min-h-0">
          <div className="p-3">
            <button
              type="button"
              onClick={() => setEditing({ mode: 'new' })}
              className="w-full px-3 py-1.5 rounded text-sm border"
              style={{ borderColor: ACCENT_BORDER, backgroundColor: ACCENT_WASH, color: UI_COLORS.accent }}
            >
              Add a flight
            </button>
          </div>

          {/* Capped on narrow screens: stacked vertically, an uncapped list
              would push the flight you came to look at below the fold. */}
          <ul className="flex-1 min-h-0 overflow-auto px-2 pb-3 space-y-1 max-h-48 md:max-h-none">
            {ordered.map((flight) => {
              const progress = resolveProgress(flight, now);
              const isSelected = selected?.id === flight.id;
              return (
                <li key={flight.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(flight.id);
                      setEditing(null);
                    }}
                    className="w-full text-left px-2.5 py-2 rounded border transition-colors"
                    style={
                      isSelected
                        ? { borderColor: ACCENT_BORDER, backgroundColor: ACCENT_WASH }
                        : { borderColor: 'transparent' }
                    }
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm text-neutral-100">{flight.number}</span>
                      <span className="text-[10px] uppercase tracking-wide" style={{ color: UI_COLORS.heading }}>
                        {progress ? STATUS_LABEL[progress.status] : 'Unknown'}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-400 tracking-wide">
                      {flight.from} → {flight.to}
                    </div>
                    {/* The date is what separates two entries for the same
                        flight number on different days — without it they are
                        the same three lines twice. */}
                    {progress && (
                      <div className="text-[10px] text-neutral-500">
                        {formatDate(flight.departUtc, progress.origin.tz)}
                      </div>
                    )}
                    {progress && (
                      <div className="mt-1.5 h-0.5 rounded-full" style={{ backgroundColor: UI_COLORS.muted }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${progress.fraction * 100}%`, backgroundColor: UI_COLORS.accent }}
                        />
                      </div>
                    )}
                    {progress?.status === 'enroute' && (
                      <div className="mt-1 text-[10px] text-neutral-500 tabular-nums">
                        {formatDuration(progress.remainingMs)} left
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <main className="flex-1 min-h-0 overflow-auto p-4">
          {editing ? (
            <div className="max-w-lg">
              <h2 className="text-sm uppercase tracking-widest mb-4" style={{ color: UI_COLORS.heading }}>
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
            <div className="h-full flex items-center justify-center text-center">
              <div className="max-w-sm">
                <p className="text-neutral-300">No flights yet.</p>
                <p className="mt-2 text-sm text-neutral-500 leading-relaxed">
                  Add one with its number, the two airports and the times from your ticket, and this will show you where
                  it is and how long is left.
                </p>
                <button
                  type="button"
                  onClick={() => setEditing({ mode: 'new' })}
                  className="mt-4 px-3 py-1.5 rounded text-sm border"
                  style={{ borderColor: ACCENT_BORDER, backgroundColor: ACCENT_WASH, color: UI_COLORS.accent }}
                >
                  Add a flight
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
