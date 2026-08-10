/**
 * The interface's entire colour vocabulary, by role rather than by hue.
 *
 * Carried over from the RAW editor this started life inside, and kept for the
 * same reason it was narrowed there: `accent` is a *brightness*, not a hue, so
 * "active" and "selected" are signalled by contrast and weight instead of by
 * colour. On a page whose main content is a map, that leaves the route and the
 * aircraft as the only things with colour of their own to say.
 */
export const UI_COLORS = {
  /** Active, selected or otherwise live controls (neutral-200). */
  accent: '#e4e4e7',
  /** The aircraft marker — red as cartographic convention, not as a warning. */
  danger: '#A15C56',
  /** Section titles and other structural labels (neutral-400). */
  heading: '#a1a1aa',
  /** Inactive borders and tracks (neutral-600). */
  muted: '#52525b',
  /** Land on the basemap: lifted just off the page background, so coastlines
   *  read as shape without competing with the route drawn over them. */
  land: '#26262a',
  /** Coastline stroke. */
  coast: '#3f3f46',
} as const;

/** Outline of an active control — the accent at ~40%, which separates from the
 *  inactive `muted` border without ringing. */
export const ACCENT_BORDER = 'rgba(228,228,231,0.4)';

/** The wash behind an active control. A tint of the accent, not a colour. */
export const ACCENT_WASH = 'rgba(228,228,231,0.07)';
