/**
 * The category set, and the merchant rules that assign it.
 *
 * This is the half of Moneytree that is actually worth copying. Aggregation is
 * the part everyone notices, but the part that makes the app usable is that a
 * line reading `ｾﾌﾞﾝ-ｲﾚﾌﾞﾝ ｶｽｶﾞｲ` becomes "Food" without anybody typing
 * anything. A Japanese bank statement is a wall of half-width katakana, and
 * unsorted it is unreadable by design.
 *
 * The categories are bilingual because Japanese statements are, and because a
 * household here is very often one of each.
 */

export interface Category {
  id: string;
  en: string;
  ja: string;
  /** Income categories are shown apart from spending and never enter the
   *  breakdown, so the distinction lives on the category rather than on a
   *  guess about the sign of each transaction. */
  income?: boolean;
}

export const CATEGORIES: Category[] = [
  { id: 'food', en: 'Food & Drink', ja: '食費' },
  { id: 'groceries', en: 'Groceries', ja: '日用品・食料品' },
  { id: 'transport', en: 'Transport', ja: '交通費' },
  { id: 'housing', en: 'Housing', ja: '住宅' },
  { id: 'utilities', en: 'Utilities', ja: '水道光熱費' },
  { id: 'comms', en: 'Phone & Internet', ja: '通信費' },
  { id: 'health', en: 'Health', ja: '医療費' },
  { id: 'education', en: 'Education', ja: '教育' },
  { id: 'entertainment', en: 'Entertainment', ja: '趣味・娯楽' },
  { id: 'shopping', en: 'Shopping', ja: '買い物' },
  { id: 'insurance', en: 'Insurance', ja: '保険' },
  { id: 'tax', en: 'Tax & Pension', ja: '税金・年金' },
  { id: 'business', en: 'Business', ja: '事業経費' },
  { id: 'cash', en: 'Cash Withdrawal', ja: '現金引き出し' },
  { id: 'transfer', en: 'Transfer', ja: '振替' },
  { id: 'fees', en: 'Bank Fees', ja: '手数料' },
  { id: 'other', en: 'Other', ja: 'その他' },
  { id: 'salary', en: 'Salary', ja: '給与', income: true },
  { id: 'tuition', en: 'Tuition Received', ja: '月謝', income: true },
  { id: 'income-other', en: 'Other Income', ja: 'その他収入', income: true },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function category(id: string): Category {
  return BY_ID.get(id) ?? { id, en: id, ja: id };
}

export function isIncomeCategory(id: string): boolean {
  return BY_ID.get(id)?.income === true;
}

/**
 * Merchant keyword → category.
 *
 * Matched against the description after normalisation (see `rules.ts`), so the
 * keywords are written in **full-width katakana and lower-case romaji** and
 * still catch the half-width, upper-case, space-padded spellings that banks
 * and card companies actually emit. Order matters: the first hit wins, so the
 * specific sits above the general.
 *
 * This is a starting set, not a complete one — no keyword table is ever
 * complete. Anything it misses lands in Other, where re-categorising it once
 * in the ledger teaches a rule that sticks (`learnRule`).
 */
export const MERCHANT_RULES: Array<{ match: string; category: string }> = [
  // Convenience stores and supermarkets.
  { match: 'セブン', category: 'groceries' },
  { match: 'ファミリーマート', category: 'groceries' },
  { match: 'ローソン', category: 'groceries' },
  { match: 'ミニストップ', category: 'groceries' },
  { match: 'イオン', category: 'groceries' },
  { match: 'アピタ', category: 'groceries' },
  { match: 'バロー', category: 'groceries' },
  { match: 'ヤオコー', category: 'groceries' },
  { match: 'ぎゅうとら', category: 'groceries' },
  { match: 'コストコ', category: 'groceries' },
  { match: 'ドラッグ', category: 'groceries' },
  { match: 'スギヤク', category: 'groceries' },
  { match: 'マツモトキヨシ', category: 'groceries' },
  { match: 'ダイソー', category: 'groceries' },
  { match: 'カインズ', category: 'groceries' },

  // Eating out.
  { match: 'スターバックス', category: 'food' },
  { match: 'starbucks', category: 'food' },
  { match: 'ドトール', category: 'food' },
  { match: 'コメダ', category: 'food' },
  { match: 'マクドナルド', category: 'food' },
  { match: 'すき家', category: 'food' },
  { match: '吉野家', category: 'food' },
  { match: 'ガスト', category: 'food' },
  { match: 'サイゼリヤ', category: 'food' },
  { match: 'ココイチ', category: 'food' },
  { match: 'ウーバー', category: 'food' },
  { match: 'uber eats', category: 'food' },
  { match: '出前館', category: 'food' },

  // Getting about.
  { match: 'ｊｒ', category: 'transport' },
  { match: 'jr', category: 'transport' },
  { match: '名鉄', category: 'transport' },
  { match: '地下鉄', category: 'transport' },
  { match: 'マナカ', category: 'transport' },
  { match: 'manaca', category: 'transport' },
  { match: 'スイカ', category: 'transport' },
  { match: 'suica', category: 'transport' },
  { match: 'パスモ', category: 'transport' },
  { match: 'ｅｔｃ', category: 'transport' },
  { match: 'エネオス', category: 'transport' },
  { match: 'eneos', category: 'transport' },
  { match: 'コスモ石油', category: 'transport' },
  { match: 'タイムズ', category: 'transport' },
  { match: 'タクシー', category: 'transport' },

  // The bills that arrive by direct debit, and are the whole reason a
  // Japanese household statement is unreadable without categories.
  { match: '中部電力', category: 'utilities' },
  { match: '東京電力', category: 'utilities' },
  { match: '関西電力', category: 'utilities' },
  { match: 'デンキ', category: 'utilities' },
  { match: '東邦ガス', category: 'utilities' },
  { match: 'ガス', category: 'utilities' },
  { match: '水道', category: 'utilities' },
  { match: 'スイドウ', category: 'utilities' },

  { match: 'ドコモ', category: 'comms' },
  { match: 'docomo', category: 'comms' },
  { match: 'ソフトバンク', category: 'comms' },
  { match: 'softbank', category: 'comms' },
  { match: '楽天モバイル', category: 'comms' },
  { match: 'ｎｔｔ', category: 'comms' },
  { match: 'ntt', category: 'comms' },
  { match: 'ｊｃｏｍ', category: 'comms' },
  { match: 'ひかり', category: 'comms' },

  { match: 'ヤチン', category: 'housing' },
  { match: '家賃', category: 'housing' },
  { match: 'フドウサン', category: 'housing' },
  { match: '不動産', category: 'housing' },
  { match: 'ジュウタクローン', category: 'housing' },

  // Health, schooling, insurance, the state.
  { match: 'ヤッキョク', category: 'health' },
  { match: '薬局', category: 'health' },
  { match: 'クリニック', category: 'health' },
  { match: '病院', category: 'health' },
  { match: 'イリョウ', category: 'health' },
  { match: 'ホケン', category: 'insurance' },
  { match: '保険', category: 'insurance' },
  { match: 'ゼイ', category: 'tax' },
  { match: '税', category: 'tax' },
  { match: 'ネンキン', category: 'tax' },
  { match: '年金', category: 'tax' },
  { match: 'シヤクショ', category: 'tax' },
  { match: '市役所', category: 'tax' },
  { match: 'ガッコウ', category: 'education' },
  { match: 'ジュク', category: 'education' },
  { match: 'キョウザイ', category: 'education' },

  // Shopping and subscriptions.
  { match: 'アマゾン', category: 'shopping' },
  { match: 'amazon', category: 'shopping' },
  { match: '楽天', category: 'shopping' },
  { match: 'ユニクロ', category: 'shopping' },
  { match: 'ヨドバシ', category: 'shopping' },
  { match: 'ビックカメラ', category: 'shopping' },
  { match: 'メルカリ', category: 'shopping' },
  { match: 'apple', category: 'shopping' },
  { match: 'アップル', category: 'shopping' },
  { match: 'ネットフリックス', category: 'entertainment' },
  { match: 'netflix', category: 'entertainment' },
  { match: 'spotify', category: 'entertainment' },
  { match: 'ゴルフ', category: 'entertainment' },
  { match: 'エイガ', category: 'entertainment' },

  // Movements that are not spending at all, and must not be counted as it.
  { match: 'カード', category: 'transfer' },
  { match: 'クレジット', category: 'transfer' },
  { match: 'フリコミ', category: 'transfer' },
  { match: '振込', category: 'transfer' },
  { match: 'ソウキン', category: 'transfer' },
  { match: 'ヒキダシ', category: 'cash' },
  { match: 'ａｔｍ', category: 'cash' },
  { match: 'atm', category: 'cash' },
  { match: 'テスウリョウ', category: 'fees' },
  { match: '手数料', category: 'fees' },

  // Money in.
  { match: 'キュウヨ', category: 'salary' },
  { match: '給与', category: 'salary' },
  { match: 'ショウヨ', category: 'salary' },
  { match: 'ゲッシャ', category: 'tuition' },
  { match: '月謝', category: 'tuition' },
  { match: 'リソク', category: 'income-other' },
  { match: '利息', category: 'income-other' },
];
