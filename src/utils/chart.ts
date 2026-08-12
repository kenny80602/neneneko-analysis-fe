// K 線圖的資料換算：把每日收盤併成週 K／月 K，並算移動平均。
//
// 這裡只做計算，不知道資料從哪支 API 來——所以輸入型別寫成結構相容的 DailyBar，
// 而不是 import api/types（utils 層不依賴 api 層）。DailyQuote 可以直接傳進來。

/** 顯示週期。日 K 之外都是在前端併出來的，後端只落地日資料。 */
export type CandleInterval = 'day' | 'week' | 'month';

/** 每日收盤行情裡畫圖用得到的欄位。 */
export interface DailyBar {
  date: string;
  traded: boolean;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Candle {
  /** 這根 K 涵蓋的最後一個交易日。週 K／月 K 拿它當 x 軸標籤。 */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** 期間成交量合計，單位股（與後端一致，顯示時再換成張）。 */
  volume: number;
}

/** 併週用的分組鍵：那一週的週一。用 ISO 週數會在跨年那週遇到一堆邊界情況。 */
function weekKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const weekday = (d.getUTCDay() + 6) % 7; // 週一為 0
  d.setUTCDate(d.getUTCDate() - weekday);
  return d.toISOString().slice(0, 10);
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

/**
 * 每日收盤 → K 棒序列，順序由舊到新（後端一律由新到舊）。
 *
 * 未成交的日子會被濾掉：那幾天的價格欄位全是 0，畫進去會出現一根插到底的假 K。
 */
export function toCandles(
  quotes: DailyBar[] | undefined,
  interval: CandleInterval
): Candle[] {
  const bars = (quotes ?? []).filter((bar) => bar.traded).slice().reverse();

  const candles: Candle[] = [];
  let currentKey = '';

  for (const bar of bars) {
    const key = interval === 'day' ? bar.date : interval === 'week' ? weekKey(bar.date) : monthKey(bar.date);

    if (key !== currentKey) {
      currentKey = key;
      candles.push({
        date: bar.date,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      });
      continue;
    }

    // 同一週／同一月：開盤取第一天、收盤取最後一天，量相加。
    const candle = candles[candles.length - 1];
    candle.date = bar.date;
    candle.high = Math.max(candle.high, bar.high);
    candle.low = Math.min(candle.low, bar.low);
    candle.close = bar.close;
    candle.volume += bar.volume;
  }

  return candles;
}

/**
 * 收盤價的移動平均，回傳陣列與 candles 逐一對應。
 *
 * 前 period − 1 根是 null 而不是 0：資料不足算不出均線，畫成 0 會多出一條貼著底的線。
 */
export function movingAverage(candles: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  let sum = 0;

  for (let i = 0; i < candles.length; i += 1) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    result.push(i >= period - 1 ? sum / period : null);
  }

  return result;
}

/**
 * 最後一根相對 span 根之前的漲跌幅（%）。資料不足回 null——不足是「不知道」，不是 0。
 *
 * ⚠️ 收盤價沒有還原權值，區間內若有除權息，這個數字會把配息當成下跌。
 */
export function changePercentOver(candles: Candle[], span: number): number | null {
  if (candles.length <= span) return null;
  const base = candles[candles.length - 1 - span].close;
  if (base <= 0) return null;
  return ((candles[candles.length - 1].close - base) / base) * 100;
}
