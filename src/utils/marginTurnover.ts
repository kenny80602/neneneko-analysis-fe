import { DailyQuote, MarginBalance } from '../api/types';

// 均量視窗（交易日）。取一個月：夠平滑掉單日爆量，又不會讓三個月前的行情稀釋掉現在。
export const VOLUME_WINDOW = 20;

export interface MarginTurnover {
  // 融資餘額 ÷ 近 20 日平均成交量，單位「天」＝ 融資部位約等於幾天的成交量。
  // 越大代表套牢的融資越多、一旦被迫賣出要消化越久。null 是算不出來，不是 0。
  marginDays: number | null;
  // 資券互抵 ÷ 當日成交量（%）。資券互抵只含信用交易的當沖，現股當沖不在裡面，
  // 所以這是真實當沖比的下限，不是當沖比本身。
  offsetPct: number | null;
}

const EMPTY: MarginTurnover = { marginDays: null, offsetPct: null };

/**
 * 把融資融券與收盤行情依日期對起來，算出每一天的融資占量與資券互抵占量。
 *
 * 兩邊都是「日期由新到舊」。回傳以日期為 key，沒有對到的日子不會出現在 map 裡。
 *
 * 一律回 null 而不是 0 的情況：
 * - 那天沒有收盤行情，或沒成交（成交量 0 當分母沒有意義）
 * - 均量視窗內有效的交易日不足 {@link VOLUME_WINDOW} 天（資料開頭那幾天），
 *   拿三五天的平均去算會讓比率忽大忽小，比破折號更誤導
 *
 * 成交量上游單位是股、融資餘額與資券互抵是張，這裡統一換成張再相除。
 */
export function computeMarginTurnover(
  balances: MarginBalance[],
  quotes: DailyQuote[]
): Map<string, MarginTurnover> {
  // 成交日由舊到新，才能往前數視窗；沒成交的日子不納入均量。
  const traded = quotes
    .filter((q) => q.traded && q.volume > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const indexByDate = new Map(traded.map((q, i) => [q.date, i]));

  const out = new Map<string, MarginTurnover>();
  for (const b of balances) {
    const i = indexByDate.get(b.date);
    if (i === undefined) {
      out.set(b.date, EMPTY);
      continue;
    }
    const todayLots = traded[i].volume / 1000;
    const offsetPct = (b.offsetting / todayLots) * 100;

    if (i + 1 < VOLUME_WINDOW) {
      out.set(b.date, { marginDays: null, offsetPct });
      continue;
    }
    const window = traded.slice(i + 1 - VOLUME_WINDOW, i + 1);
    const avgLots = window.reduce((sum, q) => sum + q.volume, 0) / window.length / 1000;
    out.set(b.date, { marginDays: b.margin_balance / avgLots, offsetPct });
  }
  return out;
}
