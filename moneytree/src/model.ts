/**
 * Accounts, transactions, and everything derived from them.
 *
 * The rule this file follows, and the reason it is small: **nothing derived is
 * ever stored.** An account holds an opening balance and nothing else; its
 * current balance is that plus its transactions, recomputed on every render.
 * There is therefore no cached total that can drift out of step with an edit,
 * an import, or a deletion — the commonest bug in a money app, and one this
 * shape cannot have.
 *
 * Amounts are integer yen throughout, negative for money leaving. See
 * `money.ts` for why.
 */

import { isIncomeCategory } from './categories';
import { MonthKey, monthOf } from './money';

/**
 * What kind of thing the account is.
 *
 * This exists for two reasons: it decides the sign of the balance (a credit
 * card holds what you owe, so it counts against net worth), and it groups the
 * list the way Moneytree does — the rows of a Japanese wallet are a bank, a
 * card, an IC card and a points balance, and mixing them into one flat list
 * makes the important number harder to find.
 */
export type AccountKind = 'bank' | 'card' | 'emoney' | 'investment' | 'cash' | 'point';

export const ACCOUNT_KINDS: Array<{ id: AccountKind; en: string; ja: string; liability?: boolean }> = [
  { id: 'bank', en: 'Bank', ja: '銀行' },
  { id: 'card', en: 'Credit Card', ja: 'クレジットカード', liability: true },
  { id: 'emoney', en: 'IC / E-money', ja: '電子マネー' },
  { id: 'investment', en: 'Investment', ja: '投資' },
  { id: 'cash', en: 'Cash', ja: '現金' },
  { id: 'point', en: 'Points', ja: 'ポイント' },
];

/** True where a positive balance means a debt rather than an asset. */
export function isLiability(kind: AccountKind): boolean {
  return ACCOUNT_KINDS.find((k) => k.id === kind)?.liability === true;
}

export interface Account {
  id: string;
  /** What you call it — "Mizuho Kasugai", not the institution's legal name. */
  name: string;
  kind: AccountKind;
  /**
   * The balance before the first transaction in this app.
   *
   * For a card this is what was already outstanding, entered positive; the
   * liability sign is applied by `accountBalance` rather than baked into the
   * stored number, so changing an account's kind can't silently invert it.
   */
  openingBalance: number;
  /** Points and IC cards are real balances but not really money. Excluded from
   *  net worth when false, so 3,000 Rakuten points don't inflate it. */
  countsToNetWorth: boolean;
}

export interface Transaction {
  id: string;
  accountId: string;
  /** `YYYY-MM-DD`, local. */
  date: string;
  /** As the bank wrote it. Kept verbatim — the rules normalise a copy. */
  description: string;
  /** Integer yen. Negative is money leaving. */
  amount: number;
  category: string;
  /**
   * Set when the user chose the category by hand.
   *
   * Re-importing a statement, or teaching a new rule, re-categorises rows that
   * were assigned automatically and must never overwrite one a human fixed.
   */
  locked?: boolean;
  note?: string;
}

/** Opening balance plus everything since, signed for liabilities. */
export function accountBalance(account: Account, transactions: Transaction[]): number {
  let total = account.openingBalance;
  for (const t of transactions) {
    if (t.accountId === account.id) total += t.amount;
  }
  return isLiability(account.kind) ? -Math.abs(total) : total;
}

/** Assets minus debts, over the accounts that opted in. */
export function netWorth(accounts: Account[], transactions: Transaction[]): number {
  return accounts
    .filter((a) => a.countsToNetWorth)
    .reduce((sum, a) => sum + accountBalance(a, transactions), 0);
}

export interface MonthSummary {
  month: MonthKey;
  /** Positive. */
  income: number;
  /** Positive — the magnitude spent, which is how it is read aloud. */
  spending: number;
  /** `income − spending`. Negative means the month cost more than it earned. */
  net: number;
  /** Spending by category, largest first. Amounts positive. */
  byCategory: Array<{ category: string; amount: number; share: number }>;
  count: number;
}

/**
 * Categories that move money without spending it.
 *
 * Excluded from every total, and this is the most important line in the file.
 * A card bill leaving the bank is not a second purchase — the purchases are
 * already on the card. Counting both is how a naive tracker tells you that you
 * spent twice what you did, and why the number it gives you gets ignored. Cash
 * withdrawn is the same: the spending happens when the cash is spent, and
 * `cash` here is only the walk to the ATM.
 */
export const NON_SPENDING = new Set(['transfer', 'cash']);

export function summariseMonth(transactions: Transaction[], month: MonthKey): MonthSummary {
  const rows = transactions.filter((t) => monthOf(t.date) === month);
  const totals = new Map<string, number>();
  let income = 0;
  let spending = 0;

  for (const t of rows) {
    if (NON_SPENDING.has(t.category)) continue;
    if (t.amount > 0 || isIncomeCategory(t.category)) {
      income += Math.abs(t.amount);
      continue;
    }
    const amount = Math.abs(t.amount);
    spending += amount;
    totals.set(t.category, (totals.get(t.category) ?? 0) + amount);
  }

  const byCategory = [...totals.entries()]
    .map(([category, amount]) => ({ category, amount, share: spending > 0 ? amount / spending : 0 }))
    .sort((a, b) => b.amount - a.amount);

  return { month, income, spending, net: income - spending, byCategory, count: rows.length };
}

/**
 * A stable-ish identity for a transaction, used to skip rows an earlier import
 * already brought in.
 *
 * Date, account, amount and description together: a bank re-exporting the same
 * fortnight produces the same four, and two genuinely separate ¥140 fares on
 * the same day produce the same four as well. That collision is the accepted
 * cost — a duplicated fare is a small, visible error you can delete, while a
 * statement imported twice is a wrong total you would never notice.
 */
export function fingerprint(t: Pick<Transaction, 'accountId' | 'date' | 'amount' | 'description'>): string {
  return `${t.accountId}|${t.date}|${t.amount}|${t.description.trim()}`;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
