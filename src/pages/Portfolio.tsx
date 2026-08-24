import { FormEvent, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import { getDailyQuotesByDate } from '../api/dailyQuote';
import {
  addHolding,
  getPortfolioValuation,
  notifyPortfolio,
  removeHolding,
} from '../api/portfolio';
import { apiErrorMessage } from '../api/request';
import { DailyQuote, PortfolioRow } from '../api/types';
import { useSymbol } from '../context/SymbolContext';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  DASH,
  formatDateTime,
  formatPercent,
  formatPrice,
  formatShareToLot,
  priceSourceLabel,
  quoteBadge,
} from '../utils/format';

const PAGE_SIZE = 20;

type SortKey = 'symbol' | 'price' | 'change';
type SortDirection = 'asc' | 'desc';

// 表格一列 = 一檔（不是一筆部位）+ 最近收盤（漲跌、成交量）。
//
// 這一頁是「觀察清單」，一檔就該只有一列。但 /portfolio/valuation 是逐列回的——
// 持股表裡同一檔可以有好幾列（不同券商帳戶），所以那支會回好幾筆同代號的資料，
// 直接拿來 render 會出現重複的列與重複的 React key。逐筆的檢視在「我的持股」。
//
// 漲跌與成交量走 GET /stocks/daily 一次要回整天的資料再依代號比對，
// 不是逐檔打即時報價——自選股有幾十檔，逐檔打會直接撞上游的限流。
interface Row extends PortfolioRow {
  changePercent: number | null;
  volume: number | null;
  quoteNote: string;
  /** 這一檔在持股表裡佔幾筆部位。大於 1 代表分散在多個帳戶。 */
  lots: number;
}

function toChangePercent(quote: DailyQuote | undefined): number | null {
  if (!quote || !quote.traded || quote.ex_dividend) return null;
  const previousClose = quote.close - quote.change;
  if (previousClose <= 0) return null;
  return (quote.change / previousClose) * 100;
}

export default function Portfolio() {
  const { setSymbol } = useSymbol();
  const valuation = useAsyncData(() => getPortfolioValuation(), []);
  const daily = useAsyncData(() => getDailyQuotesByDate(), []);

  const [onlyBuyZone, setOnlyBuyZone] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('symbol');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(0);
  const [notifying, setNotifying] = useState(false);
  const [notice, setNotice] = useState('');
  const [newSymbol, setNewSymbol] = useState('');
  const [adding, setAdding] = useState(false);
  // 正在刪除的代號。用代號而不是布林值，才能只把那一列的按鈕轉成處理中。
  const [removingSymbol, setRemovingSymbol] = useState('');
  // 已經刪掉、但試算還沒重跑完的代號。
  //
  // 這一頁的列來自 /portfolio/valuation，那支要逐檔取行情，重跑一次要好幾秒。
  // 不先把刪掉的列藏起來的話，使用者會盯著一列「已經刪掉卻還在」的資料好幾秒，
  // 看起來像刪除失敗。
  const [removedSymbols, setRemovedSymbols] = useState<string[]>([]);

  // 新的試算結果一回來就不必再自己藏了，交還給後端的資料當唯一事實來源。
  useEffect(() => {
    setRemovedSymbols([]);
  }, [valuation.data]);

  const rows = useMemo<Row[]>(() => {
    const quoteBySymbol = new Map((daily.data?.quotes ?? []).map((q) => [q.symbol, q]));

    // 先依代號併成一檔。行情欄位（現價、來源、回檔、買區）同一檔的每一筆都一樣，
    // 取第一筆即可；成本相關的欄位則不一定，見下面 profitPercent 的處理。
    const bySymbol = new Map<string, PortfolioRow[]>();
    for (const row of valuation.data ?? []) {
      if (removedSymbols.includes(row.symbol)) continue;
      const list = bySymbol.get(row.symbol);
      if (list) list.push(row);
      else bySymbol.set(row.symbol, [row]);
    }

    const merged: Row[] = [];
    bySymbol.forEach((list, symbol) => {
      const first = list[0];
      const quote = quoteBySymbol.get(symbol);
      // 同一檔分散在多個帳戶、成本各不相同時，「這一檔的損益」沒有單一答案——
      // 要加權就得有股數，而這一頁沒有。與其挑一筆當代表（那是錯的），
      // 不如顯示破折號，逐筆的損益請看「我的持股」。
      const sameCost = list.every((row) => row.cost === first.cost);
      merged.push({
        ...first,
        lots: list.length,
        profit_percent: sameCost ? first.profit_percent : null,
        changePercent: toChangePercent(quote),
        volume: quote?.traded ? quote.volume : null,
        quoteNote: !quote
          ? '無收盤資料'
          : quote.ex_dividend
          ? '除權息'
          : !quote.traded
          ? '無成交'
          : '',
      });
    });
    return merged;
  }, [valuation.data, daily.data, removedSymbols]);

  const visibleRows = useMemo(() => {
    const filtered = onlyBuyZone ? rows.filter((row) => row.in_buy_zone) : rows;
    const factor = sortDirection === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'symbol') return a.symbol.localeCompare(b.symbol) * factor;
      // 取不到值的列一律排最後，不因為排序方向而跑到最前面擋住有資料的列。
      const left = sortKey === 'price' ? a.price : a.changePercent;
      const right = sortKey === 'price' ? b.price : b.changePercent;
      if (left == null && right == null) return 0;
      if (left == null) return 1;
      if (right == null) return -1;
      return (left - right) * factor;
    });
  }, [rows, onlyBuyZone, sortKey, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pagedRows = visibleRows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'symbol' ? 'asc' : 'desc');
    }
    setPage(0);
  };

  const handleNotify = async () => {
    // 推播會真的送出 LINE 訊息並吃掉計費額度（按送達人數計），所以要二次確認。
    if (!window.confirm('確定要推播目前試算結果到 LINE？這會消耗 LINE 訊息額度。')) return;
    setNotifying(true);
    setNotice('');
    try {
      const pushed = await notifyPortfolio('FLEX');
      setNotice(`已推播 ${pushed.length} 檔`);
    } catch (err) {
      setNotice(apiErrorMessage(err, '推播失敗'));
    } finally {
      setNotifying(false);
    }
  };

  const reloadAll = () => {
    valuation.reload();
    daily.reload();
  };

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    const symbol = newSymbol.trim();
    if (!symbol) return;
    setAdding(true);
    setNotice('');
    try {
      const result = await addHolding(symbol);
      setNewSymbol('');
      // 「本來就在清單裡」後端不當成錯誤，這裡要講不一樣的話，
      // 否則使用者會以為剛剛那一次真的加進去了。
      // ApiResponse.data 型別上可有可無（成功時後端一定會給），少了就照實說而不是假裝成功。
      setNotice(
        !result
          ? '已送出，但後端沒有回傳結果，請重新整理確認'
          : result.already_exists
          ? `${result.symbol} ${result.name} 本來就在清單裡`
          : `已加入 ${result.symbol} ${result.name}`
      );
      // 新增後要重跑試算才看得到這一檔的現價，清單本身不含行情。
      valuation.reload();
    } catch (err) {
      setNotice(apiErrorMessage(err, '加入失敗，請確認代號'));
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (symbol: string, name: string, lots: number) => {
    // 這一支刪的是「這一檔的全部列」，多帳戶時會一次清掉所有部位，要先講清楚。
    // 只想刪其中一個帳戶的請到「我的持股」逐筆刪。
    const warning =
      lots > 1 ? `這一檔有 ${lots} 筆部位（不同帳戶），會全部一起移除。` : '';
    if (!window.confirm(`確定要把 ${symbol} ${name} 從自選股移除？${warning}`)) return;
    setRemovingSymbol(symbol);
    setNotice('');
    try {
      const result = await removeHolding(symbol);
      // removed 為 0 代表清單裡本來就沒有這一檔（別的地方剛刪過），不是失敗。
      setNotice(
        result && result.removed > 0
          ? `已移除 ${symbol}（${result.removed} 列）`
          : `${symbol} 已不在清單裡`
      );
      setRemovedSymbols((prev) => [...prev, symbol]);
      valuation.reload();
    } catch (err) {
      setNotice(apiErrorMessage(err, '移除失敗'));
    } finally {
      setRemovingSymbol('');
    }
  };

  const sortIcon = (key: SortKey) =>
    key === sortKey ? (sortDirection === 'asc' ? 'arrow_drop_up' : 'arrow_drop_down') : 'arrow_drop_down';

  const secondaryButton =
    'flex items-center justify-center gap-2 px-4 py-2 bg-surface border border-outline-variant rounded text-primary font-body-md text-body-md hover:bg-surface-container-low transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <>
      <PageHeader
        title="我的自選股"
        subtitle="即時監控目標股票倉位。"
        right={
          <>
            {notice && (
              <span className="font-body-sm text-body-sm text-on-surface-variant">{notice}</span>
            )}
            <button
              type="button"
              onClick={() => {
                setOnlyBuyZone((prev) => !prev);
                setPage(0);
              }}
              aria-pressed={onlyBuyZone}
              className={
                onlyBuyZone
                  ? 'flex items-center justify-center gap-2 px-4 py-2 bg-primary border border-primary rounded text-on-primary font-body-md text-body-md transition-colors'
                  : secondaryButton
              }
            >
              <span className="material-symbols-outlined text-[18px]">filter_list</span>
              {onlyBuyZone ? '只看買入區間' : '篩選'}
            </button>
            <button type="button" onClick={reloadAll} className={secondaryButton}>
              <span className="material-symbols-outlined text-[18px]">refresh</span>
              重新試算
            </button>
            <button
              type="button"
              onClick={handleNotify}
              disabled={notifying || rows.length === 0}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-primary rounded text-on-primary font-body-md text-body-md hover:bg-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[18px]">send</span>
              {notifying ? '推播中…' : '推播到 LINE'}
            </button>
          </>
        }
      />

      <form
        onSubmit={handleAdd}
        className="flex flex-wrap items-center gap-stack-sm bg-surface-container-lowest border border-outline-variant rounded-xl p-4 shadow-sm"
      >
        <label className="font-label-caps text-label-caps text-on-surface-variant uppercase">
          新增自選股
        </label>
        <input
          value={newSymbol}
          onChange={(event) => setNewSymbol(event.target.value)}
          placeholder="股票代號，例如 2330"
          className="w-52 px-3 py-2 bg-surface-container border border-outline-variant rounded font-data-md text-data-md text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={!newSymbol.trim() || adding}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-primary rounded text-on-primary font-body-md text-body-md hover:bg-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          {adding ? '加入中…' : '加入'}
        </button>
        {/* 這裡加進來的跟聊天室「/加 2330」一樣只有代號與名稱，成本欄會是空的。 */}
        <span className="font-body-sm text-body-sm text-on-surface-variant">
          代號會先向報價來源驗證；加進來的沒有成本，損益要等成本補上才算得出來。
        </span>
      </form>

      {valuation.loading && <PageState kind="loading" />}
      {valuation.error && (
        <PageState kind="error" message={valuation.error} onRetry={valuation.reload} />
      )}
      {!valuation.loading && !valuation.error && rows.length === 0 && (
        <PageState
          kind="empty"
          message="自選股清單是空的"
          hint="用上面的欄位加一檔進來，或在 LINE 聊天室輸入「/加 2330」——兩邊是同一份清單。"
        />
      )}

      {rows.length > 0 && (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low border-b border-outline-variant sticky top-0">
                <tr>
                  <th
                    onClick={() => toggleSort('symbol')}
                    className="p-2 pl-4 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap group cursor-pointer hover:text-primary transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      股號 / 名稱
                      <span
                        className={`material-symbols-outlined text-[14px] ${
                          sortKey === 'symbol' ? '' : 'opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        {sortIcon('symbol')}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => toggleSort('price')}
                    className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-right group cursor-pointer hover:text-primary transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      現價
                      <span
                        className={`material-symbols-outlined text-[14px] ${
                          sortKey === 'price' ? '' : 'opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        {sortIcon('price')}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => toggleSort('change')}
                    className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-right group cursor-pointer hover:text-primary transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      漲跌
                      <span
                        className={`material-symbols-outlined text-[14px] ${
                          sortKey === 'change' ? '' : 'opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        {sortIcon('change')}
                      </span>
                    </div>
                  </th>
                  <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-right">
                    成交量
                  </th>
                  <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-right">
                    損益
                  </th>
                  <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-center">
                    狀態
                  </th>
                  <th className="p-2 pr-4 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-right">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {pagedRows.map((row) => (
                  <tr
                    key={row.symbol}
                    onClick={() => setSymbol(row.symbol)}
                    title="點擊設為目前選取的股票"
                    className="hover:bg-surface-container-low/50 transition-colors group cursor-pointer"
                  >
                    <td className="p-2 pl-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-data-md text-data-md text-primary font-bold">
                          {row.symbol}
                        </span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                          {row.name}
                        </span>
                        {/* 一檔只佔一列，分散在多帳戶時在這裡提示，逐筆明細看「我的持股」。 */}
                        {row.lots > 1 && (
                          <span className="font-body-sm text-body-sm text-outline">
                            {row.lots} 筆部位
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-2 py-3 text-right">
                      <span className="font-data-md text-data-md text-on-surface">
                        {formatPrice(row.price)}
                      </span>
                      <span className="block font-body-sm text-body-sm text-outline">
                        {priceSourceLabel(row.price_source)}
                      </span>
                    </td>
                    <td className="p-2 py-3 text-right">
                      {row.changePercent == null ? (
                        <span className="font-body-sm text-body-sm text-outline">
                          {row.quoteNote || DASH}
                        </span>
                      ) : (
                        <span
                          className={`font-data-md text-data-md px-2 py-0.5 rounded-full ${quoteBadge(
                            row.changePercent
                          )}`}
                        >
                          {row.changePercent > 0 ? '+' : ''}
                          {formatPercent(row.changePercent)}
                        </span>
                      )}
                    </td>
                    <td className="p-2 py-3 text-right">
                      <span className="font-data-md text-data-md text-on-surface-variant">
                        {formatShareToLot(row.volume)}
                      </span>
                    </td>
                    <td className="p-2 py-3 text-right">
                      <span
                        className={`font-data-md text-data-md ${
                          quoteBadge(row.profit_percent).split(' ')[0]
                        }`}
                      >
                        {formatPercent(row.profit_percent)}
                      </span>
                    </td>
                    <td className="p-2 py-3 text-center">
                      {/* 設計稿的「高估」後端沒有對應欄位（要先定義規則才做得出來），
                          目前只分「取價失敗 / 買入區間 / 觀察中」三種，都直接來自後端。 */}
                      {row.error ? (
                        <span
                          className="inline-flex items-center gap-1 font-body-sm text-body-sm text-error border border-error/30 bg-error/5 px-2 py-1 rounded"
                          title={row.error}
                        >
                          <span className="material-symbols-outlined text-[14px]">warning</span>
                          取價失敗
                        </span>
                      ) : row.in_buy_zone ? (
                        <span className="inline-flex items-center gap-1 font-body-sm text-body-sm text-secondary border border-secondary/30 bg-secondary/5 px-2 py-1 rounded">
                          <span className="material-symbols-outlined text-[14px]">check_circle</span>
                          買入區間
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-body-sm text-body-sm text-on-surface-variant border border-outline-variant bg-surface-container px-2 py-1 rounded">
                          <span className="material-symbols-outlined text-[14px]">visibility</span>
                          觀察中
                        </span>
                      )}
                    </td>
                    <td className="p-2 pr-4 py-3 text-right">
                      {/* 整列的 onClick 會把這一檔設為目前選取的股票，
                          不擋住事件的話按刪除會連帶切換代號。 */}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleRemove(row.symbol, row.name, row.lots);
                        }}
                        disabled={removingSymbol === row.symbol}
                        title={`從自選股移除 ${row.symbol}`}
                        className="text-outline hover:text-error transition-colors p-1 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          {removingSymbol === row.symbol ? 'hourglass_empty' : 'delete'}
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-surface-container-low p-2 border-t border-outline-variant flex justify-between items-center font-body-sm text-body-sm text-on-surface-variant">
            <span>
              {visibleRows.length} 個項目
              {onlyBuyZone && rows.length !== visibleRows.length && `（共 ${rows.length} 檔）`}
            </span>
            <div className="flex items-center gap-2">
              <span>
                第 {currentPage + 1} / {pageCount} 頁
              </span>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                disabled={currentPage === 0}
                className="p-1 text-outline hover:text-primary transition-colors disabled:opacity-50 disabled:hover:text-outline"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(pageCount - 1, prev + 1))}
                disabled={currentPage >= pageCount - 1}
                className="p-1 text-outline hover:text-primary transition-colors disabled:opacity-50 disabled:hover:text-outline"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          現價為即時報價（來源標示於價格下方），漲跌與成交量取自最近一次收盤
          {daily.data?.date ? `（${daily.data.date}）` : ''}，成交量單位為張。
          破折號代表該值算不出來（例如沒有成本、虧損無本益比），不是 0。
          現價時間 {formatDateTime(rows.find((row) => row.price_as_of)?.price_as_of)}。
        </p>
      )}
    </>
  );
}
