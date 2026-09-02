/**
 * The interface's entire colour vocabulary, by role rather than by hue.
 *
 * Paper-light and warm, with one saturated colour in it. In a money app the
 * only thing worth a colour is the direction money moved, so `income` is it:
 * everything that isn't a credit is ink, grey or hairline. Spending gets no
 * colour at all, which is deliberate — nearly every row is spending, and a red
 * ledger reads as an alarm going off eighty times a page.
 *
 * `deficit` is the one exception, and it appears in exactly two places: a net
 * worth below zero and a month that spent more than it earned.
 */
export const UI_COLORS = {
  /** The page. Warm rather than white, so cards lift off it. */
  page: '#F6F5F2',
  /** Cards and panels. */
  surface: '#FFFFFF',
  /** Primary text. Near-black; true black vibrates on a warm ground. */
  ink: '#1A1B1D',
  /** Labels, dates, captions — anything explaining rather than saying. */
  muted: '#71757B',
  /** Rules, borders, and the empty part of any bar. One line weight, page-wide. */
  hairline: '#E5E3DE',
  /** Money in. The only saturated colour here; nothing else may borrow it. */
  income: '#2F7D62',
  /** Money owed more than held. Muted on purpose: findable, not shouting. */
  deficit: '#9A4B44',
} as const;

/**
 * The bars in the spending breakdown, darkest first.
 *
 * A ramp of one ink rather than a wheel of hues, because the categories are
 * already sorted by size — the bar's length says which is biggest, and giving
 * each one its own colour would only add a second, redundant code to learn.
 */
export const BAR_RAMP = ['#1A1B1D', '#3A3D42', '#5A5E65', '#787D85', '#969BA3', '#B4B8BE', '#CBCED3'];
