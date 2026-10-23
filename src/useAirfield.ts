import { useCallback, useEffect, useRef, useState } from 'react';
import { AreaAircraft, AreaResult, fetchAircraftNear } from './live';
import { Airfield, AirfieldTraffic, classify, trafficOrder } from './airfield';

/**
 * Polls the traffic around one airfield.
 *
 * Same restraints as following a single flight (`useLive`): one request per
 * poll, only while the tab is visible, 20 seconds apart. One difference worth
 * noting — this request is heavier on the service than a callsign lookup, since
 * it returns every aircraft in a circle rather than one, so it only runs while
 * this view is actually on screen.
 */

const POLL_MS = 20_000;
/**
 * Backing off when nothing is answering.
 *
 * A page left open against a service that is down, or blocking this address,
 * otherwise asks again every twenty seconds for as long as the tab lives —
 * thousands of requests a day at the exact moment the service is least able to
 * take them, and the surest way to turn a temporary block into a lasting one.
 * Each consecutive failure doubles the wait, up to five minutes; the first
 * success puts it straight back to normal.
 */
const MAX_BACKOFF_MS = 300_000;

function backoffFor(consecutiveFailures: number): number {
  if (consecutiveFailures === 0) return POLL_MS;
  return Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** consecutiveFailures);
}

export interface TrafficRow extends AreaAircraft, AirfieldTraffic {}

export interface AirfieldState {
  traffic: TrafficRow[];
  result: AreaResult | null;
  loading: boolean;
  /** When the list last changed, so the view can say how fresh it is. */
  updatedAt: number | null;
  refresh: () => void;
}

export function useAirfield(
  field: Airfield,
  radiusNm: number,
  rivals: Airfield[],
  active: boolean,
): AirfieldState {
  const [traffic, setTraffic] = useState<TrafficRow[]>([]);
  const [result, setResult] = useState<AreaResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer = 0;
    let failures = 0;

    const poll = async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const outcome = await fetchAircraftNear(field.lat, field.lon, radiusNm, controller.signal);
        if (cancelled) return;
        if (outcome.state === 'error' && outcome.message === 'cancelled') return;

        failures = outcome.state === 'error' ? failures + 1 : 0;

        setResult(outcome);
        if (outcome.state === 'found') {
          setTraffic(
            outcome.aircraft
              .map((aircraft) => ({ ...aircraft, ...classify(aircraft, field, rivals) }))
              .sort(trafficOrder),
          );
          setUpdatedAt(Date.now());
        } else if (outcome.state === 'empty') {
          setTraffic([]);
          setUpdatedAt(Date.now());
        }
        // An error leaves the previous list alone: a momentary failure should
        // not blank a list that was correct twenty seconds ago, any more than a
        // dropped signal should remove the aircraft being followed.
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        failures += 1;
        setResult({ state: 'error', message: 'Something went wrong reading the traffic here.' });
        console.error('Airfield lookup failed unexpectedly:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const scheduleNext = () => {
      if (cancelled) return;
      timer = window.setTimeout(cycle, backoffFor(failures));
    };
    const cycle = async () => {
      if (!document.hidden) await poll();
      scheduleNext();
    };

    void poll().then(scheduleNext);

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
    // `rivals` is a module-level constant array at every call site; listing it
    // would re-run this effect on each render for no change in what is asked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, radiusNm, active, tick]);

  return { traffic, result, loading, updatedAt, refresh };
}
