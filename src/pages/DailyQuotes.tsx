import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import { collectDailyQuotes, getDailyQuotesByDate } from '../api/dailyQuote';
import { apiErrorMessage } from '../api/request';
import { useSymbol } from '../context/SymbolContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { formatNumber, formatPrice, formatSigned, marketLabel, quoteColor, today } from '../utils/format';

export default function DailyQuotes() {
  const { setSymbol } = useSymbol();
  // 空字串代表不帶 date：後端會回目前收集到最新的那一天，
  // 用「今天」當預設的話，假日與收集之前都會是空清單，看起來像壞掉。
  const [date, setDate] = useState('');
  const { data, loading, error, reload } = useAsyncData(() => getDailyQuotesByDate(date || undefined), [date]);
  const [collecting, setCollecting] = useState(false);
  const [notice, setNotice] = useState('');

  const handleCollect = async () => {
    setCollecting(true);
    setNotice('');
    try {
      const result = await collectDailyQuotes();
      const missing = result?.missing?.length ?? 0;
      setNotice(
        `已收集 ${result?.date || '—'}：存 ${result?.saved ?? 0}/${result?.wanted ?? 0} 檔` +
          (missing ? `，${missing} 檔上游沒給` : '')
      );
      reload();
    } catch (err) {
      setNotice(apiErrorMessage(err, '收集失敗'));
    } finally {
      setCollecting(false);
    }
  };

  const quotes = data?.quotes ?? [];

  return (
    <>
      <PageHeader
        title="每日收盤"
        icon="table_rows"
        subtitle={data?.date ? `資料日期 ${data.date}` : undefined}
        right={
          <>
            <input
              type="date"
              value={date}
              max={today()}
              onChange={(event) => setDate(event.target.value)}
              className="px-2 py-2 bg-surface-container border border-outline-variant rounded font-body-sm text-body-sm text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {date && (
              <button
                onClick={() => setDate('')}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-surface border border-outline-variant rounded text-primary font-body-md text-body-md hover:bg-surface-container-low transition-colors"
              >
                最新
              </button>
            )}
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
          「立即收集」會打上游並寫入資料庫，同時順帶收三大法人、融資融券與估值；
          同一天重跑是覆蓋而不是新增，補資料可以放心重跑。
          {notice && <span className="ml-2 text-on-surface-variant">{notice}</span>}
        </p>

        {loading && <PageState kind="loading" />}
        {error && <PageState kind="error" message={error} onRetry={reload} />}
        {!loading && !error && quotes.length === 0 && (
          <PageState
            kind="empty"
            message="這一天沒有收盤資料"
            hint="可能是非交易日，或那天還沒收集。收盤行情只落地自選股清單裡的檔。"
          />
        )}

        {quotes.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low border-b border-outline-variant">
                <tr>
                  <th className="p-2 pl-4 text-left font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">代號</th>
                  <th className="p-2 text-left font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">名稱</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">開盤</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">最高</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">最低</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">收盤</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">漲跌</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">成交量</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">成交筆數</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {quotes.map((row) => (
                  <tr
                    key={`${row.symbol}-${row.date}`}
                    onClick={() => setSymbol(row.symbol)}
                    className="hover:bg-surface-container-low/50 transition-colors cursor-pointer"
                    title="點擊設為目前選取的股票"
                  >
                    <td className="p-2 pl-4 py-3 font-data-md text-data-md text-primary font-bold whitespace-nowrap">
                      {row.symbol}
                      <span className="ml-2 font-body-sm text-body-sm text-on-surface-variant">
                        {marketLabel(row.market)}
                      </span>
                    </td>
                    <td className="p-2 py-3 font-body-md text-body-md text-on-surface whitespace-nowrap">{row.name}</td>
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
                        <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface-variant">
                          {formatNumber(row.transaction_count)}
                        </td>
                      </>
                    ) : (
                      <td colSpan={7} className="p-2 py-3 text-right font-body-sm text-body-sm text-outline">
                        當日無成交
                      </td>
                    )}
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
