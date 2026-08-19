import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import MacroCard from '../components/MacroIndicatorCard';
import StatCard from '../components/StatCard';
import { getMacroIndicators } from '../api/macroIndicators';
import { getWorldIndices } from '../api/worldIndex';
import { getMarketMarginSummaries } from '../api/margin';
import { getTPExMarketHighlight, getTPExPriceAdvanced, getTPExPriceDeclined } from '../api/tpex';
import {
  getLatestTWSEInstitutionalSummaries,
  getTWSEAdvanceDeclineSummaries,
  getTWSEMarketTradings,
  getTWSEVolumeRanks,
} from '../api/twse';
import { MarketMarginSummary, TWSEVolumeRank, WorldIndex } from '../api/types';
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
  marketLabel,
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
  // 這一支會自己往回找最近一個有資料的交易日，所以假日進來也看得到上一個交易日的數字。
  // 同一頁其他區塊的上游端點都不吃日期，做不到同樣的事，休市時仍然是空的。
  const institutional = useAsyncData(() => getLatestTWSEInstitutionalSummaries(), []);
  const tpex = useAsyncData(() => getTPExMarketHighlight(), []);
  const volumeRanks = useAsyncData(() => getTWSEVolumeRanks(), []);
  // 大盤融資融券。這一支跟同頁其他區塊不同，讀的是後端落地的資料而不是即時打上游，
  // 所以假日與盤中一樣看得到最近一個交易日，不必像三大法人那樣自己往回找。
  const margin = useAsyncData(() => getMarketMarginSummaries(), []);

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

  // 融資融券只顯示最新一個交易日，一個市場一列。
  //
  // 後端回的是最近 90 天、日期由新到舊，這裡取「最新那一天」的那幾列而不是前兩筆：
  // 上櫃那份是後來才接的，早期只有上市，寫死兩筆會在那種日子把前一天的上市也算進來。
  const latestMargin = useMemo(() => {
    const items = margin.data?.items ?? [];
    if (items.length === 0) return [] as MarketMarginSummary[];
    return items.filter((row) => row.date === items[0].date);
  }, [margin.data]);

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
    margin.reload();
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
          這一頁多數區塊是即時打交易所與櫃買中心的資料，不落地也不輪詢——上游有限流，要更新請按重新整理。
          假日與收盤資料還沒出來的時段那些區塊會是空的，那不是壞掉；三大法人那一區的上游吃日期，
          會自動退回最近一個有資料的交易日；融資融券則是讀已經收集下來的資料，任何時候都看得到最近一天。
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
                  valueClassName="text-quote-up"
                  hint={`漲停 ${formatNumber(stockAdvanceDecline.limit_up_count)}`}
                />
                <StatCard
                  label="下跌"
                  icon="trending_down"
                  value={formatNumber(stockAdvanceDecline.decline_count)}
                  valueClassName="text-quote-down"
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
          這一塊即使空的也要留著。買賣金額要收盤後約一小時才出得來，而往回找也有找不到的時候
          （上游更新延遲、超長連假）——整塊消失會讓人以為畫面壞了或自己看漏，不如明講。
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
              message="最近幾個交易日都還沒有三大法人買賣金額"
              hint="已經從今天往回找過最近幾個交易日了。今天盤中或剛收盤（上游約收盤後一小時才更新）拿到空的很正常，晚點按重新整理即可。"
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
              假日、連假或當天資料還沒出來時，這張表顯示的是最近一個有資料的交易日，日期請看標題。
            </p>
          )}
        </section>

        {/*
          融資融券跟三大法人並列：兩者都是「大盤層級的籌碼」，一個看法人一個看散戶槓桿，
          放在一起才看得出當天是誰在買。
        */}
        <section className="flex flex-col gap-stack-md">
          <div className="flex flex-wrap justify-between items-end gap-stack-sm">
            <h2 className="font-headline-md text-headline-md text-primary">
              融資融券（大盤
              {latestMargin[0]?.date ? ` · ${latestMargin[0].date}` : ''}）
            </h2>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              餘額單位張，融資金額單位元
            </span>
          </div>

          {margin.loading && <PageState kind="loading" />}
          {margin.error && (
            <PageState kind="error" message={margin.error} onRetry={margin.reload} />
          )}
          {!margin.loading && !margin.error && latestMargin.length === 0 && (
            <PageState
              kind="empty"
              message="還沒有大盤融資融券資料"
              hint="這份由每天晚間的排程收集（交易所當日晚間才公布），跟同頁其他區塊的即時查詢不同。排程還沒跑過就會是空的。"
            />
          )}

          {latestMargin.length > 0 && (
            <div className={`${cardClass} overflow-x-auto`}>
              <table className="w-full text-left border-collapse">
                <thead className="bg-surface-container-low border-b border-outline-variant">
                  <tr>
                    <th className={`${thClass} pl-4 text-left`}>市場</th>
                    <th className={`${thClass} text-right`}>融資餘額</th>
                    <th className={`${thClass} text-right`}>融資增減</th>
                    <th className={`${thClass} text-right`}>融資金額</th>
                    <th className={`${thClass} text-right`}>融券餘額</th>
                    <th className={`${thClass} pr-4 text-right`}>融券增減</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {latestMargin.map((row) => (
                    <tr
                      key={row.market}
                      className="hover:bg-surface-container-low/50 transition-colors"
                    >
                      <td className="p-2 pl-4 py-3 font-body-md text-body-md text-on-surface whitespace-nowrap">
                        {marketLabel(row.market)}
                      </td>
                      <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface">
                        {formatNumber(row.margin_lots)}
                      </td>
                      <td
                        className={`p-2 py-3 text-right font-data-md text-data-md ${quoteColor(
                          row.margin_lots_change
                        )}`}
                      >
                        {formatSigned(row.margin_lots_change, 0)}
                      </td>
                      <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface-variant">
                        {formatAmount(row.margin_amount)}
                      </td>
                      <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface">
                        {formatNumber(row.short_lots)}
                      </td>
                      <td
                        className={`p-2 pr-4 py-3 text-right font-data-md text-data-md ${quoteColor(
                          row.short_lots_change
                        )}`}
                      >
                        {formatSigned(row.short_lots_change, 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {latestMargin.length > 0 && (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              融資增加代表散戶用槓桿加碼、融券增加代表看空的部位變多，兩者都是籌碼面而不是價格
              ——這裡的紅綠只標增減方向，跟當天大盤漲跌沒有關係。
              融券只有張數：兩個市場的上游都沒有公布融券金額。
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

        <WorldIndexSection />
        <MacroSection />
      </div>
    </>
  );
}

/** 市場別的中文與顯示順序。對不到的照原碼顯示，不要因為沒翻譯就藏起來。 */
const WORLD_MARKETS: { code: string; label: string; note: string }[] = [
  { code: 'US', label: '美股', note: '台股開盤前最先看的一組。收盤時台灣是清晨。' },
  { code: 'JP', label: '日股', note: '跟台股同一個時區，盤中走勢常常同向。' },
  { code: 'KR', label: '韓股', note: '半導體權重高，跟台股的產業結構最接近。' },
];

/**
 * 世界股市指數：日股、韓股、美股。
 *
 * 擺在台股各區塊之後而不是最上面：這一頁的主角是台股，這一區是背景。
 * 但它是**開盤前**最常被問的一組，所以放在同一頁而不是另開一頁。
 *
 * ⚠️ 三個市場的資料日期本來就不同步（美股慢一天），所以日期標在每一張卡上，
 * 不做成整區一個「資料日期」——那會謊報其中兩個。
 */
function WorldIndexSection() {
  // 不輪詢：收的是每日排程落地的日 K，一天只變一次。
  const { data, loading, error, reload } = useAsyncData(() => getWorldIndices(), []);
  const items = data?.items ?? [];

  return (
    <section className="flex flex-col gap-stack-md">
      <div className="flex flex-wrap items-baseline justify-between gap-stack-sm">
        <h2 className="font-headline-md text-headline-md text-primary">世界股市</h2>
        <button
          type="button"
          onClick={reload}
          className="flex items-center justify-center gap-2 px-3 py-1.5 bg-surface border border-outline-variant rounded text-primary font-body-sm text-body-sm hover:bg-surface-container-low transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          重新整理
        </button>
      </div>

      <p className="font-body-sm text-body-sm text-on-surface-variant">
        <span className="text-on-surface font-semibold">收盤值，不是即時報價</span>
        ，而且三個市場的日期本來就不同步——台北週三下午看到的是日韓週三收盤、
        <span className="text-on-surface font-semibold">美股週二收盤</span>
        ，那是正確的不是漏收，所以日期標在每一張卡上。漲跌沿用台股慣例的漲紅跌綠。
      </p>

      {loading && <PageState kind="loading" />}
      {error && !loading && <PageState kind="error" message={error} onRetry={reload} />}

      {!loading && !error && items.length === 0 && (
        <PageState
          kind="empty"
          message="還沒有世界指數的資料"
          hint="這一份靠每日排程收，還沒跑過就會是空的。跟「今天沒有行情」是兩回事。"
        />
      )}

      {items.length > 0 && (
        <div className="flex flex-col gap-stack-md">
          {WORLD_MARKETS.map((market) => {
            const rows = items.filter((item) => item.market === market.code);
            if (rows.length === 0) return null;
            return (
              <div key={market.code} className="flex flex-col gap-stack-sm">
                <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                  {market.label}
                  <span className="ml-2 normal-case font-body-sm text-body-sm text-outline">
                    {market.note}
                  </span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-stack-md">
                  {rows.map((item) => (
                    <WorldIndexCard key={item.symbol} item={item} />
                  ))}
                </div>
              </div>
            );
          })}

          {/* 後端多回一個沒對照到的市場時照樣顯示，不要讓它消失。 */}
          {(() => {
            const known = WORLD_MARKETS.map((m) => m.code);
            const rest = items.filter((item) => !known.includes(item.market));
            if (rest.length === 0) return null;
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-stack-md">
                {rest.map((item) => (
                  <WorldIndexCard key={item.symbol} item={item} />
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </section>
  );
}

/** 一支指數。 */
function WorldIndexCard({ item }: { item: WorldIndex }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
          {item.name}
        </span>
        <span className="ml-auto font-data-md text-data-md text-outline">{item.symbol}</span>
      </div>

      <p className="font-data-lg text-data-lg text-on-surface">{formatNumber(item.close, 2)}</p>

      {/* change 為 null 代表只收到一根日 K，算不出來——不是平盤，所以不顯示 0.00%。 */}
      <p className={`font-body-md text-body-md ${quoteColor(item.change_percent)}`}>
        {item.change == null ? (
          <span className="text-on-surface-variant">沒有前一個收盤可以比</span>
        ) : (
          <>
            {formatSigned(item.change, 2)}（{formatSignedPercent(item.change_percent)}）
          </>
        )}
      </p>

      <p className="font-body-sm text-body-sm text-outline">{item.date || DASH} 收盤</p>
    </div>
  );
}

/**
 * 國際指標：VIX 與布蘭特原油的當下報價。
 *
 * 獨立成一個元件而不是攤在頁面裡，是為了讓它**自己失敗**：這一區打的是跟其他區塊
 * 完全不同的上游（Yahoo、FRED），取不到的時候不該把整頁的台股資料一起拖下水。
 *
 * 只有現值沒有走勢圖：後端的日 K 序列雖然有落地（連同美元指數、美國 10 年期、
 * 費半），但那份是給建模用的、沒有開查詢端點。畫得出走勢的只有升息機率，在 /macro。
 */
function MacroSection() {
  // 不輪詢，理由同這一頁其他區塊。這兩支的上游一天只更新一次收盤。
  const { data, loading, error, reload } = useAsyncData(() => getMacroIndicators(), []);
  const items = data?.items ?? [];

  return (
    <section className="flex flex-col gap-stack-md">
      <div className="flex flex-wrap items-baseline justify-between gap-stack-sm">
        <h2 className="font-headline-md text-headline-md text-primary">國際指標</h2>
        <button
          type="button"
          onClick={reload}
          className="flex items-center justify-center gap-2 px-3 py-1.5 bg-surface border border-outline-variant rounded text-primary font-body-sm text-body-sm hover:bg-surface-container-low transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          重新整理
        </button>
      </div>

      <p className="font-body-sm text-body-sm text-on-surface-variant">
        這兩個<span className="text-on-surface font-semibold">都不是台股資料</span>
        ：交易時段、時區與休市日都跟台股不同。美股與紐約商品交易所收盤時台灣是清晨，
        所以盤中看到的<span className="text-on-surface font-semibold">永遠是昨晚的收盤</span>
        ，各自的時間標在卡片下方。
        <span className="text-on-surface font-semibold">它們的「上漲」也都不是好消息</span>
        ，所以這一區不用台股的漲紅跌綠——數值走中性色，方向用文字講。
      </p>

      {loading && <PageState kind="loading" />}
      {error && !loading && <PageState kind="error" message={error} onRetry={reload} />}

      {!loading && !error && items.length === 0 && (
        <PageState
          kind="empty"
          message="這次沒取到國際指標"
          hint="這兩支直接打 Yahoo 與 FRED，上游限流或暫時掛掉時會是空的，按重新整理再試一次。跟「數值是 0」是兩回事——VIX 與油價的 0 都是不可能的值。"
        />
      )}

      {items.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-stack-md">
            {items.map((item) => (
              <MacroCard key={item.symbol} item={item} />
            ))}
          </div>

          <p className="font-body-sm text-body-sm text-on-surface-variant">
            這兩張卡在
            <Link to="/macro" className="mx-1 text-primary underline">
              Fed 與總經
            </Link>
            那一頁也看得到，那裡另外有 Fed 升息機率、FOMC 會議日程與美國的通膨、失業率、GDP。
          </p>
        </>
      )}
    </section>
  );
}
