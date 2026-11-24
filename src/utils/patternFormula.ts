// 技術型態圖鑑「公式試算」用的純函式。算式抄自後端 domain 的偵測與目標價規則
// （chart_pattern_reversal.go、chart_pattern_continuation.go），只做幾何算術：
// 輸入不完整、不是有限數字一律回 null，畫面顯示破折號，不當成 0。

const ok = (x: number | null | undefined): x is number => typeof x === 'number' && Number.isFinite(x);

export type Direction = 'up' | 'down';

/**
 * 反轉型態的量測目標：頸線往突破方向再走「頸線到極值的距離」。
 * W 底（極值＝腳）、頭肩底（頭）、三重底（三個低點平均）往上；M 頭、頭肩頂、三重頂往下。
 * 方向由極值在頸線的哪一側決定，不另外讓使用者選，選反了會算出一個沒有意義的價位。
 */
export function reversalTarget(neck: number | null, extreme: number | null): number | null {
  if (!(ok(neck) && ok(extreme)) || neck <= 0 || extreme <= 0 || neck === extreme) return null;
  return neck + (neck - extreme);
}

/** 型態高度占極值價位的比例；後端用它跟 MinDepth（6%）比，太淺的只是盤整的小波動。 */
export function depthRatio(neck: number | null, extreme: number | null): number | null {
  if (!(ok(neck) && ok(extreme)) || extreme <= 0) return null;
  return Math.abs(neck - extreme) / extreme;
}

/** 箱型：突破箱頂的目標＝箱頂＋箱高；跌破箱底的目標＝箱底－箱高。 */
export function boxTargets(top: number | null, bottom: number | null) {
  if (!(ok(top) && ok(bottom)) || bottom <= 0 || top <= bottom) return null;
  const height = top - bottom;
  return { height, heightPct: height / bottom, up: top + height, down: bottom - height };
}

/**
 * 三角形與旗型：突破（跌破）價往方向再走一個「度量」。
 * 三角形的度量是一開始的開口寬度（上緣減下緣）；旗型的度量是旗桿高度。
 */
export function measuredTarget(
  breakout: number | null,
  measure: number | null,
  direction: Direction
): number | null {
  if (!(ok(breakout) && ok(measure)) || breakout <= 0 || measure <= 0) return null;
  return direction === 'up' ? breakout + measure : breakout - measure;
}

/** 現價到目標價的幅度（%，正＝還要漲、負＝還要跌）。 */
export function moveToTarget(price: number | null, target: number | null): number | null {
  if (!(ok(price) && ok(target)) || price <= 0) return null;
  return ((target - price) / price) * 100;
}

/** 量比＝當日量 ÷ 前 N 日平均量。均量為 0 算不出來。 */
export function volumeRatio(volume: number | null, avgVolume: number | null): number | null {
  if (!(ok(volume) && ok(avgVolume)) || avgVolume <= 0 || volume < 0) return null;
  return volume / avgVolume;
}

/** 後端 VolumeHeavy：量比達到這個倍數算「有量」。 */
export const VOLUME_HEAVY = 1.5;

/** 兩個價位的差距占較低者的比例，後端的腳差、肩差、頸線斜率都是這個口徑（除以較低的那個）。 */
export function gapToLower(a: number | null, b: number | null): number | null {
  if (!(ok(a) && ok(b))) return null;
  const lo = Math.min(a, b);
  if (lo <= 0) return null;
  return Math.abs(a - b) / lo;
}

/** 盤整區間比＝（區間最高 − 區間最低）÷ 平均收盤。 */
export function rangeRatio(high: number | null, low: number | null, avgClose: number | null): number | null {
  if (!(ok(high) && ok(low) && ok(avgClose)) || avgClose <= 0 || high < low) return null;
  return (high - low) / avgClose;
}

/** 布林 %b＝（收盤 − 下軌）÷（上軌 − 下軌）。上下軌重合時算不出來。 */
export function percentB(close: number | null, upper: number | null, lower: number | null): number | null {
  if (!(ok(close) && ok(upper) && ok(lower)) || upper <= lower) return null;
  return (close - lower) / (upper - lower);
}

/** 布林頻寬＝（上軌 − 下軌）÷ 中軌。 */
export function bandwidth(upper: number | null, lower: number | null, mid: number | null): number | null {
  if (!(ok(upper) && ok(lower) && ok(mid)) || mid <= 0 || upper < lower) return null;
  return (upper - lower) / mid;
}

/** 把輸入框的字串轉成數字；空字串與非數字是 null（還沒填），不是 0。 */
export function parseInput(raw: string): number | null {
  const s = raw.replace(/,/g, '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
