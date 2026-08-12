import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import RangeFilter from '../components/RangeFilter';
import SymbolSearch from '../components/SymbolSearch';
import { getInstitutionalHistory } from '../api/institutional';
import { HistoryParams } from '../api/types';
import { useSymbol } from '../context/SymbolContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { formatShareToLot, quoteColor } from '../utils/format';

export default function Institutional() {
  const { symbol } = useSymbol();
  const [params, setParams] = useState<HistoryParams>({ limit: 60 });

  const { data, loading, error, reload } = useAsyncData(
    () => getInstitutionalHistory(symbol, params),
    [symbol, params.from, params.to, params.limit],
    { enabled: !!symbol }
  );

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="三大法人"
        icon="groups"
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
          數量單位為張（上游給的是股，此頁已換算）。目前只會有上市的資料——
          上櫃三大法人的上游沒有日期參數，收不了歷史。
        </p>

        {!symbol && <PageState kind="idle" hint="在右上角輸入股票代號，或從左側自選股清單挑一檔。" />}
        {symbol && loading && <PageState kind="loading" />}
        {symbol && error && <PageState kind="error" message={error} onRetry={reload} />}
        {symbol && !loading && !error && items.length === 0 && (
          <PageState
            kind="empty"
            message="沒有法人資料"
            hint="這檔可能不在自選股清單、區間內都是非交易日，或那幾天還沒收集。"
          />
        )}

        {items.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low border-b border-outline-variant">
                <tr>
                  <th className="p-2 pl-4 text-left font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">日期</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">外資</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">投信</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">自營商</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">自營（自行）</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">自營（避險）</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">三大法人合計</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {items.map((row) => (
                  <tr
                    key={row.date}
                    className="hover:bg-surface-container-low/50 transition-colors"
                  >
                    <td className="p-2 pl-4 py-3 whitespace-nowrap font-data-md text-data-md text-on-surface">{row.date}</td>
                    <td
                      className={`p-2 py-3 text-right font-data-md text-data-md ${quoteColor(
                        row.foreign_excluding_dealers.net
                      )}`}
                    >
                      {formatShareToLot(row.foreign_excluding_dealers.net)}
                    </td>
                    <td className={`p-2 py-3 text-right font-data-md text-data-md ${quoteColor(row.investment_trust.net)}`}>
                      {formatShareToLot(row.investment_trust.net)}
                    </td>
                    <td className={`p-2 py-3 text-right font-data-md text-data-md ${quoteColor(row.dealers_net)}`}>
                      {formatShareToLot(row.dealers_net)}
                    </td>
                    <td
                      className={`p-2 py-3 text-right font-data-md text-data-md ${quoteColor(
                        row.dealers_proprietary.net
                      )}`}
                    >
                      {formatShareToLot(row.dealers_proprietary.net)}
                    </td>
                    <td className={`p-2 py-3 text-right font-data-md text-data-md ${quoteColor(row.dealers_hedge.net)}`}>
                      {formatShareToLot(row.dealers_hedge.net)}
                    </td>
                    <td
                      className={`p-2 py-3 text-right font-data-md text-data-md font-bold ${quoteColor(row.total_net)}`}
                    >
                      {formatShareToLot(row.total_net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {items.length > 0 && (
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            「三大法人合計」不含外資自營商（已計入自營商），前幾欄相加不等於這一欄。
          </p>
        )}
      </div>
    </>
  );
}
