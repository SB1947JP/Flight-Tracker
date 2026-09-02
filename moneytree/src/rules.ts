/**
 * Turning a bank's description string into a category.
 *
 * Two steps, and the first one is the one that matters.
 *
 * **Normalise.** Japanese statements arrive in half-width katakana
 * (`ｾﾌﾞﾝ-ｲﾚﾌﾞﾝ`), card statements in full-width romaji (`ＡＭＡＺＯＮ`), and
 * both pad with spaces to a fixed width. `NFKC` folds all of that into one
 * spelling — half-width kana compose into full-width with their dakuten
 * attached, full-width ASCII collapses to plain ASCII — and lower-casing
 * finishes the job. Without this step a keyword table needs four spellings of
 * every merchant and still misses.
 *
 * **Match.** First hit wins, learned rules before built-in ones, so correcting
 * a category once beats the shipped table from then on.
 */

import { MERCHANT_RULES } from './categories';

/** One spelling per merchant, so the keyword table only needs one entry. */
export function normalise(description: string): string {
  return description.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

/** A category the user taught, by correcting a row in the ledger. */
export interface LearnedRule {
  /** Already normalised. */
  match: string;
  category: string;
}

/**
 * The category for a description, or `other` when nothing matches.
 *
 * Falling back to a visible "Other" rather than guessing from the amount is
 * deliberate: an uncategorised row you can see is a prompt to teach a rule, and
 * a wrong row that looks right is a number you will trust and shouldn't.
 */
export function categorise(description: string, learned: LearnedRule[] = []): string {
  const text = normalise(description);
  for (const rule of learned) {
    if (rule.match && text.includes(rule.match)) return rule.category;
  }
  for (const rule of MERCHANT_RULES) {
    if (text.includes(normalise(rule.match))) return rule.category;
  }
  return 'other';
}

/**
 * The keyword to learn from a corrected description.
 *
 * A whole normalised description is useless as a rule: `ｾﾌﾞﾝ-ｲﾚﾌﾞﾝ ｶｽｶﾞｲ
 * ﾆｼ 12/04` never repeats character for character, because the branch and the
 * date are in it. So take the leading run of letters — the merchant's name,
 * which is what does repeat — and stop at the first digit or separator.
 *
 * Short fragments are rejected (`null`), because a two-character rule matches
 * half the statement and quietly mis-files it.
 */
export function ruleKeyFor(description: string): string | null {
  const text = normalise(description);
  const head = text.match(/^[^\d/\-–—,.()（）]+/)?.[0] ?? text;
  const key = head.trim().slice(0, 12);
  return key.length >= 3 ? key : null;
}

/** Adds or replaces a learned rule, newest first so a re-correction wins. */
export function learnRule(learned: LearnedRule[], match: string, category: string): LearnedRule[] {
  return [{ match, category }, ...learned.filter((r) => r.match !== match)];
}
