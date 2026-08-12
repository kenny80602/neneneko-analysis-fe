import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import StatCard from '../components/StatCard';
import { getTPExMarketHighlight } from '../api/tpex';
import {
  getTWSEAdvanceDeclineSummaries,
  getTWSEInstitutionalSummaries,
  getTWSEMarketTradings,
} from '../api/twse';
import { useAsyncData } from '../hooks/useAsyncData';
import { formatAmount, formatNumber, formatSigned, quoteColor } from '../utils/format';

// 大盤總覽。這幾支都是「即時打交易所 OpenAPI」、不落地且受上游限流，
// 所以不輪詢，要更新請按右上角重新整理。
export default function Market() {
  const twse = useAsyncData(() => getTWSEMarketTradings(), []);
  const advanceDecline = useAsyncData(() => getTWSEAdvanceDeclineSummaries(), []);
  const institutional = useAsyncData(() => getTWSEInstitutionalSummaries(), []);
  const tpex = useAsyncData(() => getTPExMarketHighlight(), []);

  // 上游回的是陣列且日期由舊到新不一定固定，取最後一筆當「最新」不保險，
  // 直接依日期字串（YYYY-MM-DD 可字典序比較）挑最大的那筆。
  const latestTwse = twse.data?.reduce(
    (latest, row) => (!latest || row.date > latest.date ? row : latest),
    undefined as (typeof twse.data)[number] | undefined
  );

  // 漲跌家數分「整體市場」與「股票」等統計範圍，兩者不可相加；這裡只取股票那列。
  const stockAdvanceDecline = advanceDecline.data?.find((row) => row.category.includes('股票'));

  const loading = twse.loading || advanceDecline.loading || institutional.loading || tpex.loading;
  const error = twse.error || advanceDecline.error || institutional.error || tpex.error;

  const reloadAll = () => {
    twse.reload();
    advanceDecline.reload();
    institutional.reload();
    tpex.reload();
  };

  return (
    <>
      <PageHeader
        title="大盤"
        icon="donut_large"
        subtitle={latestTwse?.date ? `資料日期 ${latestTwse.date}` : undefined}
        right={
          <button
            onClick={reloadAll}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-surface border border-outline-variant rounded text-primary font-body-md text-body-md hover:bg-surface-container-low transition-colors"
          >
            重新整理
          </button>
        }
      />

      <div className="flex flex-col gap-stack-lg">
        {loading && !latestTwse && <PageState kind="loading" />}
        {error && !loading && <PageState kind="error" message={error} onRetry={reloadAll} />}

        {latestTwse && (
          <section>
            <h3 className="font-headline-md text-headline-md text-primary">集中市場（上市）</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="加權指數"
                icon="show_chart"
                value={formatNumber(latestTwse.taiex, 2)}
                valueClassName={quoteColor(latestTwse.index_change)}
                hint={formatSigned(latestTwse.index_change)}
              />
              <StatCard
                label="成交金額"
                icon="payments"
                value={formatAmount(latestTwse.trade_value)}
                hint="元"
              />
              <StatCard
                label="成交股數"
                icon="bar_chart"
                value={formatAmount(latestTwse.trade_volume)}
                hint="股"
              />
              <StatCard
                label="成交筆數"
                icon="receipt"
                value={formatNumber(latestTwse.transaction_count)}
              />
            </div>

            {stockAdvanceDecline && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                <StatCard
                  label="上漲"
                  icon="trending_up"
                  value={formatNumber(stockAdvanceDecline.rise_count)}
                  valueClassName="text-secondary"
                  hint={`漲停 ${formatNumber(stockAdvanceDecline.limit_up_count)}`}
                />
                <StatCard
                  label="下跌"
                  icon="trending_down"
                  value={formatNumber(stockAdvanceDecline.decline_count)}
                  valueClassName="text-error"
                  hint={`跌停 ${formatNumber(stockAdvanceDecline.limit_down_count)}`}
                />
                <StatCard
                  label="平盤"
                  icon="trending_flat"
                  value={formatNumber(stockAdvanceDecline.flat_count)}
                />
                <StatCard
                  label="未成交"
                  icon="do_not_disturb_on"
                  value={formatNumber(stockAdvanceDecline.unmatched_count)}
                  hint={stockAdvanceDecline.category}
                />
              </div>
            )}
          </section>
        )}

        {tpex.data && (
          <section>
            <h3 className="font-headline-md text-headline-md text-primary">上櫃市場</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="櫃買指數"
                icon="show_chart"
                value={formatNumber(tpex.data.close_index, 2)}
                valueClassName={quoteColor(tpex.data.index_change)}
                hint={formatSigned(tpex.data.index_change)}
              />
              <StatCard
                label="成交金額"
                icon="payments"
                value={`${formatNumber(tpex.data.daily_trading_value, 0)} 百萬`}
                hint="元"
              />
              <StatCard
                label="上漲 / 下跌"
                icon="swap_vert"
                value={`${formatNumber(tpex.data.rise_count)} / ${formatNumber(
                  tpex.data.decline_count
                )}`}
                hint={`平盤 ${formatNumber(tpex.data.flat_count)}`}
              />
              <StatCard
                label="總市值"
                icon="account_balance"
                value={`${formatNumber(tpex.data.market_capitalization, 0)} 百萬`}
                hint={`上櫃家數 ${formatNumber(tpex.data.listed_company_numbers)}`}
              />
            </div>
          </section>
        )}

        {!!institutional.data?.items.length && (
          <section>
            <h3 className="font-headline-md text-headline-md text-primary">
              三大法人買賣金額（上市{institutional.data.date ? ` · ${institutional.data.date}` : ''}）
            </h3>
            <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead className="bg-surface-container-low border-b border-outline-variant">
                  <tr>
                    <th className="p-2 pl-4 text-left font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">單位別</th>
                    <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">買進金額</th>
                    <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">賣出金額</th>
                    <th className="p-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap">買賣超</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {institutional.data.items.map((row) => (
                    <tr
                      key={row.investor}
                      className={`hover:bg-surface-container-low/50 transition-colors ${
                        row.total ? 'bg-white/[0.02] font-medium' : ''
                      }`}
                    >
                      <td className="p-2 py-3 font-body-md text-body-md text-on-surface whitespace-nowrap">{row.investor}</td>
                      <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface-variant">
                        {formatAmount(row.purchase_amount)}
                      </td>
                      <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface-variant">
                        {formatAmount(row.sale_amount)}
                      </td>
                      <td className={`p-2 py-3 text-right font-data-md text-data-md ${quoteColor(row.net)}`}>
                        {formatAmount(row.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              合計那一列是上游算好的，前幾列相加不等於它——外資自營商已計入自營商，上游不重複計算。
            </p>
          </section>
        )}
      </div>
    </>
  );
}
