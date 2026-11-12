import { DailyQuote, MarginBalance } from '../api/types';
import { VOLUME_WINDOW, computeMarginTurnover } from './marginTurnover';

const day = (n: number) => `2026-01-${String(n).padStart(2, '0')}`;

// 只填算式用到的欄位。
const quote = (n: number, volumeShares: number, traded = true) =>
  ({ date: day(n), traded, volume: volumeShares } as DailyQuote);
const balance = (n: number, marginBalance: number, offsetting: number) =>
  ({ date: day(n), margin_balance: marginBalance, offsetting } as MarginBalance);

// 連續 N 天、每天固定 1,000,000 股（= 1,000 張）。後端給的順序是新到舊。
const flatQuotes = (n: number) =>
  Array.from({ length: n }, (_, i) => quote(n - i, 1_000_000));

describe('computeMarginTurnover', () => {
  it('融資餘額 ÷ 均量：1,000 張均量、餘額 5,000 張 → 5 天', () => {
    const r = computeMarginTurnover([balance(VOLUME_WINDOW, 5000, 0)], flatQuotes(VOLUME_WINDOW));
    expect(r.get(day(VOLUME_WINDOW))?.marginDays).toBeCloseTo(5);
  });

  it('資券互抵占量：100 張 ÷ 當日 1,000 張 = 10%', () => {
    const r = computeMarginTurnover([balance(VOLUME_WINDOW, 5000, 100)], flatQuotes(VOLUME_WINDOW));
    expect(r.get(day(VOLUME_WINDOW))?.offsetPct).toBeCloseTo(10);
  });

  it('均量視窗不足時融資占量是 null，不是用少數幾天硬算', () => {
    const r = computeMarginTurnover([balance(5, 5000, 100)], flatQuotes(VOLUME_WINDOW));
    expect(r.get(day(5))?.marginDays).toBeNull();
    // 互抵占量只用當天的量，不受視窗影響。
    expect(r.get(day(5))?.offsetPct).toBeCloseTo(10);
  });

  it('那天沒有收盤行情時兩個都是 null', () => {
    const r = computeMarginTurnover([balance(30, 5000, 100)], flatQuotes(VOLUME_WINDOW));
    expect(r.get(day(30))).toEqual({ marginDays: null, offsetPct: null });
  });

  it('沒成交的日子不納入均量，也不當分母', () => {
    const quotes = [...flatQuotes(VOLUME_WINDOW), quote(VOLUME_WINDOW + 1, 0, false)];
    const r = computeMarginTurnover([balance(VOLUME_WINDOW + 1, 5000, 100)], quotes);
    expect(r.get(day(VOLUME_WINDOW + 1))).toEqual({ marginDays: null, offsetPct: null });
  });

  it('近期爆量會把均量墊高，比率下降', () => {
    const quotes = flatQuotes(VOLUME_WINDOW).map((q) =>
      q.date === day(VOLUME_WINDOW) ? { ...q, volume: 21_000_000 } : q
    );
    // 均量 = (19×1,000 + 21,000) ÷ 20 = 2,000 張，餘額 5,000 → 2.5 天
    const r = computeMarginTurnover([balance(VOLUME_WINDOW, 5000, 0)], quotes);
    expect(r.get(day(VOLUME_WINDOW))?.marginDays).toBeCloseTo(2.5);
  });
});
