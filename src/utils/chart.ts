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
 * 布林通道：中軌是 period 日均線，上下軌是中軌加減 multiplier 倍標準差（母體公式，除以 n，跟券商軟體一致）。
 * 前 period − 1 根是 null，不是 0。
 *
 * ⚠️ 只拿來輔助辨認盤整（通道走平、寬度收窄）；軌道是統計出來的，不是價格碰過的支撐壓力，
 * 不要直接當箱頂與箱底。
 */
export function bollinger(
  candles: Candle[],
  period = 20,
  multiplier = 2
): { upper: number | null; middle: number | null; lower: number | null }[] {
  return candles.map((_, i) => {
    if (i < period - 1) return { upper: null, middle: null, lower: null };
    const window = candles.slice(i - period + 1, i + 1);
    const mean = window.reduce((sum, c) => sum + c.close, 0) / period;
    const variance = window.reduce((sum, c) => sum + (c.close - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    return { upper: mean + multiplier * sd, middle: mean, lower: mean - multiplier * sd };
  });
}

/**
 * %b：收盤價在布林通道裡的相對位置，(收盤 − 下軌) ÷ (上軌 − 下軌)。0＝下軌、0.5＝中軌、1＝上軌，
 * 可以小於 0 或大於 1（收在軌道之外）。
 *
 * 前 period − 1 根與「上下軌重合」（20 日收盤完全沒變，標準差為 0）都是 null：
 * 分母是 0 算不出來，不是 0.5。
 *
 * ⚠️ 只是位置的描述，不是買賣訊號。強勢股會長時間貼著上軌（%b 持續 > 0.8），
 * 把「大於 1」讀成過熱就會一路賣飛；這個數值沒有檢定過。
 */
export function percentB(
  candles: Candle[],
  bands: { upper: number | null; lower: number | null }[] = bollinger(candles)
): (number | null)[] {
  return candles.map((candle, i) => {
    const { upper, lower } = bands[i] ?? { upper: null, lower: null };
    if (upper == null || lower == null || upper <= lower) return null;
    return (candle.close - lower) / (upper - lower);
  });
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

/** 估算波動用的日報酬根數。實測 20、60、120 都能校準，60 是最不受單一事件拉偏的折衷。 */
export const FORECAST_WINDOW = 60;

// 常態分位數：雙尾 50% 與 80% 區間。刻意不放 95%：股價有厚尾，實測名目 95% 只涵蓋約 92%，
// 畫出來會讓人以為「幾乎不會跑出去」。
const Z50 = 0.6745;
const Z80 = 1.2816;

export interface ForecastPoint {
  /** 第幾格（從 1 開始）。 */
  slot: number;
  lo50: number;
  hi50: number;
  lo80: number;
  hi80: number;
}

export interface ForecastCone {
  /** 區間的中心：最後一根日 K 的收盤，**不假設漲跌**。 */
  base: number;
  /** 日報酬的標準差（對數報酬）。 */
  dailySigma: number;
  daysPerSlot: number;
  points: ForecastPoint[];
}

/**
 * 以最近 FORECAST_WINDOW 個交易日的波動，推算接下來 `slots` 格的價格區間。
 *
 * 這是**波動範圍不是預測**：中心固定在最後收盤、對稱於對數尺度，寬度與 √天數成正比，
 * 完全沒有方向判斷。全市場回測（2020-10～2026-10、成交值前 300 檔，名目 80% 區間在 5、10、20 日
 * 實際涵蓋 79.4～81.0%）支持這個寬度，但回測驗證的是「寬度合不合理」，
 * 不是「價格會往哪走」——後者我們檢定過的訊號都沒有 edge。
 *
 * 一定吃**日** K，不吃週 K／月 K：週 K 只有幾十根，標準差估不穩；
 * 週與月的區間用 daysPerSlot（5、21）把日波動換算過去。
 *
 * 資料不足（少於 FORECAST_WINDOW + 1 根）或有非正價格回 null：不足是「不知道」，不是零波動。
 * ⚠️ 收盤價沒有還原權值，視窗內有除權息的話，配息會被當成一次下跌而讓區間略寬。
 */
export function forecastCone(
  daily: Candle[],
  slots: number,
  daysPerSlot: number
): ForecastCone | null {
  if (slots < 1 || daysPerSlot < 1 || daily.length < FORECAST_WINDOW + 1) return null;
  const recent = daily.slice(-(FORECAST_WINDOW + 1));
  if (recent.some((candle) => !(candle.close > 0))) return null;

  const returns: number[] = [];
  for (let i = 1; i < recent.length; i += 1) {
    returns.push(Math.log(recent[i].close / recent[i - 1].close));
  }
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  const dailySigma = Math.sqrt(variance);

  const base = recent[recent.length - 1].close;
  const points: ForecastPoint[] = [];
  for (let slot = 1; slot <= slots; slot += 1) {
    const spread = dailySigma * Math.sqrt(slot * daysPerSlot);
    points.push({
      slot,
      lo50: base * Math.exp(-Z50 * spread),
      hi50: base * Math.exp(Z50 * spread),
      lo80: base * Math.exp(-Z80 * spread),
      hi80: base * Math.exp(Z80 * spread),
    });
  }
  return { base, dailySigma, daysPerSlot, points };
}
