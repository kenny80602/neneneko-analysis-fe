import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import RangeFilter from '../components/RangeFilter';
import SymbolSearch from '../components/SymbolSearch';
import { collectWarnings, getWarningHistory } from '../api/warning';
import { apiErrorMessage } from '../api/request';
import { HistoryParams } from '../api/types';
import { useSymbol } from '../context/SymbolContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { formatNumber, formatPrice, marketLabel } from '../utils/format';

export default function Warnings() {
  const { symbol } = useSymbol();
  const [params, setParams] = useState<HistoryParams>({ limit: 60 });
  const [collecting, setCollecting] = useState(false);
  const [notice, setNotice] = useState('');

  const { data, loading, error, reload } = useAsyncData(
    () => getWarningHistory(symbol, params),
    [symbol, params.from, params.to, params.limit],
    { enabled: !!symbol }
  );

  const handleCollect = async () => {
    setCollecting(true);
    setNotice('');
    try {
      const result = await collectWarnings();
      setNotice(`已收集 ${result?.saved ?? 0} 檔`);
      if (symbol) reload();
    } catch (err) {
      setNotice(apiErrorMessage(err, '收集失敗'));
    } finally {
      setCollecting(false);
    }
  };

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="注意股"
        icon="warning"
        subtitle={
          symbol
            ? `${symbol}${data?.name ? ` ${data.name}` : ''}${
                data?.market ? ` · ${marketLabel(data.market)}` : ''
              }`
            : undefined
        }
        right={
          <>
            {notice && <span className="font-body-sm text-body-sm text-on-surface-variant">{notice}</span>}
            <RangeFilter value={params} onChange={setParams} />
            <SymbolSearch />
            <button
              onClick={handleCollect}
              disabled={collecting}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-primary rounded text-on-primary font-body-md text-body-md hover:bg-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {collecting ? '收集中…' : '立即收集'}
            </button>
          </>
        }
      />

      <div className="flex flex-col gap-stack-lg">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          「注意股」是交易所對異常交易的公開提醒，不是處置股——被列注意不影響交易方式，
          但短期內累計次數往上跳就離處置（分盤交易）不遠了。累計次數只有上市有。
          上游收盤後才更新，盤中按「立即收集」會拿到前一個交易日的內容。
        </p>

        {!symbol && <PageState kind="idle" hint="在右上角輸入股票代號，或從左側自選股清單挑一檔。" />}
        {symbol && loading && <PageState kind="loading" />}
        {symbol && error && <PageState kind="error" message={error} onRetry={reload} />}
        {symbol && !loading && !error && items.length === 0 && (
          <PageState
            kind="empty"
            message="沒有被列注意的紀錄"
            hint="這是好消息：多數個股從來沒被列過注意。"
          />
        )}

        {items.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low border-b border-outline-variant">
                <tr>
                  <th className="p-2 pl-4 text-left font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">公告日</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">收盤價</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">本益比</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">累計次數</th>
                  <th className="p-2 text-left font-label-caps text-label-caps text-on-surface-variant uppercase">注意交易資訊</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {items.map((row) => (
                  <tr
                    key={`${row.date}-${row.reason}`}
                    className="hover:bg-surface-container-low/50 transition-colors"
                  >
                    <td className="p-2 pl-4 py-3 whitespace-nowrap font-data-md text-data-md text-on-surface align-top">
                      {row.date}
                    </td>
                    <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface align-top">
                      {formatPrice(row.close_price)}
                    </td>
                    <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface align-top">
                      {formatNumber(row.pe_ratio, 2)}
                    </td>
                    <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface align-top">
                      {formatNumber(row.announcement_count)}
                    </td>
                    {/* 觸發原因（款次）比「有沒有被列」重要，不截斷。 */}
                    <td className="p-2 py-3 font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                      {row.reason}
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
