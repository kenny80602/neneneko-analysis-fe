import { act, fireEvent, render, screen } from '@testing-library/react';
import GroupChainButton, { chainStocksOf } from './GroupChainButton';
import { GroupMembers } from '../api/types';

const group = (name: string, symbols: [string, string][], upstream: string[] = []): GroupMembers => ({
  group: {
    id: name,
    name,
    symbols: symbols.map(([s]) => s),
    sort_order: 0,
    upstream: upstream.map((n) => ({ name: n, inferred: false })),
    downstream: [],
  },
  members: symbols.map(([symbol, stockName]) => ({ symbol, name: stockName, industry: '', in_watchlist: false })),
});

const roster: GroupMembers[] = [
  group('玻纖布', [['1802', '台玻'], ['1815', '富喬']]),
  group('CCL', [['2383', '台光電'], ['6213', '聯茂']], ['玻纖布']),
  group('PCB 板廠', [['2368', '金像電']], ['CCL']),
];
const sources = roster.map((entry) => ({ name: entry.group.name, upstream: entry.group.upstream }));

describe('GroupChainButton', () => {
  it('滑鼠移到圖示上就顯示整條鏈，移開後收起來', () => {
    jest.useFakeTimers();
    render(<GroupChainButton name="CCL" sources={sources} stocksOf={chainStocksOf(roster)} />);
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.mouseEnter(screen.getByRole('button', { name: /CCL 的上下游關聯圖/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    for (const name of ['玻纖布', 'CCL', 'PCB 板廠']) {
      expect(screen.getByTestId(`chain-node-${name}`)).toBeInTheDocument();
    }

    fireEvent.mouseLeave(screen.getByRole('button', { name: /CCL 的上下游關聯圖/ }));
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    jest.useRealTimers();
  });

  it('一開始列自己的股票，摸圖裡別的族群就換成那個族群的股票', () => {
    render(<GroupChainButton name="CCL" sources={sources} stocksOf={chainStocksOf(roster)} />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: /CCL 的上下游關聯圖/ }));

    const panel = screen.getByTestId('chain-stocks');
    expect(panel).toHaveTextContent('台光電');
    expect(panel).not.toHaveTextContent('台玻');

    fireEvent.mouseEnter(screen.getByTestId('chain-node-玻纖布'));
    expect(screen.getByTestId('chain-stocks')).toHaveTextContent('台玻');
    expect(screen.getByTestId('chain-stocks')).toHaveTextContent('富喬');
    expect(screen.getByTestId('chain-stocks')).not.toHaveTextContent('台光電');
  });

  it('點圖示會釘住，不會因為滑鼠移開而收起來', () => {
    jest.useFakeTimers();
    render(<GroupChainButton name="CCL" sources={sources} />);
    const button = screen.getByRole('button', { name: /CCL 的上下游關聯圖/ });
    fireEvent.mouseEnter(button);
    fireEvent.click(button);
    fireEvent.mouseLeave(button);
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    jest.useRealTimers();
  });
});

describe('chainStocksOf', () => {
  it('名單以成員清單為準，有行情的依報酬由高到低排前面，沒行情的接後面', () => {
    const heat = new Map([
      [
        'CCL',
        {
          rank: 1,
          item: { members: [{ symbol: '6213', name: '聯茂', return_pct: 3.2, trade_value: 1 }] },
        },
      ],
    ]) as unknown as Parameters<typeof chainStocksOf>[1];
    const stocks = chainStocksOf(roster, heat)('CCL');
    expect(stocks.map((s) => s.symbol)).toEqual(['6213', '2383']);
    expect(stocks[0].returnPct).toBe(3.2);
    expect(stocks[1].returnPct).toBeNull();
  });

  it('成員清單還沒載入時退到熱度榜裡算得出報酬的那幾檔', () => {
    const heat = new Map([
      ['CCL', { rank: 1, item: { members: [{ symbol: '6213', name: '聯茂', return_pct: 1, trade_value: 1 }] } }],
    ]) as unknown as Parameters<typeof chainStocksOf>[1];
    expect(chainStocksOf([], heat)('CCL').map((s) => s.symbol)).toEqual(['6213']);
    expect(chainStocksOf([], undefined)('CCL')).toEqual([]);
  });
});
