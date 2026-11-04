import { Candle, FORECAST_WINDOW, forecastCone } from './chart';

// 依序給定收盤價，其餘欄位無關。
const bars = (closes: number[]): Candle[] =>
  closes.map((close, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  }));

// 固定的來回震盪：報酬有變異、平均接近 0，標準差好預期。
const wiggle = (n: number, up = 1.02): number[] =>
  Array.from({ length: n }, (_, i) => 100 * (i % 2 === 0 ? 1 : up));

describe('forecastCone', () => {
  it('資料不足是 null，不是零寬度的區間', () => {
    expect(forecastCone(bars(wiggle(FORECAST_WINDOW)), 5, 1)).toBeNull();
    expect(forecastCone(bars(wiggle(FORECAST_WINDOW + 1)), 5, 1)).not.toBeNull();
  });

  it('沒有格數或每格天數時回 null', () => {
    const daily = bars(wiggle(FORECAST_WINDOW + 1));
    expect(forecastCone(daily, 0, 1)).toBeNull();
    expect(forecastCone(daily, 5, 0)).toBeNull();
  });

  it('價格出現 0 或負數時回 null（取對數會爆）', () => {
    const closes = wiggle(FORECAST_WINDOW + 5);
    closes[10] = 0;
    expect(forecastCone(bars(closes), 5, 1)).toBeNull();
  });

  it('中心是最後收盤，區間在對數尺度上對稱，80% 比 50% 寬', () => {
    const daily = bars(wiggle(FORECAST_WINDOW + 1));
    const cone = forecastCone(daily, 3, 1)!;
    const last = daily[daily.length - 1].close;
    expect(cone.base).toBe(last);
    cone.points.forEach((p) => {
      expect(p.hi50 * p.lo50).toBeCloseTo(last * last, 6);
      expect(p.hi80 * p.lo80).toBeCloseTo(last * last, 6);
      expect(p.hi80).toBeGreaterThan(p.hi50);
      expect(p.lo80).toBeLessThan(p.lo50);
      expect(p.lo80).toBeGreaterThan(0);
    });
  });

  it('寬度與 √天數成正比：第 4 格的對數半寬是第 1 格的 2 倍', () => {
    const cone = forecastCone(bars(wiggle(FORECAST_WINDOW + 1)), 4, 1)!;
    const half = (slot: number) => Math.log(cone.points[slot - 1].hi80 / cone.base);
    expect(half(4) / half(1)).toBeCloseTo(2, 6);
  });

  it('週線每格 5 天：1 格等於日線第 5 格', () => {
    const daily = bars(wiggle(FORECAST_WINDOW + 1));
    const week = forecastCone(daily, 1, 5)!;
    const day = forecastCone(daily, 5, 1)!;
    expect(week.points[0].hi80).toBeCloseTo(day.points[4].hi80, 6);
  });

  it('整段完全沒動：寬度為 0，不是 NaN', () => {
    const cone = forecastCone(bars(Array(FORECAST_WINDOW + 1).fill(50)), 2, 1)!;
    expect(cone.dailySigma).toBe(0);
    expect(cone.points[1].hi80).toBe(50);
    expect(cone.points[1].lo80).toBe(50);
  });

  it('只看最近 FORECAST_WINDOW 根：更早的劇烈波動不影響', () => {
    const calm = Array(FORECAST_WINDOW + 1).fill(100);
    const wild = [10, 500, 20, 400, 30];
    const cone = forecastCone(bars([...wild, ...calm]), 1, 1)!;
    expect(cone.dailySigma).toBe(0);
  });
});
