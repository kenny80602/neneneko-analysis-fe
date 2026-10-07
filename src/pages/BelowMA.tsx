import { Fragment, useMemo, useState } from 'react';
import GroupChainButton, { chainStocksOf } from '../components/GroupChainButton';
import BrokerTargetCell from '../components/BrokerTargetCell';
import PageHeader from '../components/PageHeader';
import TargetPriceEditor from '../components/TargetPriceEditor';
import PageState from '../components/PageState';
import { getBelowMA, getDailyQuotesByDate } from '../api/dailyQuote';
import { getGroupHeat } from '../api/groupHeat';
import { BelowMAStock, DailyQuote, GroupHeat } from '../api/types';
import { useSymbol } from '../context/SymbolContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { useGroupIndex } from '../hooks/useSymbolGroups';
import { useSymbolValuations } from '../hooks/useSymbolValuations';
import { useTargets } from '../hooks/useTargets';
import {
  changePercent,
  coreRankLabel,
  formatAmount,
  gapToTarget,
  formatNumber,
  formatPe,
  formatPercent,
  formatPrice,
  formatRank,
  formatShareToLot,
  formatSigned,
  formatSignedPercent,
  marketLabel,
  quoteColor,
} from '../utils/format';

// 半年約 125 個成交日；不到這個數字的高點是用不完整的歷史算的。
const SHORT_HISTORY_DAYS = 100;

// 族群熱度榜前幾名要上色。榜上的族群數量不固定，用固定名次而不是比例。
const HOT_GROUP_TOP = 20;

// 回檔超過這個幅度（%）整格標紅。刻意跟推播的紅字門檻（25%，見 Alert.tsx）分開：
// 這一頁是找跌深的，門檻是使用者指定的 30。
const PULLBACK_ALERT_PCT = 30;

// 龍頭排名的稱呼。後端只給名次 1～3，稱呼是畫面的事。

// 族群內沒有營收名次的（ETF、剛上市）排在有名次的後面。
const UNRANKED = 9999;

const TH = 'p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap';

export default function BelowMA() {
  const { setSymbol } = useSymbol();
  const { groups, names: groupNames } = useGroupIndex();
  // 使用者自己設定的目標價；表格、關聯圖面板、展開的同族群股票共用同一份。
  const targets = useTargets();
  const [expanded, setExpanded] = useState<string | null>(null);
  // 不帶日期：每一檔取自己最新的一筆估值，跟「最新一天的收盤」最接近。
  const valuations = useSymbolValuations();
  // 不輪詢：後端逐檔讀 60 個成交日，檔數多時比其他讀取端點慢，讓使用者按重新整理。
  const { data, loading, error, reload } = useAsyncData(() => getBelowMA(), []);
  // 族群熱度榜的名次：榜本身已經排好（訊號成立數多的在前、涵蓋不足的降級），
  // 名次就是它在 items 裡的位置，前端不自己排。榜是現況描述不是預測。
  // 載入失敗或還沒有橫斷面時整份沒有名次，畫面不顯示名次而不是顯示假的。
  const heatData = useAsyncData(() => getGroupHeat(), []);
  const heat = useMemo(() => {
    const items = heatData.data?.items ?? [];
    return new Map(items.map((item, index) => [item.name, { item, rank: index + 1, total: items.length }]));
  }, [heatData.data]);

  // 關聯圖：沿著上游往上下追需要全部族群的上游；有上游或下游的族群才給圖示。
  const chainSources = useMemo(
    () => groups.map((entry) => ({ name: entry.group.name, upstream: entry.group.upstream ?? [] })),
    [groups]
  );
  const stocksOf = useMemo(() => chainStocksOf(groups, heat), [groups, heat]);
  const linkedGroups = useMemo(() => {
    const set = new Set<string>();
    for (const entry of groups) {
      if ((entry.group.upstream ?? []).length > 0 || (entry.group.downstream ?? []).length > 0) {
        set.add(entry.group.name);
      }
    }
    return set;
  }, [groups]);

  // 展開後要看同族群的漲跌：一次抓最新一天的全部收盤，不必每展開一列發一次請求。
  // 族群成員不一定都有落地收盤（範圍是自選股加額外名單），查不到的那幾檔顯示破折號。
  const quotesData = useAsyncData(() => getDailyQuotesByDate(), []);
  const quotes = useMemo(
    () => new Map<string, DailyQuote>((quotesData.data?.quotes ?? []).map((q) => [q.symbol, q])),
    [quotesData.data]
  );

  // 依族群熱度排，同一個族群內依族群內營收名次（龍頭、老二、老三、4、5…）排：
  //   1. 取這檔所屬族群裡最熱（名次數字最小）的那個，名次小的在前；沒歸族群或族群不在熱度榜上的排最後。
  //   2. 同一個族群內依營收名次：龍頭 → 老二 → 老三 → 4 → 5 …，沒名次的（ETF、剛上市）排最後。
  //   3. 其餘維持後端順序，也就是乖離由負得最多排起。
  // 排序在前端做：熱度榜是另一支端點，後端的 below-ma 不知道它。
  const items = useMemo(() => {
    const keyOf = (symbol: string): [number, number] => {
      let best: { rank: number; item: GroupHeat } | null = null;
      for (const name of groupNames.get(symbol) ?? []) {
        const h = heat.get(name);
        if (h && (!best || h.rank < best.rank)) best = { rank: h.rank, item: h.item };
      }
      if (!best) return [Infinity, Infinity];
      return [best.rank, coreRank(best.item, symbol) ?? UNRANKED];
    };
    return [...(data?.items ?? [])].sort((a, b) => {
      const [ga, ca] = keyOf(a.symbol);
      const [gb, cb] = keyOf(b.symbol);
      if (ga !== gb) return ga < gb ? -1 : 1;
      if (ca !== cb) return ca < cb ? -1 : 1;
      return 0;
    });
  }, [data, groupNames, heat]);
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
          季線 = 最近 60 個成交日收盤價的簡單平均（未還原，除權息會有偏差）；成交量以張計（1 張 = 1,000 股）、成交金額為新台幣，都是最新一天的。目標價是你自己設定的（點格子輸入，清空刪除），距目標是還要漲多少才到、負數是已經超過，沒設定顯示破折號；漲跌% 是最新一天對前一交易日（除權息日不算，顯示破折號）；乖離 = 收盤相對季線的百分比，
          越負離季線越遠。表格依族群熱度排序：取這檔所屬族群裡最熱的名次，沒歸族群或族群不在熱度榜上的排最後；同一個族群內依族群內營收名次（龍頭、老二、老三、4、5…）排，沒有名次的排最後，再來維持乖離由負得最多排起。範圍只有已落地收盤行情的那批（自選股加半導體族群），不是全市場。
          收盤在季線以下是現況描述，不是買賣訊號。族群是自己在「主題族群」建的，破折號代表沒歸進任何族群。成交金額名次是最新一天在同市場普通股裡的名次，沒有名次（ETF、回補進來的日期）顯示破折號。龍頭／老二／老三是族群裡月營收最大的三檔（營收大不一定是產業龍頭），這檔自己是的話族群欄會標出，展開可看三檔今天的漲跌；族群熱度前 20 名用藍色底標出（刻意不用紅綠：那是漲跌的顏色）（族群欄的 #名次，是熱度榜的現況排序、不是預測）。回檔 =（半年最高 − 收盤）÷ 半年最高，公式同持股試算，超過 30% 整格標紅；半年最高取已落地的收盤行情，不是去問 Yahoo，歷史不到約 100 個成交日的檔標紅色星號（回檔被低估）。本益比與殖利率取每一檔最新一筆估值，本益比「虧損」是上游給空值（虧損或尚無盈餘）；破折號是沒配息沒有殖利率，或估值還沒收集。
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
                  <th className={`${TH} w-8 pl-3`} aria-label="展開" />
                  <th className={`${TH} text-left`}>代號</th>
                  <th className={`${TH} text-left`}>名稱</th>
                  <th className={`${TH} text-left`}>族群</th>
                  <th className={`${TH} text-right`}>收盤</th>
                  <th className={`${TH} text-right`}>漲跌%</th>
                  <th className={`${TH} text-right`} title="自己設定的目標價，點格子修改，清空刪除">目標價</th>
                  <th className={`${TH} text-right`} title="還要漲多少才到目標價；負數是已經超過">距目標</th>
                  <th className={`${TH} text-right`} title="各家券商目標價的中位數與家數，網路公開資訊整理、未驗證，點一下看每家與出處">券商目標</th>
                  <th className={`${TH} text-right`}>成交量(張)</th>
                  <th className={`${TH} text-right`}>成交金額</th>
                  <th className={`${TH} text-right`}>季線</th>
                  <th className={`${TH} text-right`}>乖離</th>
                  <th className={`${TH} text-right`}>半年高</th>
                  <th className={`${TH} text-right`}>回檔</th>
                  <th className={`${TH} text-right`}>本益比</th>
                  <th className={`${TH} text-right`}>殖利率</th>
                  <th className={`${TH} text-right`}>成交金額名次</th>
                  <th className={`${TH} pr-4 text-right`}>日期</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {items.map((row) => {
                  const open = expanded === row.symbol;
                  const mine = groupNames.get(row.symbol);
                  return (
                    <Fragment key={row.symbol}>
                      <tr
                        onClick={() => setExpanded(open ? null : row.symbol)}
                        className="hover:bg-surface-container-low/50 transition-colors cursor-pointer"
                        title={mine ? '點擊展開同族群的股票' : '點擊展開（這檔沒歸進任何族群）'}
                      >
                        <td className="p-2 pl-3 py-3 text-on-surface-variant">
                          <span className="material-symbols-outlined text-[18px] align-middle">
                            {open ? 'expand_more' : 'chevron_right'}
                          </span>
                        </td>
                        <td className="p-2 py-3 font-data-md text-data-md text-primary font-bold whitespace-nowrap">
                          {row.symbol}
                          <span className="ml-2 font-body-sm text-body-sm text-on-surface-variant">
                            {marketLabel(row.market)}
                          </span>
                        </td>
                        <td className="p-2 py-3 font-body-md text-body-md text-on-surface whitespace-nowrap">{row.name}</td>
                        <td className="p-2 py-3 font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                          {mine ? (
                            <span className="flex flex-col items-start gap-1">
                              {mine.map((name) => {
                                const h = heat.get(name);
                                const hot = !!h && h.rank <= HOT_GROUP_TOP;
                                return (
                                  <span
                                    key={name}
                                    title={h ? `熱度第 ${h.rank} / ${h.total} 名${hot ? `（前 ${HOT_GROUP_TOP} 名）` : ''}` : '熱度榜沒有這個族群'}
                                    className={
                                      hot
                                        ? 'rounded px-1.5 py-0.5 bg-primary/15 text-primary font-bold'
                                        : 'px-1.5 py-0.5'
                                    }
                                  >
                                    {h ? `${name} #${h.rank}` : name}
                                    {coreRank(h?.item, row.symbol) != null &&
                                      `・${coreRankLabel(coreRank(h?.item, row.symbol) as number)}`}
                                    {linkedGroups.has(name) && (
                                      <GroupChainButton
                                        name={name}
                                        sources={chainSources}
                                        heat={heat}
                                        total={heatData.data?.items.length ?? 0}
                                        stocksOf={stocksOf}
                                        targets={targets}
                                      />
                                    )}
                                  </span>
                                );
                              })}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface font-bold">
                          {formatPrice(row.close)}
                        </td>
                        <td className={`p-2 py-3 text-right font-data-md text-data-md ${quoteColor(row.change_pct)}`}>
                          {formatSignedPercent(row.change_pct)}
                        </td>
                        <td className="p-2 py-3 text-right">
                          <TargetPriceEditor symbol={row.symbol} store={targets} />
                        </td>
                        <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface whitespace-nowrap">
                          {formatSignedPercent(gapToTarget(row.close, targets.get(row.symbol)?.target_price))}
                        </td>
                        <td className="p-2 py-3 text-right">
                          <BrokerTargetCell symbol={row.symbol} />
                        </td>
                        <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface-variant whitespace-nowrap">
                          {formatShareToLot(row.volume)}
                        </td>
                        <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface-variant whitespace-nowrap">
                          {formatAmount(row.trade_value)}
                        </td>
                        <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface-variant">
                          {formatPrice(row.ma60)}
                        </td>
                        <td className={`p-2 py-3 text-right font-data-md text-data-md ${quoteColor(row.gap_pct)}`}>
                          {formatSignedPercent(row.gap_pct)}
                        </td>
                        <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface-variant whitespace-nowrap">
                          {formatPrice(row.recent_high)}
                          {row.recent_high_days < SHORT_HISTORY_DAYS && (
                            <span
                              className="ml-1 font-body-sm text-body-sm text-error"
                              title={`只看了 ${row.recent_high_days} 個成交日，不到半年，高點偏低、回檔被低估`}
                            >
                              *
                            </span>
                          )}
                        </td>
                        <td
                          className={`p-2 py-3 text-right font-data-md text-data-md ${
                            row.pullback_pct != null && row.pullback_pct > PULLBACK_ALERT_PCT
                              ? 'bg-error/15 text-error font-bold'
                              : 'text-on-surface'
                          }`}
                          title={
                            row.pullback_pct != null && row.pullback_pct > PULLBACK_ALERT_PCT
                              ? `回檔超過 ${PULLBACK_ALERT_PCT}%`
                              : undefined
                          }
                        >
                          {formatPercent(row.pullback_pct)}
                        </td>
                        <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface">
                          {formatPe(valuations.get(row.symbol))}
                        </td>
                        <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface">
                          {formatPercent(valuations.get(row.symbol)?.dividend_yield)}
                        </td>
                        <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface whitespace-nowrap">
                          {formatRank(row.trade_value_rank, row.trade_value_rank_total)}
                        </td>
                        <td className="p-2 pr-4 py-3 text-right font-data-md text-data-md text-on-surface-variant whitespace-nowrap">
                          {row.date}
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-surface-container-low/40">
                          <td colSpan={19} className="p-4">
                            <GroupPeersPanel
                              row={row}
                              groups={groups}
                              quotes={quotes}
                              heat={heat}
                              quotesDate={quotesData.data?.date}
                              quotesLoading={quotesData.loading}
                              onPick={setSymbol}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
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

// 這一檔在族群裡的龍頭排名（1～3），不在龍頭三檔裡回 null。
function coreRank(item: GroupHeat | undefined, symbol: string): number | null {
  return item?.core.find((c) => c.symbol === symbol)?.rank ?? null;
}

interface GroupPeersPanelProps {
  row: BelowMAStock;
  groups: ReturnType<typeof useGroupIndex>['groups'];
  quotes: Map<string, DailyQuote>;
  heat: Map<string, { item: GroupHeat; rank: number; total: number }>;
  quotesDate: string | undefined;
  quotesLoading: boolean;
  onPick: (symbol: string) => void;
}

// 同族群的其他檔與當日漲跌。一檔可屬多個族群，每個族群各一張小表。
function GroupPeersPanel({ row, groups, quotes, heat, quotesDate, quotesLoading, onPick }: GroupPeersPanelProps) {
  const mine = groups.filter(({ members }) => members.some((m) => m.symbol === row.symbol));

  if (mine.length === 0) {
    return (
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        {row.name} 沒有歸進任何族群。族群是自己在「主題族群」建的，多數檔都沒有。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-stack-md">
      {mine.map(({ group, members }) => {
        const peers = members.filter((m) => m.symbol !== row.symbol);
        const h = heat.get(group.name);
        return (
          <div key={group.id} className="flex flex-col gap-stack-sm">
            <h3 className="font-headline-md text-body-md text-on-surface">
              {group.name}
              <span className="ml-2 font-body-sm text-body-sm text-on-surface-variant">
                其他 {peers.length} 檔
              </span>
              {h && (
                <span className="ml-3 font-body-sm text-body-sm text-on-surface-variant">
                  熱度第 <span className={`font-data-md ${h.rank <= HOT_GROUP_TOP ? 'text-primary font-bold' : 'text-on-surface'}`}>{h.rank}</span> / {h.total} 名
                  ・超額報酬 <span className={`font-data-md ${quoteColor(h.item.excess_return)}`}>{formatSignedPercent(h.item.excess_return)}</span>
                  {h.item.signal_labels.length > 0 && `・${h.item.signal_labels.join('、')}`}
                  {h.item.thin && '・涵蓋不足三檔，參考性低'}
                </span>
              )}
            </h3>
            {h && h.item.core.length > 0 && (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {h.item.core.slice(0, 3).map((c) => (
                  <span key={c.symbol} className="mr-4 whitespace-nowrap">
                    <span className="text-outline">{coreRankLabel(c.rank)}</span>{' '}
                    <span className={c.symbol === row.symbol ? 'font-bold text-primary' : 'text-on-surface'}>
                      {c.symbol} {c.name}
                    </span>{' '}
                    <span className={`font-data-md ${quoteColor(c.return_pct)}`}>
                      {formatSignedPercent(c.return_pct)}
                    </span>
                  </span>
                ))}
                <span className="text-outline">（依 {h.item.core_month} 月營收，不是今天漲最多的）</span>
              </p>
            )}
            {peers.length === 0 ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant">這個族群只有這一檔。</p>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-outline-variant">
                    <th className={`${TH} text-left`}>代號</th>
                    <th className={`${TH} text-left`}>名稱</th>
                    <th className={`${TH} text-right`}>收盤</th>
                    <th className={`${TH} text-right`}>漲跌</th>
                    <th className={`${TH} text-right`}>漲跌%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {peers.map((peer) => {
                    const q = quotes.get(peer.symbol);
                    const pct = q ? changePercent(q) : null;
                    return (
                      <tr
                        key={peer.symbol}
                        onClick={() => onPick(peer.symbol)}
                        className="hover:bg-surface-container-low/50 transition-colors cursor-pointer"
                        title="點擊設為目前選取的股票"
                      >
                        <td className="p-2 py-2 font-data-md text-data-md text-primary font-bold whitespace-nowrap">
                          {peer.symbol}
                        </td>
                        <td className="p-2 py-2 font-body-md text-body-md text-on-surface whitespace-nowrap">
                          {peer.name || q?.name || '—'}
                        </td>
                        <td className="p-2 py-2 text-right font-data-md text-data-md text-on-surface">
                          {q?.traded ? formatPrice(q.close) : '—'}
                        </td>
                        <td className={`p-2 py-2 text-right font-data-md text-data-md ${quoteColor(q?.change)}`}>
                          {q?.ex_dividend ? '除權息' : q?.traded ? formatSigned(q.change) : '—'}
                        </td>
                        <td className={`p-2 py-2 text-right font-data-md text-data-md ${quoteColor(pct)}`}>
                          {formatSignedPercent(pct)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        {quotesLoading
          ? '漲跌載入中…'
          : `漲跌為 ${quotesDate || '最新一天'} 收盤對前一交易日。收盤行情只落地自選股與額外名單，不在其中的檔顯示破折號；沒成交與除權息日也不計漲跌%。族群名次是熱度榜的現況排序（同一天的強弱），不是預測。`}
      </p>
    </div>
  );
}
