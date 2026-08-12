import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import RangeFilter from '../components/RangeFilter';
import SymbolSearch from '../components/SymbolSearch';
import { getRevenueHistory } from '../api/revenue';
import { HistoryParams } from '../api/types';
import { useSymbol } from '../context/SymbolContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { formatDate, formatSignedPercent, formatThousandTWD, marketLabel, quoteColor } from '../utils/format';

export default function Revenue() {
  const { symbol } = useSymbol();
  const [params, setParams] = useState<HistoryParams>({ limit: 24 });

  const { data, loading, error, reload } = useAsyncData(
    () => getRevenueHistory(symbol, params),
    [symbol, params.from, params.to, params.limit],
    { enabled: !!symbol }
  );

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="月營收"
        icon="receipt_long"
        subtitle={
          symbol
            ? `${symbol}${data?.name ? ` ${data.name}` : ''}${
                data?.market ? ` · ${marketLabel(data.market)}` : ''
              }${data?.industry ? ` · ${data.industry}` : ''}`
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
          金額為新台幣（上游單位千元，此頁已換算顯示）。此頁不限自選股，全市場都查得到。
          查詢區間一樣填 YYYY-MM-DD，但比對的是月份：from 落在哪個月，那整個月就會被包含進來。
        </p>

        {!symbol && <PageState kind="idle" hint="在右上角輸入股票代號，或從左側自選股清單挑一檔。" />}
        {symbol && loading && <PageState kind="loading" />}
        {symbol && error && <PageState kind="error" message={error} onRetry={reload} />}
        {symbol && !loading && !error && items.length === 0 && (
          <PageState
            kind="empty"
            message="沒有營收資料"
            hint="這檔可能不存在，或那段期間還沒收集到。"
          />
        )}

        {items.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low border-b border-outline-variant">
                <tr>
                  <th className="p-2 pl-4 text-left font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">月份</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">當月營收</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">月增率</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">年增率</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">累計營收</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">累計年增率</th>
                  <th className="p-2 text-left font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">出表日</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {items.map((row) => (
                  <tr
                    key={row.month}
                    className="hover:bg-surface-container-low/50 transition-colors"
                  >
                    <td className="p-2 pl-4 py-3 whitespace-nowrap font-data-md text-data-md text-on-surface font-bold">
                      {row.month}
                    </td>
                    <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface">
                      {formatThousandTWD(row.revenue)}
                    </td>
                    <td className={`p-2 py-3 text-right font-data-md text-data-md ${quoteColor(row.mom)}`}>
                      {formatSignedPercent(row.mom)}
                    </td>
                    <td className={`p-2 py-3 text-right font-data-md text-data-md ${quoteColor(row.yoy)}`}>
                      {formatSignedPercent(row.yoy)}
                    </td>
                    <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface">
                      {formatThousandTWD(row.accumulated)}
                    </td>
                    <td className={`p-2 py-3 text-right font-data-md text-data-md ${quoteColor(row.accumulated_yoy)}`}>
                      {formatSignedPercent(row.accumulated_yoy)}
                    </td>
                    <td className="p-2 py-3 whitespace-nowrap font-body-sm text-body-sm text-on-surface-variant">
                      {formatDate(row.report_date)}
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
