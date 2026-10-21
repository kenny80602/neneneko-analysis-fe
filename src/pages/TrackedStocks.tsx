import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  addTrackedStock,
  backfillTrackedStock,
  getTrackedStocks,
  removeTrackedStock,
} from '../api/trackedStock';
import { apiErrorMessage } from '../api/request';
import { TrackedStock } from '../api/types';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import { useSymbol } from '../context/SymbolContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { DASH, formatDate, formatDateTime, marketLabel } from '../utils/format';

// 有任何一檔在補時的輪詢間隔。打的是自己的後端、只讀記憶體狀態與每檔一筆收盤，
// 不碰證交所，5 秒沒有限流問題；沒有任何一檔在補就不輪詢。
const WARMUP_POLLING_MS = 5000;

const secondaryButton =
  'flex items-center justify-center gap-1 px-3 py-1 bg-surface border border-outline-variant rounded text-primary font-body-sm text-body-sm hover:bg-surface-container-low transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

function warmupSummary(stock: TrackedStock) {
  const { warmup } = stock;
  if (warmup.running) {
    return (
      <span className="inline-flex items-center gap-1 text-primary">
        <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
        補資料中…
      </span>
    );
  }
  if (!warmup.last_finished_at) return DASH;
  return (
    <span className="flex flex-col">
      <span>{formatDateTime(warmup.last_finished_at)} 補完</span>
      <span className="text-on-surface-variant">
        日 K +{warmup.last_quote_rows ?? 0}／法人 +{warmup.last_trading_rows ?? 0}／融資券 +
        {warmup.last_margin_rows ?? 0}
      </span>
      {!!warmup.last_failures && (
        <span className="text-error">{warmup.last_failures} 次失敗，可再按一次補資料</span>
      )}
    </span>
  );
}

export default function TrackedStocks() {
  const navigate = useNavigate();
  const { setSymbol } = useSymbol();
  const [newSymbol, setNewSymbol] = useState('');
  const [adding, setAdding] = useState(false);
  const [busySymbol, setBusySymbol] = useState('');
  const [notice, setNotice] = useState('');

  // pollingMs 要靠上一輪的結果決定，所以第一次抓之後才可能開始輪詢，這是預期的。
  const [polling, setPolling] = useState(false);
  const { data, loading, error, reload } = useAsyncData(
    async () => {
      const items = await getTrackedStocks();
      setPolling(items.some((item) => item.warmup.running));
      return items;
    },
    [],
    { pollingMs: polling ? WARMUP_POLLING_MS : undefined }
  );
  const stocks = data ?? [];

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    const symbol = newSymbol.trim();
    if (!symbol) return;
    setAdding(true);
    setNotice('');
    try {
      const result = await addTrackedStock(symbol);
      setNewSymbol('');
      // 重複登記後端不當成錯誤，這裡要講不一樣的話，否則使用者會以為剛剛又補了一次。
      setNotice(
        !result
          ? '已送出，但後端沒有回傳結果，請重新整理確認'
          : result.already_exists
          ? `${result.symbol} ${result.name} 本來就在清單裡；要重補資料請按該列的「補資料」`
          : result.warming
          ? `已登記 ${result.symbol} ${result.name}，正在背景補歷史資料（約五到十分鐘）`
          : `已登記 ${result.symbol} ${result.name}，但別檔正在補資料，這檔沒有排進去——稍後按該列的「補資料」`
      );
      reload();
    } catch (err) {
      setNotice(apiErrorMessage(err, '登記失敗，請確認代號'));
    } finally {
      setAdding(false);
    }
  };

  const handleBackfill = async (stock: TrackedStock) => {
    setBusySymbol(stock.symbol);
    setNotice('');
    try {
      const result = await backfillTrackedStock(stock.symbol);
      setNotice(
        result?.started
          ? `${stock.symbol} ${stock.name} 開始補資料（約五到十分鐘）`
          : '別檔正在補資料（同時只補一檔，上游有限流），稍後再按'
      );
      reload();
    } catch (err) {
      setNotice(apiErrorMessage(err, '補資料失敗'));
    } finally {
      setBusySymbol('');
    }
  };

  const handleRemove = async (stock: TrackedStock) => {
    if (
      !window.confirm(
        `確定要把 ${stock.symbol} ${stock.name} 移出個股清單？之後不再收集，已經收下來的歷史資料會保留。`
      )
    )
      return;
    setBusySymbol(stock.symbol);
    setNotice('');
    try {
      const result = await removeTrackedStock(stock.symbol);
      setNotice(
        result && result.removed > 0 ? `已移除 ${stock.symbol}` : `${stock.symbol} 已不在清單裡`
      );
      reload();
    } catch (err) {
      // 409 是「還在自選股裡」，後端訊息是英文，換成使用者看得懂的下一步。
      const message = apiErrorMessage(err, '移除失敗');
      setNotice(
        message.includes('watchlist')
          ? `${stock.symbol} 還在自選股裡，請先到「自選股」頁移出，才能移出個股清單`
          : message
      );
    } finally {
      setBusySymbol('');
    }
  };

  const handleView = (symbol: string) => {
    setSymbol(symbol);
    navigate('/dashboard');
  };

  return (
    <>
      <PageHeader
        title="個股管理"
        subtitle={`共 ${stocks.length} 檔個股，其中 ${
          stocks.filter((s) => s.in_watchlist).length
        } 檔在自選股`}
        right={
          <button type="button" onClick={reload} className={secondaryButton}>
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            重新整理
          </button>
        }
      />

      <div className="flex flex-col gap-stack-lg">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          個股是要持續收集資料（收盤、法人、融資券）的檔。自選股一定是個股，個股不一定在自選股——
          想先把資料收起來觀察、又不想進收盤彙總與 LINE 推播的，登記在這裡就好。
          「最新收盤日」的破折號代表一筆收盤都沒有：還沒補、補失敗，或這檔是興櫃（交易所 OpenAPI 不含）。
          補資料只補沒有的日子，重按是安全的；同時只補一檔，因為上游有限流。
        </p>

        <form
          onSubmit={handleAdd}
          className="flex flex-wrap items-center gap-stack-sm bg-surface-container-lowest border border-outline-variant rounded-xl p-4 shadow-sm"
        >
          <label className="font-label-caps text-label-caps text-on-surface-variant uppercase">
            新增個股
          </label>
          <input
            value={newSymbol}
            onChange={(event) => setNewSymbol(event.target.value)}
            placeholder="股票代號，例如 6488"
            className="w-52 px-3 py-2 bg-surface-container border border-outline-variant rounded font-data-md text-data-md text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={!newSymbol.trim() || adding}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-primary rounded text-on-primary font-body-md text-body-md hover:bg-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            {adding ? '登記中…' : '登記並補資料'}
          </button>
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            代號會先向報價來源驗證；登記後立刻在背景補約五個月日 K 與兩個月法人、融資券。
          </span>
        </form>

        {notice && (
          <p role="status" className="font-body-sm text-body-sm text-on-surface-variant">
            {notice}
          </p>
        )}

        {loading && !data && <PageState kind="loading" />}
        {error && <PageState kind="error" message={error} onRetry={reload} />}
        {!loading && !error && stocks.length === 0 && (
          <PageState
            kind="empty"
            message="個股清單是空的"
            hint="用上面的欄位登記一檔，或到「自選股」加一檔——自選股會自動成為個股。"
          />
        )}

        {stocks.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low border-b border-outline-variant">
                <tr>
                  <th className="p-2 pl-4 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">
                    代號 / 名稱
                  </th>
                  <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">
                    市場
                  </th>
                  <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">
                    自選股
                  </th>
                  <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-right">
                    最新收盤日
                  </th>
                  <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">
                    補資料
                  </th>
                  <th className="p-2 pr-4 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-right">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {stocks.map((stock) => (
                  <tr
                    key={stock.symbol}
                    className="hover:bg-surface-container-low/50 transition-colors"
                  >
                    <td className="p-2 pl-4 py-3 whitespace-nowrap">
                      <span className="font-data-md text-data-md text-primary font-bold">
                        {stock.symbol}
                      </span>
                      <span className="ml-2 font-body-sm text-body-sm text-on-surface-variant">
                        {stock.name || DASH}
                      </span>
                    </td>
                    <td className="p-2 py-3 font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                      {marketLabel(stock.market)}
                    </td>
                    <td className="p-2 py-3 whitespace-nowrap">
                      {stock.in_watchlist ? (
                        <span className="px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container font-body-sm text-body-sm">
                          自選
                        </span>
                      ) : (
                        <span className="text-outline">{DASH}</span>
                      )}
                    </td>
                    <td className="p-2 py-3 text-right font-data-md text-data-md whitespace-nowrap">
                      {formatDate(stock.latest_quote_date)}
                    </td>
                    <td className="p-2 py-3 font-body-sm text-body-sm">{warmupSummary(stock)}</td>
                    <td className="p-2 pr-4 py-3 whitespace-nowrap">
                      <div className="flex justify-end gap-stack-sm">
                        <button
                          type="button"
                          onClick={() => handleView(stock.symbol)}
                          className={secondaryButton}
                        >
                          查看
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBackfill(stock)}
                          disabled={
                            busySymbol === stock.symbol ||
                            stock.warmup.running ||
                            stock.warmup.busy
                          }
                          title={stock.warmup.busy ? '別檔正在補資料，稍後再按' : undefined}
                          className={secondaryButton}
                        >
                          補資料
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(stock)}
                          disabled={busySymbol === stock.symbol || stock.in_watchlist}
                          title={
                            stock.in_watchlist
                              ? '還在自選股裡，請先到自選股頁移出'
                              : '移出個股清單（歷史資料保留）'
                          }
                          className={`${secondaryButton} !text-error`}
                        >
                          移除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
