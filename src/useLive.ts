import { useCallback, useEffect, useRef, useState } from 'react';
import { toCallsign } from './airlines';
import { Flight } from './flights';
import { fetchLivePosition, LivePosition, LiveResult } from './live';

/**
 * Polls for a flight's live position while it is in the air.
 *
 * Three deliberate restraints, all of them about not being rude to a service
 * run by volunteers and given away for nothing:
 *
 *  - only while the flight is actually airborne — a flight that lands tomorrow
 *    has nothing to report today;
 *  - only while the tab is visible, so a forgotten background tab doesn't poll
 *    all night;
 *  - every 20 seconds, which is far finer than an aeroplane's position
 *    meaningfully changes at map scale.
 *
 * The last good fix is kept after the signal drops. Coverage gaps are normal
 * rather than exceptional — see `live.ts` — and "last seen eleven minutes ago,
 * here" is far more use than a marker that vanishes.
 */

const POLL_MS = 20_000;
/** Past this age a fix is stale enough that the label should stop saying "live". */
export const FIX_FRESH_MS = 120_000;

export interface LiveState {
  /** The radio callsign being searched for, or null if it couldn't be worked out. */
  callsign: string | null;
  /** The most recent successful fix, kept even once the signal drops. */
  lastFix: LivePosition | null;
  /** Outcome of the most recent attempt. */
  result: LiveResult | null;
  /** True while a request is in flight. */
  loading: boolean;
  /** Ask for an update immediately. */
  refresh: () => void;
}

export function useLive(flight: Flight | undefined, isAirborne: boolean): LiveState {
  const callsign = flight ? toCallsign(flight.number) : null;
  const [lastFix, setLastFix] = useState<LivePosition | null>(null);
  const [result, setResult] = useState<LiveResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // A different flight is a different aircraft: drop the previous one's fix
  // rather than briefly drawing it against the new route.
  useEffect(() => {
    setLastFix(null);
    setResult(null);
  }, [flight?.id]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!callsign || !isAirborne) return;

    let cancelled = false;

    const poll = async () => {
      // Don't stack requests if one is still outstanding on a slow connection.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      const outcome = await fetchLivePosition(callsign, controller.signal);
      if (cancelled) return;
      setLoading(false);

      // An abort is this component replacing its own request, not a failure
      // worth showing anyone.
      if (outcome.state === 'error' && outcome.message === 'cancelled') return;

      setResult(outcome);
      if (outcome.state === 'found') setLastFix(outcome.position);
    };

    poll();
    const id = window.setInterval(() => {
      if (!document.hidden) poll();
    }, POLL_MS);

    // A tab that comes back to the front should show current information
    // immediately rather than up to twenty seconds of staleness.
    const onVisible = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      abortRef.current?.abort();
    };
  }, [callsign, isAirborne, tick]);

  return { callsign, lastFix, result, loading, refresh };
}
