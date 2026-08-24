import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import StatCard from '../components/StatCard';
import PriceChart from '../components/PriceChart';
import SymbolSearch from '../components/SymbolSearch';
import TrendChart from '../components/TrendChart';
import { getAnnouncementHistory } from '../api/announcement';
import { getDailyQuoteHistory } from '../api/dailyQuote';
import { getInstitutionalHistory } from '../api/institutional';
import { getPortfolioValuation } from '../api/portfolio';
import { getRealtimeQuote } from '../api/realtimeQuote';
import { getFinancialHistory, getFinancialPeers } from '../api/financial';
import { getIndustryPeers, getRevenueHistory } from '../api/revenue';
import { getGroupPeers } from '../api/stockGroup';
import { FinancialPeer, IndustryPeer, IndustryPeers } from '../api/types';
import { getWarningHistory } from '../api/warning';
import { useSymbol } from '../context/SymbolContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { changePercentOver, toCandles } from '../utils/chart';
import {
  DASH,
  formatAmount,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPrice,
  formatShareToLot,
  formatSigned,
  formatSignedPercent,
  marketLabel,
  priceSourceLabel,
  quoteBadge,
  quoteColor,
} from '../utils/format';

// 即時報價是直接打證交所 MIS，上游有限流，30 秒是下限，別再壓短。
const POLLING_MS = 30_000;
// 畫圖用的收盤筆數。約兩年交易日：夠算日線的 MA60，也夠併出三年份的月 K。
const CHART_LIMIT = 500;
// 注意股回看的筆數。多數個股一筆都沒有，這個上限只是防呆。
const WARNING_LIMIT = 100;
const ANNOUNCEMENT_LIMIT = 5;
// 同產業個股要列哪幾家。半導體業有兩百多家，全列出來沒人會捲到底，
// 但只列前幾名對中段班的檔沒有意義——新應材在半導體業排 92/206，
// 跟台積電、聯發科擺在一起比不出東西。
//
// 所以主要列「名次相近」的那一段（規模接近的才有可比性），
// 前幾大另外用一小段帶過，看得到產業龍頭在什麼量級就好。
const PEER_LEADERS = 3;
const PEER_RADIUS = 7;
// 「近 5 日漲幅」用的間隔（5 個交易日 ≈ 一週）。
const RECENT_SPAN = 5;
// 名次走勢畫幾個交易日（約半年）。名次是從開始收集那天才有的，
// 一開始遠遠不到這個數，這個上限是留給以後資料長起來之後。
const RANK_SPAN = 120;

const cardClass = 'bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm';
const chipClass =
  'font-label-caps text-label-caps uppercase px-2 py-1 rounded-full border border-outline-variant bg-surface-container-low text-on-surface-variant';

/** 本益比顯示。null（虧損算不出來、EPS 沒抓到）維持破折號，不要補 0 倍。 */
function formatPe(value: number | null | undefined): string {
  const text = formatNumber(value, 2);
  return text === DASH ? text : `${text} 倍`;
}

/** 同產業表格的一列：分段標題或一家公司。 */
type PeerRow =
  | { kind: 'group'; key: string; label: string }
  | { kind: 'peer'; key: string; peer: IndustryPeer };

const toPeerRow = (peer: IndustryPeer): PeerRow => ({
  kind: 'peer',
  key: peer.symbol,
  peer,
});

/**
 * 挑出同產業表格要顯示的列：產業前幾大 + 目前這一檔前後各幾名。
 *
 * 後端回的是整個產業（依營收由大到小、名次已經算好），這裡只決定顯示哪一段。
 * 為什麼不直接列前 N 名：那對龍頭以外的檔沒有可比性，見 PEER_RADIUS 的註解。
 */
function buildPeerRows(data: IndustryPeers | undefined): PeerRow[] {
  const all = data?.peers ?? [];
  if (all.length === 0) return [];

  const own = data?.rank ?? 0;
  // 那個月沒公告營收就查不到自己的名次，沒有中心點可以取鄰居，退回列前段班。
  if (own <= 0) {
    return all.filter((peer) => peer.rank <= PEER_LEADERS + PEER_RADIUS * 2).map(toPeerRow);
  }

  const from = Math.max(1, own - PEER_RADIUS);
  const to = own + PEER_RADIUS;

  // 這一檔本來就在前段時，鄰居那一段已經接上（或蓋過）前幾大，
  // 拆成兩段只會多一條分隔線和重複的列，直接連續列出來。
  if (from <= PEER_LEADERS + 1) {
    return all.filter((peer) => peer.rank <= to).map(toPeerRow);
  }

  return [
    { kind: 'group', key: 'leaders', label: `產業前 ${PEER_LEADERS} 大` },
    ...all.filter((peer) => peer.rank <= PEER_LEADERS).map(toPeerRow),
    {
      kind: 'group',
      key: 'neighbors',
      label: `名次相近：第 ${from}–${Math.min(to, data?.total ?? to)} 名`,
    },
    ...all.filter((peer) => peer.rank >= from && peer.rank <= to).map(toPeerRow),
  ];
}

export default function Dashboard() {
  const { symbol, setSymbol } = useSymbol();
  const enabled = !!symbol;

  const quote = useAsyncData(() => getRealtimeQuote(symbol), [symbol], {
    enabled,
    pollingMs: POLLING_MS,
  });

  const history = useAsyncData(() => getDailyQuoteHistory(symbol, { limit: CHART_LIMIT }), [symbol], {
    enabled,
  });

  const institutional = useAsyncData(
    () => getInstitutionalHistory(symbol, { limit: 1 }),
    [symbol],
    { enabled }
  );

  const warnings = useAsyncData(() => getWarningHistory(symbol, { limit: WARNING_LIMIT }), [symbol], {
    enabled,
  });

  const announcements = useAsyncData(
    () => getAnnouncementHistory(symbol, { limit: ANNOUNCEMENT_LIMIT }),
    [symbol],
    { enabled }
  );

  // 產業別沒有專屬端點，月營收的回應剛好帶了 industry，所以借它一筆來拿。
  const profile = useAsyncData(() => getRevenueHistory(symbol, { limit: 1 }), [symbol], { enabled });

  // 試算是整份自選股一起回、不吃代號，所以 deps 留空只抓一次，換代號不必重打。
  // 但它會逐檔去取即時行情，沒選股就沒人要看，別讓它白打一輪上游。
  const valuation = useAsyncData(() => getPortfolioValuation(), [], { enabled });
  // 財報摘要與 ROE。一季才換一次，所以不必跟著即時報價一起輪詢。
  const financial = useAsyncData(() => getFinancialHistory(symbol), [symbol], { enabled });
  // 同產業比較。資料來自全市場的月營收，跟自選股無關，任何一檔都查得到。
  const peers = useAsyncData(() => getIndustryPeers(symbol), [symbol], { enabled });
  const peerRows = useMemo(() => buildPeerRows(peers.data), [peers.data]);

  // 最新一季的財報。後端已經照年季由新到舊排好，取第一筆就是。
  const latestFinancial = financial.data?.items[0];

  // 自己建的主題族群。跟上面那支是兩回事：官方產業別把矽晶圓三家全歸「半導體業」
  // （一百多家），又把散熱三家拆進三個不同產業，兩個方向都沒辦法「同類放一起」。
  const groups = useAsyncData(() => getGroupPeers(symbol), [symbol], { enabled });
  // 族群成員的 ROE。跟上面那支是同一組成員、不同的資料源與更新頻率
  // （營收一個月一次、ROE 一季一次），後端也是兩支端點，所以這裡分開抓再併。
  //
  // 併不到就是那一格破折號：ROE 慢一季、族群剛加的成員可能還沒有那一季的財報。
  // 讓它們共用一次請求的話，任何一邊慢或失敗都會拖累另一邊。
  const groupRoe = useAsyncData(() => getFinancialPeers(symbol), [symbol], { enabled });

  /** 族群 ROE 依「族群 id + 代號」查得到的索引，給下面那張表併欄用。 */
  const roeByGroup = useMemo(() => {
    const index = new Map<string, FinancialPeer>();
    for (const group of groupRoe.data?.groups ?? []) {
      for (const peer of group.peers) {
        index.set(`${group.group_id}::${peer.symbol}`, peer);
      }
    }
    return index;
  }, [groupRoe.data]);

  /** 每個族群那一季的標示（2026Q2）。各族群固定同一季，但不同族群可能不同。 */
  const roePeriodByGroup = useMemo(() => {
    const index = new Map<string, string>();
    for (const group of groupRoe.data?.groups ?? []) {
      index.set(group.group_id, group.period);
    }
    return index;
  }, [groupRoe.data]);

  // 名次走勢直接吃 history 那份收盤行情，不另外發請求——名次就存在同一列上。
  // x 軸只放有收盤資料的日子，那些就是交易日，不必另外維護一份交易日曆。
  const ranks = useMemo(() => {
    const points = [...(history.data?.quotes ?? [])].reverse().slice(-RANK_SPAN);
    return {
      points,
      hasRank: points.some((q) => q.trade_value_rank != null || q.change_rank != null),
      // 分母取最後一個有名次的交易日：掛牌檔數逐年變動，用最新的當標題比較貼近現況。
      latest: [...points].reverse().find((q) => q.trade_value_rank_total != null),
    };
  }, [history.data]);

  const row = useMemo(
    () => valuation.data?.find((item) => item.symbol === symbol),
    [valuation.data, symbol]
  );

  // 近 5 日漲幅拿日 K 現算：即時報價只有「相對昨收」，看不出這一週的走勢。
  const recentChange = useMemo(
    () => changePercentOver(toCandles(history.data?.quotes, 'day'), RECENT_SPAN),
    [history.data]
  );

  const latestFlow = institutional.data?.items[0];
  const warningCount = warnings.data?.count ?? 0;
  const latestWarning = warnings.data?.items[0];

  const flowRows = latestFlow
    ? [
        { label: '外資', flow: latestFlow.foreign_excluding_dealers },
        { label: '投信', flow: latestFlow.investment_trust },
        {
          // 上游把自營商拆成自行買賣與避險兩段，買賣超則直接給合計（dealers_net）。
          // 這裡只加總買進與賣出，買賣超照用後端的值，不自己相減。
          label: '自營商',
          flow: {
            buy: latestFlow.dealers_proprietary.buy + latestFlow.dealers_hedge.buy,
            sell: latestFlow.dealers_proprietary.sell + latestFlow.dealers_hedge.sell,
            net: latestFlow.dealers_net,
          },
        },
      ]
    : [];

  return (
    <>
      <PageHeader
        title={symbol ? `${symbol} ${quote.data?.name ?? ''}`.trim() : '個股總覽'}
        icon="monitoring"
        subtitle={
          symbol
            ? [
                marketLabel(quote.data?.market ?? profile.data?.market),
                profile.data?.industry,
                quote.data ? `報價 ${formatDateTime(quote.data.quote_time)}` : '',
              ]
                .filter((part) => part && part !== DASH)
                .join(' · ')
            : undefined
        }
        right={<SymbolSearch />}
      />

      <div className="flex flex-col gap-stack-lg">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          現價為即時報價（每 {POLLING_MS / 1000} 秒更新），本益比、回檔與建議買區來自自選股試算，
          三大法人與 K 線取自已落地的收盤資料。破折號代表那個值算不出來或上游沒給，不是 0。
        </p>

        {!symbol && (
          <PageState kind="idle" hint="在右上角輸入股票代號，或從左側自選股清單挑一檔。" />
        )}

        {symbol && quote.loading && !quote.data && <PageState kind="loading" />}

        {/*
          即時報價失敗不整頁擋掉：這一頁只有最上面那張卡吃即時報價，
          K 線、三大法人、月營收、注意股與重大訊息全部來自已落地的資料，
          跟證交所 MIS 的死活無關。MIS 本來就常態性不穩（收盤後、限流），
          為了它把八成拿得到的內容一起藏起來，換來的是一頁「看起來壞掉」的畫面。
          報價的錯誤改在它自己那張卡裡就地交代。
        */}
        {symbol && (
          <>
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-stack-lg">
              <div className="lg:col-span-2 flex flex-col gap-stack-lg">
                <div className={`${cardClass} p-6 flex flex-wrap justify-between gap-stack-lg`}>
                  <div>
                    <h2 className="font-display text-display text-primary">
                      {/* 報價掛掉時名稱改用月營收那支帶回來的，兩邊都沒有就只顯示代號。 */}
                      {symbol} {quote.data?.name ?? profile.data?.name ?? ''}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className={chipClass}>
                        {marketLabel(quote.data?.market ?? profile.data?.market)}
                      </span>
                      {profile.data?.industry && (
                        <span className={chipClass}>{profile.data.industry}</span>
                      )}
                      {warningCount > 0 && (
                        <span
                          className="font-label-caps text-label-caps uppercase px-2 py-1 rounded-full border border-error/30 bg-error/5 text-error"
                          title={`最近 ${WARNING_LIMIT} 筆查詢範圍內被列為注意股的次數，最近一次 ${formatDate(
                            latestWarning?.date
                          )}`}
                        >
                          注意股 {warningCount} 次
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-end gap-stack-lg">
                    <div className="flex flex-col">
                      <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                        現價
                      </span>
                      <span className={`font-data-lg text-display ${quoteColor(quote.data?.change)}`}>
                        {/*
                          三種狀態要分清楚：報價服務掛了（取價失敗）、
                          服務有回但這檔沒價（暫無報價）、有價。
                        */}
                        {quote.error
                          ? '取價失敗'
                          : quote.data?.price == null
                          ? '暫無報價'
                          : formatPrice(quote.data.price)}
                      </span>
                      {quote.error ? (
                        <button
                          type="button"
                          onClick={quote.reload}
                          className="font-body-sm text-body-sm text-error text-left hover:underline"
                          title={quote.error}
                        >
                          即時報價暫時取不到，點此重試（其餘區塊為已落地的資料，不受影響）
                        </button>
                      ) : (
                        <span className="font-body-sm text-body-sm text-outline">
                          {priceSourceLabel(quote.data?.price_source)} ·{' '}
                          {formatDateTime(quote.data?.price_as_of)}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col gap-1 pl-6 border-l border-outline-variant">
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-body-sm text-body-sm text-on-surface-variant">漲跌</span>
                        <span className={`font-data-md text-data-md ${quoteColor(quote.data?.change)}`}>
                          {formatSigned(quote.data?.change)}（
                          {formatSignedPercent(quote.data?.change_percent)}）
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-body-sm text-body-sm text-on-surface-variant">
                          近 {RECENT_SPAN} 日
                        </span>
                        <span className={`font-data-md text-data-md ${quoteColor(recentChange)}`}>
                          {formatSignedPercent(recentChange)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-body-sm text-body-sm text-on-surface-variant">回檔</span>
                        {/*
                          回檔是「離半年最高多遠」，數字越大越便宜，所以不套漲跌色。
                          後端給的是正數（跌得越深越大），畫面上取負號顯示成「離高點 -x%」；
                          直接串 '-' 會在剛好持平時印出 -0.00%，盤中創新高（負回檔）時還會變成 --x%。
                        */}
                        <span className="font-data-md text-data-md text-on-surface">
                          {row?.pullback_percent == null
                            ? DASH
                            : formatSignedPercent(-row.pullback_percent)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1 pl-6 border-l border-outline-variant">
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        建議買區
                      </span>
                      <span
                        className={`font-data-md text-data-lg px-3 py-1 rounded ${
                          row?.in_buy_zone
                            ? 'text-secondary bg-secondary/10 border border-secondary/20'
                            : 'text-on-surface bg-surface-container border border-outline-variant'
                        }`}
                      >
                        {row?.buy_zone_low == null || row.buy_zone_high == null
                          ? DASH
                          : `${formatPrice(row.buy_zone_low)} ~ ${formatPrice(row.buy_zone_high)}`}
                      </span>
                      <span className="font-body-sm text-body-sm text-outline">
                        {row?.in_buy_zone ? '現價已進入買區' : '半年最高 × 0.65 ~ 0.70'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className={`${cardClass} p-6`}>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-stack-md">
                    {[
                      { label: '歷史 PE', value: row?.historical_pe },
                      { label: '高點 PE', value: row?.high_pe },
                      { label: '預估 PE', value: row?.estimated_pe },
                      { label: '年化 PE', value: row?.annualized_pe },
                    ].map((item) => (
                      <div key={item.label} className="flex flex-col items-center gap-1">
                        <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                          {item.label}
                        </span>
                        <span className="font-data-lg text-data-lg text-on-surface">
                          {formatPe(item.value)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/*
                    試算要逐檔去取即時行情與 EPS，二十幾檔跑十秒起跳。這段期間上面全是破折號，
                    不講清楚會被讀成「算不出來」——破折號在這個專案有明確語意，不能拿來當載入中用。
                  */}
                  {valuation.loading && (
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-4 pt-4 border-t border-outline-variant">
                      試算中…（逐檔取即時行情與 EPS 現算，約需十秒）
                    </p>
                  )}
                  {valuation.error && (
                    <p className="font-body-sm text-body-sm text-error mt-4 pt-4 border-t border-outline-variant">
                      試算失敗：{valuation.error}
                    </p>
                  )}
                  {!row && !valuation.loading && !valuation.error && (
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-4 pt-4 border-t border-outline-variant">
                      這檔不在自選股清單裡，沒有試算結果——本益比、回檔與建議買區都要靠試算才有。
                      自選股的增刪目前走 LINE 聊天室，輸入「加 {symbol}」即可加入。
                    </p>
                  )}
                  {row?.error && (
                    <p className="font-body-sm text-body-sm text-error mt-4 pt-4 border-t border-outline-variant">
                      試算取價失敗：{row.error}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-stack-lg">
                <div className={`${cardClass} p-6 flex flex-col gap-stack-sm`}>
                  <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-2 pb-3 border-b border-outline-variant">
                    <span className="material-symbols-outlined text-[20px]">trending_up</span>
                    交易狀態
                  </h3>

                  {[
                    {
                      label: '累積成交量',
                      // 即時報價的成交量上游沒標單位，不換算成張，原樣顯示。
                      // 報價整支掛掉時是「不知道」而不是「尚無成交」，兩者差很多。
                      value: !quote.data
                        ? DASH
                        : quote.data.traded
                        ? formatNumber(quote.data.volume)
                        : '尚無成交',
                    },
                    {
                      label: '今日區間',
                      value:
                        quote.data?.low == null || quote.data?.high == null
                          ? DASH
                          : `${formatPrice(quote.data.low)} – ${formatPrice(quote.data.high)}`,
                    },
                    { label: '昨收', value: formatPrice(quote.data?.previous_close) },
                    { label: '半年最高', value: formatPrice(row?.recent_high) },
                    {
                      // 產業排名依「最新月份的單月營收」，那是唯一涵蓋全市場的數字。
                      // 排名 0 代表這一檔那個月沒公告營收，不是「第 0 名」。
                      label: '產業排名',
                      value:
                        peers.data && peers.data.rank > 0
                          ? `#${peers.data.rank} / ${peers.data.total} ${peers.data.industry}`
                          : DASH,
                    },
                    {
                      // 只有上市有累計次數，上櫃固定是 null——那是「沒公布」不是「沒被列過」。
                      label: '注意股累計',
                      value:
                        latestWarning?.announcement_count == null
                          ? DASH
                          : `第 ${latestWarning.announcement_count} 次`,
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex justify-between items-center">
                      <span className="font-body-md text-body-md text-on-surface-variant">
                        {item.label}
                      </span>
                      <span className="font-data-md text-data-md text-on-surface">{item.value}</span>
                    </div>
                  ))}
                </div>

                <div className={`${cardClass} p-6 flex flex-col gap-stack-sm flex-1`}>
                  <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-2 pb-3 border-b border-outline-variant">
                    <span className="material-symbols-outlined text-[20px]">groups</span>
                    三大法人買賣超
                  </h3>

                  {institutional.loading && (
                    <p className="font-body-sm text-body-sm text-on-surface-variant">載入中…</p>
                  )}
                  {institutional.error && (
                    <p className="font-body-sm text-body-sm text-error">{institutional.error}</p>
                  )}
                  {!institutional.loading && !institutional.error && !latestFlow && (
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      沒有三大法人資料。這張表只收得到上市的資料（上櫃上游沒有日期參數，收不了歷史），
                      而且只涵蓋自選股清單裡、已收集過的交易日。
                    </p>
                  )}

                  {latestFlow && (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-outline-variant">
                              <th className="pb-2 font-label-caps text-label-caps text-on-surface-variant uppercase">
                                法人
                              </th>
                              <th className="pb-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase">
                                買進
                              </th>
                              <th className="pb-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase">
                                賣出
                              </th>
                              <th className="pb-2 text-right font-label-caps text-label-caps text-on-surface-variant uppercase">
                                買賣超
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/50">
                            {flowRows.map((item) => (
                              <tr key={item.label}>
                                <td className="py-2 font-body-sm text-body-sm text-on-surface">
                                  {item.label}
                                </td>
                                <td className="py-2 text-right font-data-md text-data-md text-on-surface-variant">
                                  {formatShareToLot(item.flow.buy)}
                                </td>
                                <td className="py-2 text-right font-data-md text-data-md text-on-surface-variant">
                                  {formatShareToLot(item.flow.sell)}
                                </td>
                                <td className="py-2 text-right">
                                  <span
                                    className={`font-data-md text-data-md px-2 py-0.5 rounded ${quoteBadge(
                                      item.flow.net
                                    )}`}
                                  >
                                    {formatShareToLot(item.flow.net)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {latestFlow.date} · 單位張。合計買賣超{' '}
                        <span className={quoteColor(latestFlow.total_net)}>
                          {formatShareToLot(latestFlow.total_net)}
                        </span>{' '}
                        張（後端算好的合計，外資自營商已計入自營商，三列相加不等於它）。
                      </p>
                    </>
                  )}
                </div>
              </div>
            </section>

            {history.loading && <PageState kind="loading" />}
            {history.error && (
              <PageState kind="error" message={history.error} onRetry={history.reload} />
            )}
            {!history.loading && !history.error && <PriceChart quotes={history.data?.quotes ?? []} />}

            <section className={`${cardClass} p-6 flex flex-col gap-stack-md`}>
              <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">leaderboard</span>
                全市場名次走勢
                {ranks.latest?.trade_value_rank_total != null && (
                  <span className={chipClass}>
                    {marketLabel(ranks.latest.market)} 共{' '}
                    {formatNumber(ranks.latest.trade_value_rank_total)} 檔
                  </span>
                )}
              </h3>

              <p className="font-body-sm text-body-sm text-on-surface-variant">
                這一檔每天在<span className="text-on-surface">同市場所有普通股</span>
                裡的成交金額名次與漲跌幅名次（上市跟上市比、上櫃跟上櫃比）。
                名次是收盤後從全市場收盤行情現算的，ETF、權證與特別股不納入，所以分母比掛牌檔數少。
              </p>

              {ranks.points.length > 0 && !ranks.hasRank && (
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  這段期間還沒有名次。名次只能每天收集、回補不了——回補走的是單檔歷史端點，
                  那裡問不到當天的全市場，所以開始收集之前的日子一律沒有名次。
                  另外 ETF 與當天沒成交的日子本來就不會有。
                </p>
              )}

              {ranks.hasRank && (
                <TrendChart
                  mode="line"
                  invert
                  digits={0}
                  unit="名"
                  series={[
                    {
                      label: '成交金額名次',
                      className: 'stroke-primary',
                      points: ranks.points.map((q) => ({
                        date: q.date,
                        value: q.trade_value_rank,
                      })),
                    },
                    {
                      label: '漲跌幅名次',
                      className: 'stroke-on-primary-container',
                      dash: '8 5',
                      points: ranks.points.map((q) => ({
                        date: q.date,
                        value: q.change_rank,
                      })),
                    },
                  ]}
                  footnote="Y 軸是反的：第 1 名在最上面，線往上代表名次進步。成交金額名次看的是「今天有多少錢在這一檔上進出」，漲跌幅名次看的是「今天贏過幾檔」，兩條常常不同步——量爆大但收黑的日子，一條衝上去另一條會掉下來。除權息當天沒有漲跌幅名次（那天的漲跌跟前一日沒有可比性），線會斷一格；當天沒成交則兩條都斷。"
                />
              )}
            </section>

            <section className={`${cardClass} p-6 flex flex-col gap-stack-md`}>
              <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">workspaces</span>
                主題族群
                {groups.data && groups.data.length > 1 && (
                  <span className={chipClass}>{groups.data.length} 個</span>
                )}
              </h3>

              <p className="font-body-sm text-body-sm text-on-surface-variant">
                自己整理的族群，
                <span className="text-on-surface">跟下面的官方產業別是兩回事</span>
                ——矽晶圓的中美晶、環球晶、台勝科官方全歸「半導體業」（一百多家，台積電也在裡面）；
                散熱的雙鴻、高力、奇鋐則分屬其他電子業、電機機械、電腦及週邊設備業，
                官方分類永遠不會把它們放在一起。所以族群得自己維護，在
                <Link to="/settings" className="text-primary hover:underline">
                  設定
                </Link>
                裡改。
                比的是<span className="text-on-surface">近五日漲跌幅、ROE 與月營收</span>
                ：成員不必在自選股裡，所以那幾欄各走一條路——
                月營收是唯一涵蓋全市場的落地資料，
                <span className="text-on-surface">近五日漲跌幅則是即時去問延遲約 20 分鐘的日 K</span>
                （站上落地的收盤只收自選股，只靠它會有一半是破折號）。
                「近五日」是滾動 5 個交易日，不是本週一到今天——後者在週一只涵蓋一天，
                成員之間就沒得比。
                <span className="text-on-surface">ROE 是年化值、一季才換一次</span>
                ，跟左邊的股價與右邊的月營收都不同步，三個期間各自標在族群名稱旁邊；
                金融業不在上游的一般業報表裡，那幾檔的 ROE 一律是破折號。
                破折號一律代表「沒取到或算不出來」而不是 0%。金額單位為新台幣千元。
              </p>

              {groups.loading && (
                <p className="font-body-sm text-body-sm text-on-surface-variant">載入中…</p>
              )}
              {groups.error && (
                <p className="font-body-sm text-body-sm text-error">{groups.error}</p>
              )}
              {!groups.loading && !groups.error && groups.data?.length === 0 && (
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  這一檔還沒被歸進任何族群。族群是人工整理的，免費資料源沒有現成的，
                  要自己在
                  <Link to="/settings" className="text-primary hover:underline">
                    設定
                  </Link>
                  裡建（例如建一個「散熱」，成員填 3324、8996、3017）。
                  一檔可以同時屬於多個族群，中美晶就同時是矽晶圓與太陽能。
                </p>
              )}

              {groups.data?.map((entry) => (
                <div key={entry.group.id} className="flex flex-col gap-stack-sm">
                  <p className="font-body-md text-body-md text-on-surface flex items-center gap-2">
                    <span className={chipClass}>{entry.group.name}</span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      {entry.peers.length} 檔
                      {entry.month && ` · ${entry.month} 月營收`}
                      {/* 兩個期間都標出來：營收是月、ROE 是季，同一張表上不同步。 */}
                      {roePeriodByGroup.get(entry.group.id) &&
                        ` · ${roePeriodByGroup.get(entry.group.id)} ROE`}
                    </span>
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-outline-variant">
                    <table className="w-full border-collapse">
                      <thead className="bg-surface-container-low border-b border-outline-variant">
                        <tr>
                          <th className="p-2 pl-4 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-left">
                            股號 / 名稱
                          </th>
                          <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-left">
                            官方產業別
                          </th>
                          <th
                            className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-right"
                            title="最近 5 個交易日的漲跌幅，來源是延遲約 20 分鐘的日 K"
                          >
                            近五日
                          </th>
                          <th
                            className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-right"
                            title="年化 ROE。一季換一次，跟左邊的股價與右邊的月營收都不同步"
                          >
                            ROE
                          </th>
                          <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-right">
                            單月營收
                          </th>
                          <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-right">
                            月增率
                          </th>
                          <th className="p-2 pr-4 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-right">
                            年增率
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/50">
                        {entry.peers.map((peer) => {
                          const isSelf = peer.symbol === symbol;
                          // 沒營收時月增率與年增率一起沒有意義，整列給破折號而不是 0%。
                          const noRevenue = peer.revenue === null;
                          // ROE 走另一支端點，用「族群 id + 代號」併回來。
                          // 併不到（沒那一季的財報、金融業、代號打錯）就是破折號。
                          const roe = roeByGroup.get(`${entry.group.id}::${peer.symbol}`);
                          return (
                            <tr
                              key={peer.symbol}
                              onClick={() => setSymbol(peer.symbol)}
                              title="點擊切換到這一檔"
                              className={`transition-colors cursor-pointer ${
                                isSelf
                                  ? 'bg-primary-container/10'
                                  : 'hover:bg-surface-container-low/50'
                              }`}
                            >
                              <td className="p-2 pl-4 py-3 whitespace-nowrap">
                                <span
                                  className={`font-data-md text-data-md text-primary ${
                                    isSelf ? 'font-bold' : ''
                                  }`}
                                >
                                  {peer.symbol}
                                </span>{' '}
                                <span className="font-body-md text-body-md text-on-surface-variant">
                                  {peer.name || DASH}
                                </span>
                                {/* 標出非自選股，否則使用者會以為是自己漏收了那幾檔的價格。 */}
                                {!peer.in_watchlist && (
                                  <span className="text-outline font-body-sm text-body-sm">
                                    {' '}
                                    · 非自選股
                                  </span>
                                )}
                              </td>
                              <td className="p-2 py-3 font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                                {peer.industry || DASH}
                              </td>
                              {/* 這一欄跟營收那三欄的資料來源不同（Yahoo 日 K vs 觀測站），
                                  所以 null 各自判斷：沒有營收不代表沒有股價。 */}
                              <td
                                className={`p-2 py-3 text-right font-data-md text-data-md ${quoteColor(
                                  peer.week_change
                                )}`}
                              >
                                {formatSignedPercent(peer.week_change)}
                              </td>
                              {/* 年化 ROE。名次放 title 而不是排進表格：這張表是照營收排的，
                                  多一欄名次會讓人以為表格本身是照 ROE 排序。 */}
                              <td
                                className="p-2 py-3 text-right font-data-md text-data-md text-on-surface"
                                title={
                                  roe?.rank
                                    ? `族群內 ROE 第 ${roe.rank} 名`
                                    : 'ROE 算不出來或沒有那一季的財報'
                                }
                              >
                                {formatSignedPercent(roe?.statement?.annualized_roe ?? null)}
                              </td>
                              <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface">
                                {formatNumber(peer.revenue)}
                              </td>
                              <td
                                className={`p-2 py-3 text-right font-data-md text-data-md ${
                                  noRevenue ? '' : quoteColor(peer.mom)
                                }`}
                              >
                                {noRevenue ? DASH : formatSignedPercent(peer.mom)}
                              </td>
                              <td
                                className={`p-2 pr-4 py-3 text-right font-data-md text-data-md ${
                                  noRevenue ? '' : quoteColor(peer.yoy)
                                }`}
                              >
                                {noRevenue ? DASH : formatSignedPercent(peer.yoy)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </section>

            <section className={`${cardClass} p-6 flex flex-col gap-stack-md`}>
              <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">group</span>
                同產業個股
                {peers.data?.industry && (
                  <span className={chipClass}>{peers.data.industry}</span>
                )}
              </h3>

              {/*
                講清楚這是「官方產業別」而不是「主題族群」，否則使用者會問
                為什麼同樣做散熱的高力、奇鋐、雙鴻沒有排在一起——它們分屬三個產業。
              */}
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                依證交所的官方產業分類，用最新月份的單月營收排名。
                產業別直接沿用公開資訊觀測站，跟部分看盤軟體的自訂分類不一定一樣。
                <span className="text-on-surface">這不是「散熱」「AI」那種主題族群</span>
                ——那個看上面那一塊，同樣做散熱的公司在這裡會分屬不同產業。
                排名用營收而不是股價或本益比，是因為月營收是唯一涵蓋全市場的數字；
                收盤價與估值只收自選股那幾檔，拿來排名會變成「自選股內排名」。
                金額單位為新台幣千元。
              </p>

              {peers.loading && (
                <p className="font-body-sm text-body-sm text-on-surface-variant">載入中…</p>
              )}
              {peers.error && (
                <p className="font-body-sm text-body-sm text-error">{peers.error}</p>
              )}
              {!peers.loading && !peers.error && (peers.data?.peers.length ?? 0) === 0 && (
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  查不到這一檔的產業別。ETF、剛上市還沒公告月營收的公司，
                  以及不在公開資訊觀測站月營收表裡的標的都會是這個狀態。
                </p>
              )}

              {peers.data && peers.data.peers.length > 0 && (
                <>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {peers.data.month} 月營收 · 共 {peers.data.total} 家
                    {peers.data.rank > 0 && (
                      <>
                        {' '}
                        · 這一檔排第{' '}
                        <span className="font-data-md text-data-md text-primary font-bold">
                          {peers.data.rank}
                        </span>
                      </>
                    )}
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-outline-variant">
                    <table className="w-full border-collapse">
                      <thead className="bg-surface-container-low border-b border-outline-variant">
                        <tr>
                          <th className="p-2 pl-4 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-right">
                            名次
                          </th>
                          <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-left">
                            股號 / 名稱
                          </th>
                          <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-right">
                            單月營收
                          </th>
                          <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-right">
                            月增率
                          </th>
                          <th className="p-2 pr-4 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap text-right">
                            年增率
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/50">
                        {peerRows.map((row) => {
                          if (row.kind === 'group') {
                            return (
                              <tr key={row.key} className="bg-surface-container-low">
                                <td
                                  colSpan={5}
                                  className="p-2 pl-4 py-2 font-label-caps text-label-caps text-on-surface-variant uppercase"
                                >
                                  {row.label}
                                </td>
                              </tr>
                            );
                          }
                          const peer = row.peer;
                          const isSelf = peer.symbol === symbol;
                          return (
                            <tr
                              key={peer.symbol}
                              onClick={() => setSymbol(peer.symbol)}
                              title="點擊切換到這一檔"
                              className={`transition-colors cursor-pointer ${
                                isSelf ? 'bg-primary-container/10' : 'hover:bg-surface-container-low/50'
                              }`}
                            >
                              <td className="p-2 pl-4 py-3 text-right font-data-md text-data-md text-on-surface-variant">
                                {peer.rank}
                              </td>
                              <td className="p-2 py-3 whitespace-nowrap">
                                <span
                                  className={`font-data-md text-data-md ${
                                    isSelf ? 'text-primary font-bold' : 'text-primary'
                                  }`}
                                >
                                  {peer.symbol}
                                </span>{' '}
                                <span className="font-body-md text-body-md text-on-surface-variant">
                                  {peer.name}
                                </span>
                                <span className="text-outline font-body-sm text-body-sm">
                                  {' '}
                                  · {marketLabel(peer.market)}
                                </span>
                              </td>
                              <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface">
                                {formatNumber(peer.revenue)}
                              </td>
                              <td
                                className={`p-2 py-3 text-right font-data-md text-data-md ${quoteColor(
                                  peer.mom
                                )}`}
                              >
                                {formatSignedPercent(peer.mom)}
                              </td>
                              <td
                                className={`p-2 pr-4 py-3 text-right font-data-md text-data-md ${quoteColor(
                                  peer.yoy
                                )}`}
                              >
                                {formatSignedPercent(peer.yoy)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* 比的是真的列出來幾家，不是 peerRows 的長度——那裡面還有分段標題。 */}
                  {peers.data.total > peerRows.filter((row) => row.kind === 'peer').length && (
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      共 {peers.data.total} 家，這裡只列產業前 {PEER_LEADERS} 大與這一檔前後各{' '}
                      {PEER_RADIUS} 名。
                      <span className="text-on-surface">名次相近的才有可比性</span>
                      ——同產業裡龍頭與中段班的規模常常差好幾個量級，擺在一起比不出東西。
                    </p>
                  )}
                </>
              )}
            </section>

            <section className={`${cardClass} p-6 flex flex-col gap-stack-md`}>
              <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">event_note</span>
                重大訊息
              </h3>

              {announcements.loading && (
                <p className="font-body-sm text-body-sm text-on-surface-variant">載入中…</p>
              )}
              {announcements.error && (
                <p className="font-body-sm text-body-sm text-error">{announcements.error}</p>
              )}
              {!announcements.loading &&
                !announcements.error &&
                announcements.data?.items.length === 0 && (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    沒有重大訊息。多數公司一個月發不到一則，而且涵蓋範圍只有「開始收集之後的每一天」——
                    上游只回最近一兩個交易日，排程停掉的那幾天補不回來。
                  </p>
                )}

              {announcements.data?.items.map((item) => (
                <div
                  key={`${item.announced_at}-${item.subject}`}
                  className="flex items-start gap-stack-md p-4 rounded-xl border border-outline-variant bg-surface-container-low"
                >
                  <span className="material-symbols-outlined text-[24px] text-on-surface-variant shrink-0">
                    campaign
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-body-lg text-body-lg text-on-surface font-semibold">
                      {item.subject}
                    </p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 line-clamp-2 whitespace-pre-line">
                      {item.detail}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="font-data-md text-data-md text-on-surface-variant">
                        {item.announced_at}
                      </span>
                      {item.clause && <span className={chipClass}>{item.clause}</span>}
                      {/* 事實發生日可能早於發言日很多（補公告），上游沒給時是空字串。 */}
                      {item.occurred_on && (
                        <span className="font-body-sm text-body-sm text-outline">
                          事實發生日 {item.occurred_on}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </section>

            {/* ── 獲利體質（ROE）── */}
            <section className={`${cardClass} p-6 flex flex-col gap-stack-md`}>
              <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">savings</span>
                獲利體質
                {latestFinancial && <span className={chipClass}>{latestFinancial.period}</span>}
              </h3>

              <p className="font-body-sm text-body-sm text-on-surface-variant">
                ROE ＝ 稅後淨利 ÷ 股東權益，衡量公司拿股東的錢賺回多少。
                資料來自公開資訊觀測站的損益表與資產負債表，
                <span className="text-on-surface">一季才換一次</span>
                ，跟上面那些每天變的價格指標不同。分子只取「歸屬母公司」的淨利、
                分母只取「歸屬母公司」的權益，兩邊口徑一致。
              </p>

              {financial.loading && (
                <p className="font-body-sm text-body-sm text-on-surface-variant">載入中…</p>
              )}
              {financial.error && (
                <p className="font-body-sm text-body-sm text-error">{financial.error}</p>
              )}
              {!financial.loading && !financial.error && !latestFinancial && (
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  查不到這一檔的財報。金融業（銀行、保險、證券、金控）不在上游的一般業報表裡，
                  剛上市還沒申報的也查不到；另外這份是從 2026-08-16 才開始收集的，
                  更早的季別沒有留下來。
                </p>
              )}

              {latestFinancial && (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-gutter">
                    <StatCard
                      label="ROE（年化）"
                      icon="percent"
                      value={formatSignedPercent(latestFinancial.annualized_roe)}
                      hint={`${latestFinancial.period} 累計 ${formatSignedPercent(
                        latestFinancial.roe
                      )} 推估`}
                      valueClassName={quoteColor(latestFinancial.annualized_roe)}
                    />
                    <StatCard
                      label="稅後淨利"
                      icon="payments"
                      value={formatAmount(latestFinancial.net_income * 1000)}
                      hint={`元，${latestFinancial.period} 累計（ROE 的分子）`}
                      valueClassName={quoteColor(latestFinancial.net_income)}
                    />
                    <StatCard
                      label="股東權益"
                      icon="account_balance"
                      value={formatAmount(latestFinancial.equity * 1000)}
                      hint="元，期末餘額（ROE 的分母）"
                    />
                    <StatCard
                      label="每股淨值"
                      icon="book"
                      value={formatPrice(latestFinancial.book_value_per_share)}
                      hint={`元，EPS ${formatPrice(latestFinancial.eps)}（累計）`}
                    />
                  </div>

                  {financial.data && financial.data.count > 1 && (
                    <div className="overflow-x-auto rounded-xl border border-outline-variant">
                      <table className="w-full border-collapse">
                        <thead className="bg-surface-container-low border-b border-outline-variant">
                          <tr>
                            <th className="p-2 pl-4 font-label-caps text-label-caps text-on-surface-variant uppercase text-left">
                              期別
                            </th>
                            <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase text-right">
                              ROE（累計）
                            </th>
                            <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase text-right">
                              ROE（年化）
                            </th>
                            <th className="p-2 font-label-caps text-label-caps text-on-surface-variant uppercase text-right">
                              稅後淨利
                            </th>
                            <th className="p-2 pr-4 font-label-caps text-label-caps text-on-surface-variant uppercase text-right">
                              EPS
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/50">
                          {financial.data.items.map((item) => (
                            <tr key={item.period} className="hover:bg-surface-container-low/50">
                              <td className="p-2 pl-4 py-3 font-body-md text-body-md text-on-surface">
                                {item.period}
                              </td>
                              <td
                                className={`p-2 py-3 text-right font-data-md text-data-md ${quoteColor(
                                  item.roe
                                )}`}
                              >
                                {formatSignedPercent(item.roe)}
                              </td>
                              <td
                                className={`p-2 py-3 text-right font-data-md text-data-md ${quoteColor(
                                  item.annualized_roe
                                )}`}
                              >
                                {formatSignedPercent(item.annualized_roe)}
                              </td>
                              <td className="p-2 py-3 text-right font-data-md text-data-md text-on-surface-variant">
                                {formatAmount(item.net_income * 1000)}
                              </td>
                              <td className="p-2 pr-4 py-3 text-right font-data-md text-data-md text-on-surface-variant">
                                {formatPrice(item.eps)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    上游給的是<span className="text-on-surface">累計數</span>：
                    {latestFinancial.period} 那一列指的是今年前 {latestFinancial.quarter} 季合計，
                    不是單季。「年化」是拿它乘 4 ÷ {latestFinancial.quarter} 推成整年，
                    <span className="text-on-surface">是推估不是實績</span>
                    ——旺季在下半年的公司用上半年推會低估。真正的近四季 ROE 要等這份資料
                    累積滿四季才算得出來（上游只回最新一季，補不回來）。
                  </p>
                </>
              )}
            </section>

            <section className={`${cardClass} p-6 flex flex-col gap-stack-md`}>
              <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-2 pb-3 border-b border-outline-variant">
                <span className="material-symbols-outlined text-[20px]">info</span>
                計算邏輯與買區定義
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-lg">
                <div className="flex flex-col gap-stack-sm">
                  <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                    四個本益比（皆為 股價 ÷ EPS）
                  </p>
                  {[
                    { label: '歷史', formula: '現價 ÷ 近四季 EPS', value: row?.historical_pe },
                    { label: '高點', formula: '半年最高 ÷ 近四季 EPS', value: row?.high_pe },
                    { label: '預估', formula: '現價 ÷ 預估整年 EPS', value: row?.estimated_pe },
                    {
                      label: '年化',
                      formula: '現價 ÷（最新一季 EPS × 4）',
                      value: row?.annualized_pe,
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex justify-between items-baseline gap-stack-sm border-b border-outline-variant/50 pb-2"
                    >
                      <span className="font-body-md text-body-md text-on-surface">{item.label}</span>
                      <span className="font-body-sm text-body-sm text-outline flex-1 text-right">
                        {item.formula}
                      </span>
                      <span className="font-data-md text-data-md text-on-surface w-20 text-right">
                        {formatPe(item.value)}
                      </span>
                    </div>
                  ))}
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    EPS 抓不到或公司虧損時本益比是破折號。四個值都以現價現算，不存檔——股價每天變，
                    存下來的固定值隔天就過期。
                  </p>
                </div>

                <div className="flex flex-col gap-stack-sm">
                  <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                    建議買區
                  </p>
                  <div className="p-4 rounded-xl border border-outline-variant bg-surface-container-low flex flex-col gap-1">
                    <span className="font-data-lg text-data-lg text-on-surface">
                      {row?.buy_zone_low == null || row.buy_zone_high == null
                        ? DASH
                        : `${formatPrice(row.buy_zone_low)} ~ ${formatPrice(row.buy_zone_high)}`}
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      半年最高（{formatPrice(row?.recent_high)}）× 0.65 ~ 0.70
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    「已進入買區」的判定是<strong>現價 ≤ 區間上緣</strong>，不是落在區間內——
                    跌破下緣代表更便宜，同樣該標出來。回檔幅度 =（半年最高 − 現價）÷ 半年最高。
                  </p>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}
