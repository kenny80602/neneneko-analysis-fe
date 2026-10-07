import { Fragment, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import { getBelowMA, getDailyQuotesByDate } from '../api/dailyQuote';
import { getGroupHeat } from '../api/groupHeat';
import { BelowMAStock, DailyQuote, GroupHeat } from '../api/types';
import { useSymbol } from '../context/SymbolContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { useGroupIndex } from '../hooks/useSymbolGroups';
import { useSymbolValuations } from '../hooks/useSymbolValuations';
import {
  changePercent,
  formatNumber,
  formatPercent,
  formatPrice,
  formatRank,
  formatSigned,
  formatSignedPercent,
  marketLabel,
  quoteColor,
} from '../utils/format';

// 半年約 125 個成交日；不到這個數字的高點是用不完整的歷史算的。
const SHORT_HISTORY_DAYS = 100;

// 族群熱度榜前幾名要上色。榜上的族群數量不固定，用固定名次而不是比例。
const HOT_GROUP_TOP = 20;

const TH = 'p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap';

export default function BelowMA() {
  const { setSymbol } = useSymbol();
  const { groups, names: groupNames } = useGroupIndex();
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

  // 展開後要看同族群的漲跌：一次抓最新一天的全部收盤，不必每展開一列發一次請求。
  // 族群成員不一定都有落地收盤（範圍是自選股加額外名單），查不到的那幾檔顯示破折號。
  const quotesData = useAsyncData(() => getDailyQuotesByDate(), []);
  const quotes = useMemo(
    () => new Map<string, DailyQuote>((quotesData.data?.quotes ?? []).map((q) => [q.symbol, q])),
    [quotesData.data]
  );

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
          收盤在季線以下是現況描述，不是買賣訊號。族群是自己在「主題族群」建的，破折號代表沒歸進任何族群。成交金額名次是最新一天在同市場普通股裡的名次，沒有名次（ETF、回補進來的日期）顯示破折號。族群熱度前 20 名用綠色標出（族群欄的 #名次，是熱度榜的現況排序、不是預測）。回檔 =（半年最高 − 收盤）÷ 半年最高，公式同持股試算；半年最高取已落地的收盤行情，不是去問 Yahoo，歷史不到約 100 個成交日的檔標紅色星號（回檔被低估）。本益比與殖利率取每一檔最新一筆估值，破折號是公司虧損算不出本益比、沒配息沒有殖利率，或估值還沒收集。
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
                            <span className="flex flex-wrap gap-1">
                              {mine.map((name) => {
                                const h = heat.get(name);
                                const hot = !!h && h.rank <= HOT_GROUP_TOP;
                                return (
                                  <span
                                    key={name}
                                    title={h ? `熱度第 ${h.rank} / ${h.total} 名${hot ? `（前 ${HOT_GROUP_TOP} 名）` : ''}` : '熱度榜沒有這個族群'}
                                    className={
                                      hot
                                        ? 'rounded px-1.5 py-0.5 bg-secondary/15 text-secondary font-bold'
                                        : 'px-1.5 py-0.5'
                                    }
                                  >
                                    {h ? `${name} #${h.rank}` : name}
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
                        <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface">
                          {formatPercent(row.pullback_pct)}
                        </td>
                        <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface">
                          {formatNumber(valuations.get(row.symbol)?.pe_ratio, 2)}
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
                          <td colSpan={13} className="p-4">
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
                  熱度第 <span className={`font-data-md ${h.rank <= HOT_GROUP_TOP ? 'text-secondary font-bold' : 'text-on-surface'}`}>{h.rank}</span> / {h.total} 名
                  ・超額報酬 <span className={`font-data-md ${quoteColor(h.item.excess_return)}`}>{formatSignedPercent(h.item.excess_return)}</span>
                  {h.item.signal_labels.length > 0 && `・${h.item.signal_labels.join('、')}`}
                  {h.item.thin && '・涵蓋不足三檔，參考性低'}
                </span>
              )}
            </h3>
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
