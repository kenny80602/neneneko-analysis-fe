import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import TrendChart from '../components/TrendChart';
import RangeFilter from '../components/RangeFilter';
import SymbolSearch from '../components/SymbolSearch';
import { getMarginHistory } from '../api/margin';
import { getDailyQuoteHistory } from '../api/dailyQuote';
import { HistoryParams } from '../api/types';
import { useSymbol } from '../context/SymbolContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { DASH, formatNumber, formatPercent, formatSigned, quoteColor } from '../utils/format';
import { VOLUME_WINDOW, computeMarginTurnover } from '../utils/marginTurnover';

export default function Margin() {
  const { symbol } = useSymbol();
  const [params, setParams] = useState<HistoryParams>({ limit: 60 });

  const { data, loading, error, reload } = useAsyncData(
    () => getMarginHistory(symbol, params),
    [symbol, params.from, params.to, params.limit],
    { enabled: !!symbol }
  );

  // 收盤行情只拿來算「占量」兩欄。多抓一個均量視窗，最前面那幾天才有 20 日均量可以除；
  // 這支失敗不該讓融資融券整頁掛掉，所以不吃它的 error，算不出來就是破折號。
  const { data: quoteData } = useAsyncData(
    () =>
      getDailyQuoteHistory(symbol, {
        ...params,
        limit: params.limit ? params.limit + VOLUME_WINDOW - 1 : undefined,
      }),
    [symbol, params.from, params.to, params.limit],
    { enabled: !!symbol }
  );

  const balances = data?.balances ?? [];
  const turnover = computeMarginTurnover(balances, quoteData?.quotes ?? []);

  return (
    <>
      <PageHeader
        title="融資融券"
        icon="account_balance"
        subtitle={symbol ? `${symbol} · ${data?.count ?? 0} 筆` : undefined}
        right={
          <>
            <RangeFilter value={params} onChange={setParams} />
            <SymbolSearch />
          </>
        }
      />

      <div className="flex flex-col gap-stack-lg">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          數量單位為張。券資比＝融券餘額 ÷ 融資餘額 × 100，是判斷軋空的常用指標；
          使用率只有上櫃公布，上市顯示破折號代表「這個市場沒有這個數字」，不是 0。
          「融資占量」＝ 融資餘額 ÷ 近 20 日平均成交量，單位是天，代表融資部位約等於幾天的量，
          越高代表套牢的融資越多；「互抵占量」＝ 資券互抵 ÷ 當日成交量，資券互抵只含信用交易的當沖，
          現股當沖不在裡面，所以是當沖比的下限。兩欄是風險提示，沒有檢定過的門檻，不是買賣訊號；
          破折號是當天沒有收盤行情，或均量不滿 20 個交易日。
        </p>

        {!symbol && <PageState kind="idle" hint="在右上角輸入股票代號，或從左側自選股清單挑一檔。" />}
        {symbol && loading && <PageState kind="loading" />}
        {symbol && error && <PageState kind="error" message={error} onRetry={reload} />}
        {symbol && !loading && !error && balances.length === 0 && (
          <PageState
            kind="empty"
            message="沒有融資融券資料"
            hint="沒有信用交易資格的個股（新上市未滿六個月、全額交割股等）本來就不在這份表裡；也可能是那幾天還沒收集。"
          />
        )}

        {balances.length > 0 && (
          <section className="flex flex-col gap-stack-md rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm p-4">
            <h2 className="font-headline-md text-headline-md text-primary">餘額走勢</h2>
            {/* 後端給的是日期由新到舊，畫圖要由舊到新，所以整個反過來。 */}
            <TrendChart
              mode="line"
              unit="張"
              series={[
                {
                  label: '融資餘額',
                  className: 'stroke-quote-up',
                  points: [...balances].reverse().map((b) => ({
                    date: b.date,
                    value: b.margin_balance,
                  })),
                },
                {
                  label: '融券餘額',
                  className: 'stroke-quote-down',
                  dash: '8 5',
                  points: [...balances].reverse().map((b) => ({
                    date: b.date,
                    value: b.short_balance,
                  })),
                },
              ]}
              footnote="融資餘額往上代表散戶用槓桿加碼，融券往上代表看空的部位變多。兩條線的量級常常差很多（融券通常小得多），同軸相比只看得出各自的走勢，不要拿高低直接互比。"
            />
          </section>
        )}

        {balances.length > 0 && (
          <section className="flex flex-col gap-stack-md rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm p-4">
            <h2 className="font-headline-md text-headline-md text-primary">每日增減</h2>
            <TrendChart
              mode="bar"
              unit="張"
              series={[
                {
                  label: '融資增減',
                  points: [...balances].reverse().map((b) => ({
                    date: b.date,
                    value: b.margin_change,
                  })),
                },
              ]}
              footnote="融資增減＝當日融資餘額 − 前一日。紅柱是散戶加碼、綠柱是減碼（台股慣例漲紅跌綠）。股價漲但融資大減，通常代表籌碼從散戶手上換到法人手上。"
            />
          </section>
        )}

        {balances.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low border-b border-outline-variant">
                <tr>
                  <th className="p-2 pl-4 text-left font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">日期</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">融資餘額</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">融資增減</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">融資使用率</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">融券餘額</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">融券增減</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">券資比</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">資券互抵</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">融資占量（天）</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">互抵占量</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {balances.map((row) => (
                  <tr
                    key={row.date}
                    className="hover:bg-surface-container-low/50 transition-colors"
                  >
                    <td className="p-2 pl-4 py-3 whitespace-nowrap font-data-md text-data-md text-on-surface">{row.date}</td>
                    <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface">
                      {formatNumber(row.margin_balance)}
                    </td>
                    {/* 融資增減正數＝散戶加碼，用漲跌色標示方向。 */}
                    <td className={`p-2 py-3 text-right font-data-md text-data-md ${quoteColor(row.margin_change)}`}>
                      {formatSigned(row.margin_change, 0)}
                    </td>
                    <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface-variant">
                      {formatPercent(row.margin_utilization_rate)}
                    </td>
                    <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface">
                      {formatNumber(row.short_balance)}
                    </td>
                    <td className={`p-2 py-3 text-right font-data-md text-data-md ${quoteColor(row.short_change)}`}>
                      {formatSigned(row.short_change, 0)}
                    </td>
                    <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface">
                      {formatPercent(row.short_margin_ratio)}
                    </td>
                    <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface-variant">
                      {formatNumber(row.offsetting)}
                    </td>
                    <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface-variant">
                      {turnover.get(row.date)?.marginDays == null
                        ? DASH
                        : formatNumber(turnover.get(row.date)!.marginDays, 1)}
                    </td>
                    <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface-variant">
                      {formatPercent(turnover.get(row.date)?.offsetPct)}
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
