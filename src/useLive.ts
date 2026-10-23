import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { callsignVariants, toCallsign } from './airlines';
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
/**
 * Cadence before anything has ever been found.
 *
 * Until there's a hit, each poll may try several callsign spellings, so it costs
 * several requests instead of one. An aircraft over an ocean can be unfindable
 * for hours, and hammering a free volunteer-run service through all of it would
 * be rude. Once a spelling works, that one is used and the normal rate resumes.
 */
const SEARCHING_POLL_MS = 60_000;
/** Past this age a fix is stale enough that the label should stop saying "live". */
export const FIX_FRESH_MS = 120_000;
/**
 * Backing off when nothing answers at all.
 *
 * Distinct from "nothing found", which is the normal condition over an ocean
 * and keeps the usual rate. This is for the service being unreachable: a tab
 * left open then asks every twenty seconds for as long as it lives, which is
 * thousands of requests a day aimed at a free service precisely when it is
 * least able to take them, and the surest way to turn a temporary block into a
 * lasting one. Each consecutive failure doubles the wait, to a five-minute
 * ceiling; one success puts it straight back to normal.
 */
const MAX_BACKOFF_MS = 300_000;

export interface LiveState {
  /** The radio callsign being searched for, or null if it couldn't be worked out. */
  callsign: string | null;
  /** The spelling that actually matched an aircraft, once one has. Worth showing
   *  rather than the one searched for: they differ whenever the airline pads its
   *  flight numbers, and the difference is the answer to "why couldn't it find
   *  my flight". */
  matchedCallsign: string | null;
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
  const variants = useMemo(() => (flight ? callsignVariants(flight.number) : []), [flight?.number]);
  // The spelling that last worked. Trying the others again on every poll would
  // triple the traffic for no benefit.
  const workingRef = useRef<string | null>(null);
  const [lastFix, setLastFix] = useState<LivePosition | null>(null);
  const [result, setResult] = useState<LiveResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [matchedCallsign, setMatchedCallsign] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // A different flight is a different aircraft: drop the previous one's fix
  // rather than briefly drawing it against the new route.
  useEffect(() => {
    setLastFix(null);
    setResult(null);
    setMatchedCallsign(null);
    workingRef.current = null;
  }, [flight?.id]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!callsign || !isAirborne) return;

    let cancelled = false;
    let failures = 0;

    const poll = async () => {
      // Don't stack requests if one is still outstanding on a slow connection.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);

      try {
        // Once a spelling has worked, ask only for that one.
        const toTry = workingRef.current ? [workingRef.current] : variants;
        let matched = toTry[0];
        let outcome = await fetchLivePosition(toTry[0], controller.signal);
        for (let i = 1; i < toTry.length && outcome.state === 'not-found'; i++) {
          matched = toTry[i];
          outcome = await fetchLivePosition(toTry[i], controller.signal);
        }
        if (outcome.state === 'found') {
          workingRef.current = matched;
          setMatchedCallsign(matched);
        }

        if (cancelled) return;

        // An abort is this component replacing its own request, not a failure
        // worth showing anyone.
        if (outcome.state === 'error' && outcome.message === 'cancelled') return;

        // "Nothing found" is a perfectly good answer from a service that is
        // working, so only an actual failure to reach one counts here.
        failures = outcome.state === 'error' ? failures + 1 : 0;

        setResult(outcome);
        if (outcome.state === 'found') setLastFix(outcome.position);
      } catch (error) {
        // Nothing below is expected to throw — fetchLivePosition turns every
        // anticipated failure into a LiveResult. But an unexpected one escaping
        // here used to leave `loading` stuck true forever, so the label read
        // "Checking…" for the rest of the session with no way back but a
        // reload. Whatever it is, say so and carry on polling.
        if (cancelled) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        failures += 1;
        setResult({ state: 'error', message: 'Something went wrong looking this flight up.' });
        console.error('Live lookup failed unexpectedly:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // A self-rescheduling timer rather than setInterval, because the interval
    // itself has to change. Until an aircraft is found each poll tries several
    // callsign spellings, so it runs at the slower rate; once one matches, a
    // poll costs a single request and the fast rate applies. setInterval fixed
    // the rate at the moment tracking started — which is always *before* the
    // first match — so the fast rate was unreachable and every flight updated
    // three times slower than intended.
    let timer = 0;
    const scheduleNext = () => {
      if (cancelled) return;
      const base = workingRef.current ? POLL_MS : SEARCHING_POLL_MS;
      const wait = failures === 0 ? base : Math.min(MAX_BACKOFF_MS, base * 2 ** failures);
      timer = window.setTimeout(cycle, wait);
    };
    const cycle = async () => {
      // A hidden tab keeps its place in the queue without spending a request.
      if (!document.hidden) await poll();
      scheduleNext();
    };

    void poll().then(scheduleNext);

    // A tab that comes back to the front should show current information
    // immediately rather than up to twenty seconds of staleness.
    const onVisible = () => {
      if (document.hidden) return;
      window.clearTimeout(timer);
      void poll().then(scheduleNext);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      abortRef.current?.abort();
    };
  }, [callsign, isAirborne, tick, variants]);

  return { callsign, matchedCallsign, lastFix, result, loading, refresh };
}
