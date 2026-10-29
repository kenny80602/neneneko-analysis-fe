import request from './request';
import { getPriceLevels, LEVELS_MAX_SYMBOLS } from './dailyQuote';
import { SymbolLevels } from './types';

jest.mock('./request', () => ({ __esModule: true, default: { get: jest.fn() } }));

const get = request.get as jest.Mock;

const item = (symbol: string): SymbolLevels => ({
  symbol,
  last_close: 100,
  last_date: '2026-10-28',
  levels: [],
  bars: 300,
});

// 後端依傳入的代號原樣回，模擬真正的行為。
function mockBackend() {
  get.mockImplementation((_url: string, config: { params: { symbols: string } }) =>
    Promise.resolve({
      data: {
        data: { count: 0, caveats: [], items: config.params.symbols.split(',').map(item) },
      },
    })
  );
}

describe('getPriceLevels', () => {
  beforeEach(() => get.mockReset());

  it('一批以內只發一次請求，順序與傳入一致', async () => {
    mockBackend();
    const result = await getPriceLevels(['2330', '2317', '6488']);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/stocks/daily/levels', { params: { symbols: '2330,2317,6488' } });
    expect(result.map((r) => r.symbol)).toEqual(['2330', '2317', '6488']);
  });

  it('超過後端上限就分批，尾端不會被截掉，順序仍與傳入一致', async () => {
    mockBackend();
    const symbols = Array.from({ length: LEVELS_MAX_SYMBOLS * 2 + 5 }, (_, i) => `S${i}`);
    const result = await getPriceLevels(symbols);

    expect(get).toHaveBeenCalledTimes(3);
    const sizes = get.mock.calls.map(([, config]) => config.params.symbols.split(',').length);
    expect(sizes).toEqual([LEVELS_MAX_SYMBOLS, LEVELS_MAX_SYMBOLS, 5]);
    // 被截掉的話最後幾檔會消失，讀起來像「沒有資料」。
    expect(result.map((r) => r.symbol)).toEqual(symbols);
  });

  it('沒有代號就不發請求', async () => {
    expect(await getPriceLevels([])).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it('任何一批失敗就整個失敗，讓畫面能顯示載入失敗而不是缺一半', async () => {
    get.mockRejectedValue(new Error('network'));
    await expect(getPriceLevels(['2330'])).rejects.toThrow('network');
  });

  it('回應沒有 items 時當成空清單', async () => {
    get.mockResolvedValue({ data: { data: null } });
    expect(await getPriceLevels(['2330'])).toEqual([]);
  });
});
