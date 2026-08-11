/**
 * The interface's entire colour vocabulary, by role rather than by hue.
 *
 * The scheme is light and warm, and that is a decision about hierarchy rather
 * than taste: the map is the content, and on a dark interface the map was also
 * the brightest thing on screen, so chrome and content competed. On paper-white
 * the map is the *darkest* thing on the page and the eye goes there first
 * without being told to.
 *
 * There is exactly one saturated colour, `aircraft`. Everything else is ink,
 * grey and hairline. Status is signalled by weight and position — a filled dot,
 * a heavier type — rather than by handing every state its own hue, which is how
 * a small interface ends up looking like a dashboard.
 */
export const UI_COLORS = {
  /** The page itself. Warm rather than pure white, which reads as paper next to
   *  the map's greens and greys instead of as a lightbox. */
  page: '#F6F5F2',
  /** Panels and cards lifted off the page. */
  surface: '#FFFFFF',
  /** Primary text. Not pure black: at small sizes it vibrates against a warm
   *  ground, and a near-black sits down onto the page instead. */
  ink: '#1A1B1D',
  /** Secondary text — labels, captions, anything explaining rather than saying. */
  muted: '#71757B',
  /** Rules, borders and the empty part of a progress track. One value for all
   *  three, so the page has a single weight of line in it. */
  hairline: '#E5E3DE',

  /**
   * The aircraft, and the only colour in the interface.
   *
   * Every flight tracker draws its aircraft in this yellow, so it is what
   * people already read as "the aeroplane". Deepened slightly from the dark
   * scheme's version to hold its own against pale land and sea. Nothing else
   * should borrow it — the moment a button is yellow, the aeroplane stops being
   * the thing your eye finds.
   */
  aircraft: '#E0B02A',

  /** Destructive actions. Muted deliberately: Remove should be findable, not
   *  loud, and it is the only place a second hue appears at all. */
  danger: '#9A4B44',
} as const;

/** The route already flown, and the progress bar's filled part. Ink, so the
 *  line reads as drawn on the map rather than lit up over it. */
export const ROUTE_FLOWN = UI_COLORS.ink;
/** The route still to fly. */
export const ROUTE_REMAINING = '#A9ADB3';
/** Land on the offline fallback basemap, when tiles can't be fetched. */
export const FALLBACK_LAND = '#E3E2DC';
export const FALLBACK_COAST = '#C9C7BF';
