import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import RangeFilter from '../components/RangeFilter';
import SymbolSearch from '../components/SymbolSearch';
import { getValuationHistory } from '../api/valuation';
import { HistoryParams } from '../api/types';
import { useSymbol } from '../context/SymbolContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { formatNumber, formatPercent, marketLabel } from '../utils/format';

export default function Valuation() {
  const { symbol } = useSymbol();
  const [params, setParams] = useState<HistoryParams>({ limit: 60 });

  const { data, loading, error, reload } = useAsyncData(
    () => getValuationHistory(symbol, params),
    [symbol, params.from, params.to, params.limit],
    { enabled: !!symbol }
  );

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="估值指標"
        icon="calculate"
        subtitle={
          symbol
            ? `${symbol}${data?.name ? ` ${data.name}` : ''}${
                data?.market ? ` · ${marketLabel(data.market)}` : ''
              }`
            : undefined
        }
        right={
          <>
            <RangeFilter value={params} onChange={setParams} />
            <SymbolSearch />
          </>
        }
      />

      <div className="flex flex-col gap-stack-lg">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          破折號代表「沒有這個值」：虧損的公司算不出本益比、沒配息的沒有殖利率。
          每股股利只有上櫃公布，上市固定沒有。
        </p>

        {!symbol && <PageState kind="idle" hint="在右上角輸入股票代號，或從左側自選股清單挑一檔。" />}
        {symbol && loading && <PageState kind="loading" />}
        {symbol && error && <PageState kind="error" message={error} onRetry={reload} />}
        {symbol && !loading && !error && items.length === 0 && (
          <PageState
            kind="empty"
            message="沒有估值資料"
            hint="ETF 與剛上市的個股沒有本益比可算，本來就不在上游那兩份表裡；也可能是那幾天還沒收集。"
          />
        )}

        {items.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low border-b border-outline-variant">
                <tr>
                  <th className="p-2 pl-4 text-left font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">日期</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">本益比</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">殖利率</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">股價淨值比</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">每股股利</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {items.map((row) => (
                  <tr
                    key={row.date}
                    className="hover:bg-surface-container-low/50 transition-colors"
                  >
                    <td className="p-2 pl-4 py-3 whitespace-nowrap font-data-md text-data-md text-on-surface">{row.date}</td>
                    <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface">
                      {formatNumber(row.pe_ratio, 2)}
                    </td>
                    <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface">
                      {formatPercent(row.dividend_yield)}
                    </td>
                    <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface">
                      {formatNumber(row.pb_ratio, 2)}
                    </td>
                    <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface-variant">
                      {formatNumber(row.dividend_per_share, 2)}
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
