import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import { getBelowMA } from '../api/dailyQuote';
import { useSymbol } from '../context/SymbolContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { useSymbolGroups } from '../hooks/useSymbolGroups';
import { formatNumber, formatPrice, formatRank, formatSignedPercent, marketLabel, quoteColor } from '../utils/format';

export default function BelowMA() {
  const { setSymbol } = useSymbol();
  const groups = useSymbolGroups();
  // 不輪詢：後端逐檔讀 60 個成交日，檔數多時比其他讀取端點慢，讓使用者按重新整理。
  const { data, loading, error, reload } = useAsyncData(() => getBelowMA(), []);

  const items = data?.items ?? [];
  const asOf = Object.entries(data?.as_of ?? {})
    .map(([market, date]) => `${marketLabel(market)} ${date}`)
    .join('、');
  // insufficient 偏高代表歷史沒補齊，名單偏短不是市場沒有弱勢股。
  const insufficient = data?.insufficient ?? 0;

  return (
    <>
      <PageHeader
        title="季線以下"
        icon="trending_down"
        subtitle={asOf ? `資料日期 ${asOf}` : undefined}
        right={
          <button
            onClick={reload}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-surface border border-outline-variant rounded text-primary font-body-md text-body-md hover:bg-surface-container-low transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            重新整理
          </button>
        }
      />

      <div className="flex flex-col gap-stack-lg">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          季線 = 最近 60 個成交日收盤價的簡單平均（未還原，除權息會有偏差）；乖離 = 收盤相對季線的百分比，
          越負離季線越遠。範圍只有已落地收盤行情的那批（自選股加半導體族群），不是全市場。
          收盤在季線以下是現況描述，不是買賣訊號。族群是自己在「主題族群」建的，破折號代表沒歸進任何族群。成交金額名次是最新一天在同市場普通股裡的名次，沒有名次（ETF、回補進來的日期）顯示破折號。
        </p>

        {data && (
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            算得出季線 {formatNumber(data.scanned)} 檔，其中 {formatNumber(data.count)} 檔在季線以下
            {insufficient > 0 && (
              <span className={insufficient > data.scanned ? 'text-error' : ''}>
                ；另有 {formatNumber(insufficient)} 檔成交日不到 60 天、算不出季線而未納入
                {insufficient > data.scanned && '（歷史還沒補齊，名單只涵蓋少數檔）'}
              </span>
            )}
          </p>
        )}

        {loading && <PageState kind="loading" />}
        {error && <PageState kind="error" message={error} onRetry={reload} />}
        {!loading && !error && items.length === 0 && (
          <PageState
            kind="empty"
            message="目前沒有收盤在季線以下的股票"
            hint="可能真的都在季線之上，也可能是歷史收盤還沒補齊、多數檔算不出季線（看上方「未納入」的檔數）。"
          />
        )}

        {items.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low border-b border-outline-variant">
                <tr>
                  <th className="p-2 pl-4 text-left font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">代號</th>
                  <th className="p-2 text-left font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">名稱</th>
                  <th className="p-2 text-left font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">族群</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">收盤</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">季線</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">乖離</th>
                  <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">成交金額名次</th>
                  <th className="p-2 pr-4 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">日期</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {items.map((row) => (
                  <tr
                    key={row.symbol}
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
                    <td className="p-2 py-3 font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                      {groups.get(row.symbol)?.join('、') ?? '—'}
                    </td>
                    <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface font-bold">
                      {formatPrice(row.close)}
                    </td>
                    <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface-variant">
                      {formatPrice(row.ma60)}
                    </td>
                    <td className={`p-2 py-3 text-right font-data-md text-data-md ${quoteColor(row.gap_pct)}`}>
                      {formatSignedPercent(row.gap_pct)}
                    </td>
                    <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface whitespace-nowrap">
                      {formatRank(row.trade_value_rank, row.trade_value_rank_total)}
                    </td>
                    <td className="p-2 pr-4 py-3 text-right font-data-md text-data-md text-on-surface-variant whitespace-nowrap">
                      {row.date}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.caveats.length > 0 && (
          <ul className="list-disc pl-5 font-body-sm text-body-sm text-on-surface-variant">
            {data.caveats.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
