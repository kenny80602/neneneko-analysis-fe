import { render, screen } from '@testing-library/react';
import { LevelCell } from './Holdings';
import { PriceLevel, SymbolLevels } from '../api/types';

const level = (kind: 'support' | 'resistance', price: number, distance: number, extra = {}): PriceLevel => ({
  kind,
  price,
  low: price - 5,
  high: price + 5,
  touches: 3,
  first_touch: '2026-03-02',
  last_touch: '2026-09-12',
  distance_pct: distance,
  in_zone: false,
  ...extra,
});

const item = (over: Partial<SymbolLevels> = {}): SymbolLevels => ({
  symbol: '2330',
  last_close: 2000,
  last_date: '2026-10-28',
  bars: 300,
  levels: [level('resistance', 2100, 5), level('support', 1900, -5)],
  ...over,
});

describe('LevelCell', () => {
  it('壓力與支撐各一行，帶正負號與一位小數，且不用漲跌色', () => {
    const { container } = render(<LevelCell item={item()} failed={false} latestDate="2026-10-28" />);
    expect(screen.getByText('+5.0%')).toBeInTheDocument();
    expect(screen.getByText('-5.0%')).toBeInTheDocument();
    // 紅綠會被讀成損益，這一欄只描述位置。
    expect(container.innerHTML).not.toMatch(/quote-up|quote-down/);
  });

  it('滑鼠提示帶價位區間、碰過幾次、最近一次日期與計算基準', () => {
    const { container } = render(<LevelCell item={item()} failed={false} latestDate="2026-10-28" />);
    const title = container.querySelector('[title]')?.getAttribute('title') ?? '';
    expect(title).toContain('壓力 2,100.00（區間 2,095.00～2,105.00，碰過 3 次，最近一次 2026-09-12');
    expect(title).toContain('支撐 1,900.00');
    expect(title).toContain('2026-10-28 的收盤 2,000.00');
    expect(title).toContain('不是預測');
  });

  it('只有一側有價位時，另一側是破折號而不是 0%', () => {
    render(
      <LevelCell
        item={item({ levels: [level('support', 1900, -5)] })}
        failed={false}
        latestDate="2026-10-28"
      />
    );
    expect(screen.getByText('-5.0%')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText(/0\.0%/)).not.toBeInTheDocument();
  });

  it('現價落在區間裡要在提示裡講', () => {
    const { container } = render(
      <LevelCell
        item={item({ levels: [level('support', 1995, -0.25, { in_zone: true })] })}
        failed={false}
        latestDate="2026-10-28"
      />
    );
    expect(container.querySelector('[title]')?.getAttribute('title')).toContain('現價在這個區間裡');
  });

  it('日 K 停在比這一批更早的日子時標出資料日期', () => {
    render(<LevelCell item={item({ last_date: '2026-09-30' })} failed={false} latestDate="2026-10-28" />);
    expect(screen.getByText('資料至 09-30')).toBeInTheDocument();
  });

  it('跟這一批同一天就不多標日期', () => {
    render(<LevelCell item={item()} failed={false} latestDate="2026-10-28" />);
    expect(screen.queryByText(/資料至/)).not.toBeInTheDocument();
  });

  describe('空的三種原因各自講清楚，且都是破折號', () => {
    const titleOf = (container: HTMLElement) => container.querySelector('[title]')?.getAttribute('title');

    it('載入失敗：持股表不受影響', () => {
      const { container } = render(<LevelCell item={undefined} failed latestDate="" />);
      expect(screen.getByText('—')).toBeInTheDocument();
      expect(titleOf(container)).toContain('載入失敗');
    });

    it('日 K 不夠長或不在收集名單', () => {
      const { container } = render(
        <LevelCell item={item({ levels: [], bars: 10 })} failed={false} latestDate="2026-10-28" />
      );
      expect(screen.getByText('—')).toBeInTheDocument();
      expect(titleOf(container)).toContain('日 K 不夠長');
      expect(titleOf(container)).toContain('自選股與個股清單');
    });

    it('後端根本沒回這一檔也當成沒有日 K', () => {
      const { container } = render(<LevelCell item={undefined} failed={false} latestDate="2026-10-28" />);
      expect(titleOf(container)).toContain('日 K 不夠長');
    });

    it('日 K 夠長但沒有價位被碰過兩次以上', () => {
      const { container } = render(
        <LevelCell item={item({ levels: [], bars: 300 })} failed={false} latestDate="2026-10-28" />
      );
      expect(titleOf(container)).toContain('沒有任何價位被轉折過兩次以上');
    });
  });
});
