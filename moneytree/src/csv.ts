/**
 * Reading the CSV your bank already gives you.
 *
 * This is the replacement for the one thing that genuinely can't be copied.
 * Moneytree logs into your accounts through licensed connections to each
 * institution; nothing outside that arrangement can. But every Japanese bank
 * and card company has a 明細ダウンロード button, and what it produces is a
 * statement — the same data, one manual step later.
 *
 * Three things make those files awkward, and all three are handled here:
 *
 * **They are Shift_JIS.** Not UTF-8, still, in 2026, because Excel on Windows
 * expects it. Decoded as UTF-8 a statement comes out as mojibake, so the bytes
 * are sniffed and decoded again if they don't survive the trip.
 *
 * **The columns have no standard.** MUFG writes お支払金額 and お預り金額 in
 * separate columns; Rakuten writes one signed 金額; a card statement writes
 * 利用日 / 利用店名 / 利用金額. So columns are matched by header keyword, in
 * both languages, and the file is accepted if a date, a description and some
 * kind of amount can be found.
 *
 * **The dates are written four ways.** `2026/4/6`, `2026-04-06`, `20260406`,
 * and `26/4/6` all appear. All four are read; anything else is skipped with a
 * count, rather than silently becoming today.
 */

import { newId, Transaction } from './model';
import { categorise, LearnedRule } from './rules';

/**
 * Decodes the file, guessing the encoding rather than asking.
 *
 * UTF-8 first, and if the result contains U+FFFD the decode failed, so it is
 * Shift_JIS (in practice, on a Japanese bank export, always). `TextDecoder`
 * ships the codec in every browser, so this costs nothing to support.
 */
export async function decodeCsv(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '');
  try {
    return new TextDecoder('shift_jis').decode(bytes);
  } catch {
    return utf8;
  }
}

/** RFC-4180-ish: quoted fields, doubled quotes inside them, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  row.push(field);
  rows.push(row);

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Header keywords, per column role. Matched as substrings, case-folded. */
const HEADERS = {
  date: ['日付', '取引日', '利用日', 'ご利用日', '年月日', 'date'],
  description: ['摘要', '内容', '利用店名', 'ご利用先', '取引内容', 'お取引内容', '店名', 'description', 'memo', 'payee'],
  out: ['お支払金額', 'お引出し', '引出', '支払金額', 'お支払い金額', 'withdrawal', 'debit'],
  in: ['お預り金額', 'お預入れ', '預入', '入金', 'deposit', 'credit'],
  amount: ['金額', '利用金額', 'amount'],
  balance: ['残高', 'balance'],
};

interface Columns {
  date: number;
  description: number;
  out: number;
  in: number;
  amount: number;
  headerRow: number;
}

function findColumns(rows: string[][]): Columns | null {
  // Banks put a title, an account number and a blank line above the header, so
  // the header is looked for in the first few rows rather than assumed first.
  for (let r = 0; r < Math.min(rows.length, 8); r++) {
    const cells = rows[r].map((c) => c.trim().toLowerCase());
    const find = (keys: string[]) => cells.findIndex((c) => c !== '' && keys.some((k) => c.includes(k.toLowerCase())));
    const date = find(HEADERS.date);
    const description = find(HEADERS.description);
    if (date < 0 || description < 0) continue;
    const out = find(HEADERS.out);
    const income = find(HEADERS.in);
    // 金額 is a substring of お支払金額, so the specific columns are found
    // first and a bare amount column only counts if it is neither of them.
    let amount = find(HEADERS.amount);
    if (amount === out || amount === income) amount = -1;
    if (out < 0 && income < 0 && amount < 0) continue;
    return { date, description, out, in: income, amount, headerRow: r };
  }
  return null;
}

/** `2026/4/6`, `2026-04-06`, `20260406`, `26/4/6` → `2026-04-06`. */
export function parseDate(raw: string): string | null {
  const text = raw.trim().normalize('NFKC').replace(/[年月]/g, '/').replace(/日/g, '');
  let m = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = text.match(/^(\d{2})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) return iso(2000 + +m[1], +m[2], +m[3]);
  return null;
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** `"¥1,234"`, `"1,234円"`, `"-1234"`, `"1234-"` → a number, or null if empty. */
function parseAmount(raw: string): number | null {
  const text = raw.trim().normalize('NFKC').replace(/[¥,円\s]/g, '');
  if (text === '' || text === '-') return null;
  const trailingMinus = /-$/.test(text);
  const n = Number(text.replace(/-$/, ''));
  if (!Number.isFinite(n)) return null;
  return Math.round(trailingMinus ? -n : n);
}

export interface ImportResult {
  transactions: Transaction[];
  /** Rows read but not understood — an unparseable date or no amount. */
  skipped: number;
  /** Rows understood but already present, by fingerprint. */
  duplicates: number;
  /** Why nothing could be read, when that is the outcome. */
  error?: string;
}

/**
 * CSV text → transactions, categorised, ready to merge.
 *
 * The sign convention is applied here and nowhere else: a withdrawal column is
 * always negative, a deposit column always positive, and a single signed
 * amount column is trusted as written — except that card statements write
 * their charges positive, which is why `expensesArePositive` exists. Get this
 * wrong and every total in the app inverts, so it is one decision in one place.
 */
export function importCsv(
  text: string,
  accountId: string,
  learned: LearnedRule[],
  existing: Set<string>,
  expensesArePositive = false,
): ImportResult {
  const rows = parseCsv(text);
  const cols = findColumns(rows);
  if (!cols) {
    return {
      transactions: [], skipped: 0, duplicates: 0,
      error: 'No date and description columns found. The file needs a header row — 日付 / 摘要, or Date / Description.',
    };
  }

  const transactions: Transaction[] = [];
  const seen = new Set(existing);
  let skipped = 0;
  let duplicates = 0;

  for (let r = cols.headerRow + 1; r < rows.length; r++) {
    const cells = rows[r];
    const date = parseDate(cells[cols.date] ?? '');
    if (!date) { skipped++; continue; }

    let amount: number | null = null;
    const out = cols.out >= 0 ? parseAmount(cells[cols.out] ?? '') : null;
    const income = cols.in >= 0 ? parseAmount(cells[cols.in] ?? '') : null;
    if (out !== null && out !== 0) amount = -Math.abs(out);
    else if (income !== null && income !== 0) amount = Math.abs(income);
    else if (cols.amount >= 0) {
      const single = parseAmount(cells[cols.amount] ?? '');
      if (single !== null && single !== 0) amount = expensesArePositive ? -Math.abs(single) : single;
    }
    if (amount === null) { skipped++; continue; }

    const description = (cells[cols.description] ?? '').trim().replace(/\s+/g, ' ');
    const key = `${accountId}|${date}|${amount}|${description}`;
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);

    transactions.push({
      id: newId(),
      accountId,
      date,
      description: description || '(no description)',
      amount,
      category: categorise(description, learned),
    });
  }

  return { transactions, skipped, duplicates };
}
