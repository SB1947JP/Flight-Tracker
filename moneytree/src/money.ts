/**
 * Yen, and the date arithmetic the month views run on.
 *
 * Every amount in this app is an **integer number of yen**. Not a float, not
 * "minor units": the yen has no subdivision in circulation, so the smallest
 * unit and the display unit are the same thing, and a whole class of rounding
 * bug simply doesn't exist. Anything arriving from a CSV is rounded once, here,
 * and is an integer everywhere after that.
 *
 * Sign convention, used without exception: **negative is money leaving**. A
 * ¥780 lunch is `-780`. Salary is positive. This means a month's net figure is
 * the plain sum of its transactions, and no view has to know which of its rows
 * are expenses.
 */

/** `¥1,234,567`. No decimals — the currency has none. */
export function formatYen(amount: number): string {
  const sign = amount < 0 ? '−' : '';
  return `${sign}¥${Math.abs(Math.round(amount)).toLocaleString('en-US')}`;
}

/** `¥1,234,567` with an explicit `+` on credits, for the ledger. */
export function formatSignedYen(amount: number): string {
  if (amount > 0) return `+${formatYen(amount)}`;
  return formatYen(amount);
}

/**
 * `123万` — the unit Japanese banks and estate agents actually quote in.
 *
 * Used for axis labels and the net worth headline only, where the last four
 * digits are noise. Below ¥10,000 there is no man to speak of, so it falls back
 * to the exact figure.
 */
export function formatMan(amount: number): string {
  const abs = Math.abs(amount);
  if (abs < 10000) return formatYen(amount);
  const man = amount / 10000;
  const digits = Math.abs(man) < 100 ? 1 : 0;
  const sign = man < 0 ? '−' : '';
  return `${sign}¥${Math.abs(man).toFixed(digits)}万`;
}

/** A month key, `2026-04`. Sorts lexically, which is why it is a string. */
export type MonthKey = string;

/** Today, as `YYYY-MM-DD` in *local* time — `toISOString` would use UTC and
 *  hand a Japanese user yesterday's date every morning before nine. */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthOf(isoDate: string): MonthKey {
  return isoDate.slice(0, 7);
}

export function currentMonth(): MonthKey {
  return monthOf(today());
}

/** Steps a month key by `delta` months, rolling the year over correctly. */
export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

/** The `count` months ending at `month`, oldest first. */
export function monthsBack(month: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(month, i - (count - 1)));
}

/** `April 2026`. */
export function formatMonth(month: MonthKey): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** `4月`, for the trend axis where twelve labels have to fit. */
export function formatMonthShort(month: MonthKey): string {
  return `${Number(month.slice(5, 7))}月`;
}

/** `Mon 6 Apr`. Weekday included because spending has a weekly shape. */
export function formatDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAY_NAMES[date.getDay()]} ${d} ${MONTH_NAMES[m - 1].slice(0, 3)}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
