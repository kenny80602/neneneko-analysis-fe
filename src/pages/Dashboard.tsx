import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import StatCard from '../components/StatCard';
import SymbolSearch from '../components/SymbolSearch';
import { getDailyQuoteHistory } from '../api/dailyQuote';
import { getRealtimeQuote } from '../api/realtimeQuote';
import { useSymbol } from '../context/SymbolContext';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  formatDateTime,
  formatNumber,
  formatPrice,
  formatSigned,
  formatSignedPercent,
  marketLabel,
  priceSourceLabel,
  quoteColor,
} from '../utils/format';

// 個股總覽：上方即時報價（30 秒輪詢），下方最近十個交易日的收盤。
// 輪詢間隔別再壓短——即時報價是直接打證交所 MIS，上游有限流。
const POLLING_MS = 30_000;

export default function Dashboard() {
  const { symbol } = useSymbol();

  const quote = useAsyncData(() => getRealtimeQuote(symbol), [symbol], {
    enabled: !!symbol,
    pollingMs: POLLING_MS,
  });

  const history = useAsyncData(() => getDailyQuoteHistory(symbol, { limit: 10 }), [symbol], {
    enabled: !!symbol,
  });

  return (
    <>
      <PageHeader
        title="個股總覽"
        icon="monitoring"
        subtitle={
          quote.data ? `${quote.data.name}（${marketLabel(quote.data.market)}）` : undefined
        }
        right={<SymbolSearch />}
      />

      <div className="flex flex-col gap-stack-lg">
        {!symbol && <PageState kind="idle" hint="在右上角輸入股票代號，或從左側自選股清單挑一檔。" />}

        {symbol && quote.loading && !quote.data && <PageState kind="loading" />}

        {symbol && quote.error && (
          <PageState kind="error" message={quote.error} onRetry={quote.reload} />
        )}

        {symbol && quote.data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="現價"
                icon="payments"
                value={quote.data.traded || quote.data.price != null ? formatPrice(quote.data.price) : '暫無報價'}
                valueClassName={quoteColor(quote.data.change)}
                hint={`${priceSourceLabel(quote.data.price_source)} · ${formatDateTime(
                  quote.data.price_as_of
                )}`}
              />
              <StatCard
                label="漲跌"
                icon="trending_up"
                value={formatSigned(quote.data.change)}
                valueClassName={quoteColor(quote.data.change)}
                hint={formatSignedPercent(quote.data.change_percent)}
              />
              <StatCard
                label="今日區間"
                icon="expand"
                value={`${formatPrice(quote.data.low)} – ${formatPrice(quote.data.high)}`}
                hint={`開盤 ${formatPrice(quote.data.open)} · 昨收 ${formatPrice(
                  quote.data.previous_close
                )}`}
              />
              <StatCard
                label="成交量"
                icon="bar_chart"
                value={formatNumber(quote.data.volume)}
                hint={quote.data.traded ? '股' : '當日尚無成交'}
              />
            </div>

            <p className="font-body-sm text-body-sm text-on-surface-variant">
              報價時間 {formatDateTime(quote.data.quote_time)}，每 {POLLING_MS / 1000} 秒更新。
              現價來源不是「成交價」時，代表這不是本次快照撮合出來的價格。
            </p>
          </>
        )}

        {symbol && (
          <section className="mt-8">
            <h3 className="font-headline-md text-headline-md text-primary">最近收盤</h3>

            {history.loading && <PageState kind="loading" />}
            {history.error && (
              <PageState kind="error" message={history.error} onRetry={history.reload} />
            )}
            {!history.loading && !history.error && history.data?.quotes.length === 0 && (
              <PageState
                kind="empty"
                message="沒有收盤資料"
                hint="收盤行情只落地自選股清單裡的檔。這檔可能不在清單內，或那幾天還沒收集——可到「每日收盤」頁手動觸發收集。"
              />
            )}

            {!!history.data?.quotes.length && (
              <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-surface-container-low border-b border-outline-variant">
                    <tr>
                      <th className="p-2 pl-4 text-left font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">日期</th>
                      <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">開盤</th>
                      <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">最高</th>
                      <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">最低</th>
                      <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">收盤</th>
                      <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">漲跌</th>
                      <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">成交量</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/50">
                    {history.data.quotes.map((row) => (
                      <tr
                        key={row.date}
                        className="hover:bg-surface-container-low/50 transition-colors"
                      >
                        <td className="p-2 pl-4 py-3 whitespace-nowrap font-data-md text-data-md text-on-surface">
                          {row.date}
                          {row.ex_dividend && (
                            <span className="ml-2 px-1.5 py-0.5 font-body-sm text-body-sm rounded bg-surface-container text-on-surface-variant">
                              除權息
                            </span>
                          )}
                        </td>
                        {/* 未成交那天價格全是 0，逐欄畫 0.00 會被讀成真的跌到零。 */}
                        {row.traded ? (
                          <>
                            <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface">
                              {formatPrice(row.open)}
                            </td>
                            <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface">
                              {formatPrice(row.high)}
                            </td>
                            <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface">
                              {formatPrice(row.low)}
                            </td>
                            <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface font-bold">
                              {formatPrice(row.close)}
                            </td>
                            <td className={`p-2 py-3 text-right font-data-md text-data-md ${quoteColor(row.change)}`}>
                              {row.ex_dividend ? '除權息' : formatSigned(row.change)}
                            </td>
                            <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface-variant">
                              {formatNumber(row.volume)}
                            </td>
                          </>
                        ) : (
                          <td colSpan={6} className="p-2 py-3 text-right font-body-sm text-body-sm text-outline">
                            當日無成交
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}
