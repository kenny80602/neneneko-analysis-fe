import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import StatCard from '../components/StatCard';
import { getTPExMarketHighlight, getTPExPriceAdvanced, getTPExPriceDeclined } from '../api/tpex';
import {
  getTWSEAdvanceDeclineSummaries,
  getTWSEInstitutionalSummaries,
  getTWSEMarketTradings,
  getTWSEVolumeRanks,
} from '../api/twse';
import { TWSEVolumeRank } from '../api/types';
import { useSymbol } from '../context/SymbolContext';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  DASH,
  formatAmount,
  formatNumber,
  formatPrice,
  formatShareToLot,
  formatSigned,
  formatSignedPercent,
  quoteColor,
} from '../utils/format';

// 大盤總覽。這一整頁都是「即時打交易所 OpenAPI」、不落地且受上游限流，
// 所以一律不輪詢，要更新請按右上角重新整理。

type TwseSort = 'volume' | 'gain' | 'loss';
type TpexSide = 'advanced' | 'declined';

// 上櫃排行顯示幾檔。跟上市那張（上游固定給二十名）對齊，兩邊長度才不會差一大截。
const TOP_N = 20;

/**
 * 成交量排行沒給漲跌幅，用漲跌點數回推：昨收 = 收盤 − 漲跌。
 *
 * 昨收算出來不是正數就回 null（新上市首日、當日無成交）。
 * ⚠️ 上游這支沒有除權息旗標，除權息當天的漲跌跟前一日沒有可比性，這個百分比會失真。
 */
function toChangePercent(row: TWSEVolumeRank): number | null {
  const previousClose = row.close - row.change;
  if (previousClose <= 0) return null;
  return (row.change / previousClose) * 100;
}

const cardClass = 'bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm';
const thClass =
  'p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap';
const tabClass = (active: boolean) =>
  active
    ? 'px-3 py-1 rounded font-body-sm text-body-sm bg-primary text-on-primary transition-colors'
    : 'px-3 py-1 rounded font-body-sm text-body-sm text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors';

export default function Market() {
  const navigate = useNavigate();
  const { setSymbol } = useSymbol();

  const twse = useAsyncData(() => getTWSEMarketTradings(), []);
  const advanceDecline = useAsyncData(() => getTWSEAdvanceDeclineSummaries(), []);
  const institutional = useAsyncData(() => getTWSEInstitutionalSummaries(), []);
  const tpex = useAsyncData(() => getTPExMarketHighlight(), []);
  const volumeRanks = useAsyncData(() => getTWSEVolumeRanks(), []);

  const [twseSort, setTwseSort] = useState<TwseSort>('volume');
  const [tpexSide, setTpexSide] = useState<TpexSide>('advanced');

  // 漲幅榜與跌幅榜是兩支端點，只抓目前這一頁要看的那支——
  // 兩支都先抓等於每次進首頁都多打一次上游，而使用者多半只看其中一邊。
  const movers = useAsyncData(
    () => (tpexSide === 'advanced' ? getTPExPriceAdvanced() : getTPExPriceDeclined()),
    [tpexSide]
  );

  // 上游那兩支雖然叫「排行」，回來卻是照代號排的（實測 3066 +9.95% 排在 3441 +9.96% 前面），
  // 所以名次要自己排。漲幅榜由大到小、跌幅榜由小到大（跌幅是負數，跌最多的排前面）。
  //
  // 也只留前 TOP_N 檔：上游是把整個榜單一次回來（動輒好幾十檔），全列出來會蓋掉旁邊那張表，
  // 而且看排行的人只在意前幾名。截掉幾檔有在註腳講明。
  const rankedMovers = useMemo(() => {
    const rows = [...(movers.data ?? [])];
    rows.sort((a, b) =>
      tpexSide === 'advanced'
        ? b.change_percent - a.change_percent
        : a.change_percent - b.change_percent
    );
    return rows.slice(0, TOP_N);
  }, [movers.data, tpexSide]);

  // 上游回的是陣列且日期由舊到新不一定固定，取最後一筆當「最新」不保險，
  // 直接依日期字串（YYYY-MM-DD 可字典序比較）挑最大的那筆。
  const latestTwse = twse.data?.reduce(
    (latest, row) => (!latest || row.date > latest.date ? row : latest),
    undefined as (typeof twse.data)[number] | undefined
  );

  // 漲跌家數分「整體市場」與「股票」等統計範圍，兩者不可相加；這裡只取股票那列。
  const stockAdvanceDecline = advanceDecline.data?.find((row) => row.category.includes('股票'));

  // 加權指數的漲跌幅上游只給點數，百分比同樣用昨日指數回推。
  const taiexPercent = latestTwse
    ? (() => {
        const previous = latestTwse.taiex - latestTwse.index_change;
        return previous > 0 ? (latestTwse.index_change / previous) * 100 : null;
      })()
    : null;

  const rankedTwse = useMemo(() => {
    const rows = (volumeRanks.data ?? []).map((row) => ({
      ...row,
      changePercent: toChangePercent(row),
    }));
    // 上游本來就是依成交量排好的，這個選項不重排。
    if (twseSort === 'volume') return rows;
    return [...rows].sort((a, b) => {
      // 算不出漲跌幅的一律排最後，不要因為排序方向跑到最前面擋住有資料的列。
      if (a.changePercent == null && b.changePercent == null) return 0;
      if (a.changePercent == null) return 1;
      if (b.changePercent == null) return -1;
      return twseSort === 'gain'
        ? b.changePercent - a.changePercent
        : a.changePercent - b.changePercent;
    });
  }, [volumeRanks.data, twseSort]);

  const loading = twse.loading || advanceDecline.loading || institutional.loading || tpex.loading;
  const error = twse.error || advanceDecline.error || institutional.error || tpex.error;

  const reloadAll = () => {
    twse.reload();
    advanceDecline.reload();
    institutional.reload();
    tpex.reload();
    volumeRanks.reload();
    movers.reload();
  };

  // 點任何一列就把代號設成目前選取的檔並跳到個股總覽。
  const openSymbol = (symbol: string) => {
    setSymbol(symbol);
    navigate('/dashboard');
  };

  return (
    <>
      <PageHeader
        title="市場概況"
        icon="donut_large"
        subtitle={latestTwse?.date ? `資料日期 ${latestTwse.date}` : undefined}
        right={
          <button
            type="button"
            onClick={reloadAll}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-surface border border-outline-variant rounded text-primary font-body-md text-body-md hover:bg-surface-container-low transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            重新整理
          </button>
        }
      />

      <div className="flex flex-col gap-stack-lg">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          這一頁全部是即時打交易所與櫃買中心的資料，不落地也不輪詢——上游有限流，要更新請按重新整理。
          假日與收盤資料還沒出來的時段，各區塊會是空的，那不是壞掉。
        </p>

        {loading && !latestTwse && <PageState kind="loading" />}
        {error && !loading && <PageState kind="error" message={error} onRetry={reloadAll} />}

        {latestTwse && (
          <section className="flex flex-col gap-stack-md">
            <h2 className="font-headline-md text-headline-md text-primary">集中市場（上市）</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-gutter">
              <StatCard
                label="加權指數"
                icon="show_chart"
                value={formatNumber(latestTwse.taiex, 2)}
                valueClassName={quoteColor(latestTwse.index_change)}
                hint={`${formatSigned(latestTwse.index_change)}（${formatSignedPercent(
                  taiexPercent
                )}）`}
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
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-gutter">
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
          <section className="flex flex-col gap-stack-md">
            <h2 className="font-headline-md text-headline-md text-primary">上櫃市場</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-gutter">
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

        {/*
          這一塊即使空的也要留著。上游不帶 date 就是「今天」，而三大法人買賣金額要收盤後
          約一小時才出得來——整塊消失會讓人以為畫面壞了或自己看漏，不如明講還沒出來。
        */}
        <section className="flex flex-col gap-stack-md">
          <div className="flex flex-wrap justify-between items-end gap-stack-sm">
            <h2 className="font-headline-md text-headline-md text-primary">
              三大法人買賣超（上市
              {institutional.data?.date ? ` · ${institutional.data.date}` : ''}）
            </h2>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              金額單位元，億以上自動縮寫
            </span>
          </div>

          {institutional.loading && <PageState kind="loading" />}
          {institutional.error && (
            <PageState kind="error" message={institutional.error} onRetry={institutional.reload} />
          )}
          {!institutional.loading && !institutional.error && !institutional.data?.items.length && (
            <PageState
              kind="empty"
              message="今天的三大法人買賣金額還沒出來"
              hint="這支查的是當天，而上游收盤後約一小時才更新——盤中與假日拿到的一定是空的，不是壞掉。"
            />
          )}

          {!!institutional.data?.items.length && (
            <div className={`${cardClass} overflow-x-auto`}>
              <table className="w-full text-left border-collapse">
                <thead className="bg-surface-container-low border-b border-outline-variant">
                  <tr>
                    <th className={`${thClass} pl-4 text-left`}>單位別</th>
                    <th className={`${thClass} text-right`}>買進金額</th>
                    <th className={`${thClass} text-right`}>賣出金額</th>
                    <th className={`${thClass} pr-4 text-right`}>買賣超</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {institutional.data.items.map((row) => (
                    <tr
                      key={row.investor}
                      className={`hover:bg-surface-container-low/50 transition-colors ${
                        row.total ? 'bg-surface-container-low font-medium' : ''
                      }`}
                    >
                      <td className="p-2 pl-4 py-3 font-body-md text-body-md text-on-surface whitespace-nowrap">
                        {row.investor}
                      </td>
                      <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface-variant">
                        {formatAmount(row.purchase_amount)}
                      </td>
                      <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface-variant">
                        {formatAmount(row.sale_amount)}
                      </td>
                      <td
                        className={`p-2 pr-4 py-3 text-right font-data-md text-data-md font-bold ${quoteColor(
                          row.net
                        )}`}
                      >
                        {formatAmount(row.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!!institutional.data?.items.length && (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              合計那一列是上游算好的，前幾列相加不等於它——外資自營商已計入自營商，上游不重複計算。
            </p>
          )}
        </section>

        <section className="flex flex-col gap-stack-md">
          <h2 className="font-headline-md text-headline-md text-primary">個股排行</h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter items-start">
            <div className={`${cardClass} flex flex-col overflow-hidden`}>
              <div className="p-4 border-b border-outline-variant bg-surface-container-low flex flex-wrap justify-between items-center gap-stack-sm">
                <div>
                  <h3 className="font-body-md text-body-md text-on-surface font-semibold">
                    上市成交量前 20 名
                  </h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {volumeRanks.data?.[0]?.date ?? DASH}
                  </p>
                </div>
                <div className="flex gap-1">
                  {(
                    [
                      { key: 'volume', label: '成交量' },
                      { key: 'gain', label: '漲幅' },
                      { key: 'loss', label: '跌幅' },
                    ] as { key: TwseSort; label: string }[]
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setTwseSort(tab.key)}
                      aria-pressed={twseSort === tab.key}
                      className={tabClass(twseSort === tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {volumeRanks.loading && <PageState kind="loading" />}
              {volumeRanks.error && (
                <PageState kind="error" message={volumeRanks.error} onRetry={volumeRanks.reload} />
              )}
              {!volumeRanks.loading && !volumeRanks.error && rankedTwse.length === 0 && (
                <PageState
                  kind="empty"
                  message="今天還沒有成交量排行"
                  hint="上游只給當天的榜單，假日與收盤資料出來之前都是空的。"
                />
              )}

              {rankedTwse.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-surface-container-lowest border-b border-outline-variant">
                      <tr>
                        <th className={`${thClass} pl-4 text-left`}>代號 / 名稱</th>
                        <th className={`${thClass} text-right`}>收盤</th>
                        <th className={`${thClass} text-right`}>漲跌幅</th>
                        <th className={`${thClass} pr-4 text-right`}>成交量</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/50">
                      {rankedTwse.map((row) => (
                        <tr
                          key={row.symbol}
                          onClick={() => openSymbol(row.symbol)}
                          title="點擊查看個股總覽"
                          className="hover:bg-surface-container-low/50 transition-colors cursor-pointer"
                        >
                          <td className="p-2 pl-4 py-3">
                            <span className="block font-data-md text-data-md text-primary font-bold">
                              {row.symbol}
                            </span>
                            <span className="block font-body-sm text-body-sm text-on-surface-variant">
                              {row.name}
                            </span>
                          </td>
                          <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface">
                            {formatPrice(row.close)}
                          </td>
                          <td
                            className={`p-2 py-3 text-right font-data-md text-data-md ${quoteColor(
                              row.changePercent
                            )}`}
                          >
                            {formatSignedPercent(row.changePercent)}
                          </td>
                          <td className="p-2 pr-4 py-3 text-right font-data-md text-data-md text-on-surface-variant">
                            {formatShareToLot(row.trade_volume)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="p-4 font-body-sm text-body-sm text-on-surface-variant border-t border-outline-variant">
                成交量單位張。切換「漲幅」「跌幅」是把這 20 檔重新排序，不是全市場的漲跌幅排行——
                集中市場沒有對應的排行端點。
              </p>
            </div>

            <div className={`${cardClass} flex flex-col overflow-hidden`}>
              <div className="p-4 border-b border-outline-variant bg-surface-container-low flex flex-wrap justify-between items-center gap-stack-sm">
                <div>
                  <h3 className="font-body-md text-body-md text-on-surface font-semibold">
                    上櫃盤中{tpexSide === 'advanced' ? '漲幅' : '跌幅'}排行
                  </h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {rankedMovers[0]?.date ?? DASH}
                  </p>
                </div>
                <div className="flex gap-1">
                  {(
                    [
                      { key: 'advanced', label: '漲幅' },
                      { key: 'declined', label: '跌幅' },
                    ] as { key: TpexSide; label: string }[]
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setTpexSide(tab.key)}
                      aria-pressed={tpexSide === tab.key}
                      className={tabClass(tpexSide === tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {movers.loading && <PageState kind="loading" />}
              {movers.error && (
                <PageState kind="error" message={movers.error} onRetry={movers.reload} />
              )}
              {!movers.loading && !movers.error && rankedMovers.length === 0 && (
                <PageState
                  kind="empty"
                  message="目前沒有排行資料"
                  hint="這支是盤中的即時榜單，假日與開盤前都是空的。"
                />
              )}

              {rankedMovers.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-surface-container-lowest border-b border-outline-variant">
                      <tr>
                        <th className={`${thClass} pl-4 text-left`}>代號 / 名稱</th>
                        <th className={`${thClass} text-right`}>成交價</th>
                        <th className={`${thClass} text-right`}>漲跌</th>
                        <th className={`${thClass} pr-4 text-right`}>漲跌幅</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/50">
                      {rankedMovers.map((row) => (
                        <tr
                          key={row.symbol}
                          onClick={() => openSymbol(row.symbol)}
                          title="點擊查看個股總覽"
                          className="hover:bg-surface-container-low/50 transition-colors cursor-pointer"
                        >
                          <td className="p-2 pl-4 py-3">
                            <span className="block font-data-md text-data-md text-primary font-bold">
                              {row.symbol}
                            </span>
                            <span className="block font-body-sm text-body-sm text-on-surface-variant">
                              {row.name}
                            </span>
                          </td>
                          <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface">
                            {formatPrice(row.close_price)}
                          </td>
                          <td
                            className={`p-2 py-3 text-right font-data-md text-data-md ${quoteColor(
                              row.change
                            )}`}
                          >
                            {formatSigned(row.change)}
                          </td>
                          <td
                            className={`p-2 pr-4 py-3 text-right font-data-md text-data-md ${quoteColor(
                              row.change_percent
                            )}`}
                          >
                            {formatSignedPercent(row.change_percent)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="p-4 font-body-sm text-body-sm text-on-surface-variant border-t border-outline-variant">
                盤中即時榜單，收盤後不再變動。這一組只有上櫃有，上游沒有給成交量。
                上游是把整個榜單一次回來（共 {movers.data?.length ?? 0} 檔），這裡只顯示前 {TOP_N} 名。
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
