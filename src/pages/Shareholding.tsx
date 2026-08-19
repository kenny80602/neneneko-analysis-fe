import { useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import StatCard from '../components/StatCard';
import SymbolSearch from '../components/SymbolSearch';
import TrendChart, { TrendPoint } from '../components/TrendChart';
import { getShareholdingHistory } from '../api/shareholding';
import { ShareholdingWeek } from '../api/types';
import { useSymbol } from '../context/SymbolContext';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  DASH,
  formatDate,
  formatNumber,
  formatShareToLot,
  formatSigned,
  quoteColor,
} from '../utils/format';

// 大戶／散戶持股：集保股權分散表。
//
// 這是免費資料裡唯一能回答「大戶是不是在收」的來源——券商分點進出要過圖形驗證碼、
// 一次只能查一檔一天，三大法人只涵蓋法人，融資融券只涵蓋信用交易戶。
//
// 這一頁有五件事講錯就會誤導人，改版時不要拿掉：
//
//  1. **存量不是流量**。「大戶今天買了幾張」這份資料答不出來。
//  2. **大戶 + 散戶 ≠ 100%**，中間還有 50～400 張那一段（中實戶）。所以不做堆疊
//     長條也不做圓餅，改成把中實戶一起算出來擺在旁邊。
//  3. **null 不是 0**。increase 為 null 是「沒有前一週可以比」，顯示 0.00 會被
//     讀成「這週沒變」，意思完全相反。
//  4. **資料日期是該週基準日**（通常是週五）不是公布日，那一份實際上要到下週
//     一至週三才拿得到。所以寫「資料日期」不寫「更新於」。
//  5. **total_shares 不是發行股數**，是集保庫存，不能拿去算市值或週轉率。
//
// 另外箭頭的顏色刻意不照漲跌習慣配：散戶增加通常不是好事，跟大戶增加用同一個
// 紅色會讓人以為兩件事一樣好。散戶與股東人數那兩張卡走中性色，用文字講方向。

/** 可選的回看週數。上限 260 是後端定的。 */
const RANGES = [
  { label: '近 26 週', value: 26 },
  { label: '近 52 週', value: 52 },
  { label: '近 104 週', value: 104 },
];

/**
 * 分級的股數區間。上游定義的，不是我們分的——照抄是為了讓明細表看得懂
 * 「第 12 級」到底是多少股。
 */
const LEVEL_LABELS = [
  '1 ~ 999',
  '1,000 ~ 5,000',
  '5,001 ~ 10,000',
  '10,001 ~ 15,000',
  '15,001 ~ 20,000',
  '20,001 ~ 30,000',
  '30,001 ~ 40,000',
  '40,001 ~ 50,000',
  '50,001 ~ 100,000',
  '100,001 ~ 200,000',
  '200,001 ~ 400,000',
  '400,001 ~ 600,000',
  '600,001 ~ 800,000',
  '800,001 ~ 1,000,000',
  '1,000,001 以上',
];

const headCell =
  'p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap';
const numberCell = 'p-2 py-3 text-right font-data-md text-data-md whitespace-nowrap';

/** 比例一律兩位小數。API 回的是完整浮點數，直接印會有十幾位。 */
function formatRatio(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return DASH;
  return `${value.toFixed(2)}%`;
}

/** 百分點的增減。null 是「沒有前一週可以比」，不是沒變動。 */
function formatPoints(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return DASH;
  return `${value > 0 ? '+' : ''}${value.toFixed(2)} 個百分點`;
}

/**
 * 把逐週資料轉成折線圖的點。
 *
 * API 是日期由新到舊，圖要由舊到新，所以反轉。null 原樣保留——TrendChart 遇到
 * null 會斷線，那正是「那一週沒有資料」該有的樣子，補 0 會畫出一條掉到底的線。
 */
function toPoints(items: ShareholdingWeek[], pick: (w: ShareholdingWeek) => number | null) {
  return [...items].reverse().map<TrendPoint>((week) => ({
    date: week.date,
    value: pick(week),
  }));
}

/** 增減張數那張圖要看哪一群。 */
type ChangeTarget = 'big' | 'thousand' | 'retail';

const CHANGE_TARGETS: { value: ChangeTarget; label: string }[] = [
  { value: 'big', label: '大戶 ≥400 張' },
  { value: 'thousand', label: '千張大戶' },
  { value: 'retail', label: '散戶 ≤50 張' },
];

export default function Shareholding() {
  const { symbol } = useSymbol();
  const [weeks, setWeeks] = useState(52);
  const [showThousand, setShowThousand] = useState(false);
  const [changeTarget, setChangeTarget] = useState<ChangeTarget>('big');
  const [showLevels, setShowLevels] = useState(false);

  // 不輪詢：一週才換一份。deps 放原始值（數字），不放物件。
  const { data, loading, error, reload } = useAsyncData(
    () => getShareholdingHistory(symbol, weeks),
    [symbol, weeks],
    { enabled: !!symbol }
  );

  const items = useMemo(() => data?.items ?? [], [data]);
  const latest = items[0];

  /**
   * 中實戶（50～400 張）＝ 100 − 大戶 − 散戶。
   *
   * 一定要把它算出來擺在旁邊：不然「大戶 33.68% + 散戶 45.94%」看起來像少了兩成，
   * 使用者會以為資料有缺。三個加起來才是 100%。
   */
  const midRatio = useMemo(() => {
    if (latest?.big_holder_ratio == null || latest.retail_ratio == null) return null;
    return 100 - latest.big_holder_ratio - latest.retail_ratio;
  }, [latest]);

  const ratioSeries = useMemo(() => {
    const series = [
      {
        label: '大戶 ≥400 張',
        points: toPoints(items, (w) => w.big_holder_ratio),
        className: 'stroke-primary',
      },
      {
        label: '散戶 ≤50 張',
        points: toPoints(items, (w) => w.retail_ratio),
        className: 'stroke-on-surface-variant',
      },
    ];
    // 千張大戶預設關掉：三條線擠在一張圖上，而它跟大戶那條走勢高度重疊。
    if (showThousand) {
      series.push({
        label: '千張大戶',
        points: toPoints(items, (w) => w.thousand_lot_ratio),
        className: 'stroke-secondary',
      });
    }
    return series;
  }, [items, showThousand]);

  /**
   * 每週增減的張數。
   *
   * ⚠️ 這是**存量差不是成交量**：週末那個時點大戶手上多了幾張，中間可能來回買賣
   * 過好幾次。集保只公布每週的持股分佈，台灣沒有免費的大戶逐筆買賣資料。
   *
   * 用 bar 而不是 line：它是有正負號的量（增減），以零軸為基準上下長比較讀得出
   * 「這一週是進還是出」，跟三大法人買賣超那張圖同一個道理。
   *
   * 後端給的是股數，這裡除以 1000 換成張——台股講籌碼一律論張。
   */
  const changeSeries = useMemo(() => {
    const pick = (w: ShareholdingWeek): number | null => {
      const shares =
        changeTarget === 'big'
          ? w.big_holder_shares_change
          : changeTarget === 'thousand'
            ? w.thousand_lot_shares_change
            : w.retail_shares_change;
      return shares == null ? null : shares / 1000;
    };
    return [
      {
        label: CHANGE_TARGETS.find((t) => t.value === changeTarget)?.label ?? '',
        points: toPoints(items, pick),
      },
    ];
  }, [items, changeTarget]);

  const holderSeries = useMemo(
    () => [
      {
        label: '股東人數',
        points: toPoints(items, (w) => w.total_holders),
        className: 'stroke-primary',
      },
    ],
    [items]
  );

  return (
    <>
      <PageHeader
        title="大戶散戶"
        icon="groups_2"
        subtitle={
          latest
            ? `${symbol}．資料日期 ${formatDate(latest.date)}（該週基準日）`
            : '集保股權分散：大戶與散戶的持股比例'
        }
        right={
          <>
            <select
              value={weeks}
              onChange={(event) => setWeeks(Number(event.target.value))}
              className="px-3 py-2 bg-surface-container border border-outline-variant rounded font-body-md text-body-md text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary w-32"
            >
              {RANGES.map((range) => (
                <option key={range.value} value={range.value}>
                  {range.label}
                </option>
              ))}
            </select>
            <SymbolSearch />
          </>
        }
      />

      <div className="flex flex-col gap-stack-lg">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          資料來自集保結算所的股權分散表，
          <span className="text-on-surface font-semibold">一週一筆</span>
          。這是免費資料裡唯一能回答「大戶是不是在收」的來源——券商分點進出要過圖形
          驗證碼且一次只能查一檔一天，三大法人只涵蓋法人，融資融券只涵蓋信用交易戶。
          <span className="text-on-surface font-semibold">
            但它是「持股存量」不是「買賣量」
          </span>
          ：某一週大戶比例上升，代表週末那個時點大戶手上的股數變多，
          看不出是誰賣給他的、也看不出中間來回買賣過幾次。
          「大戶今天買了幾張」「哪一家券商在買」這兩件事這份資料答不出來。
          同一個大戶用五個帳戶分散持有的話會被算成五個中實戶，那是這份資料的先天盲點。
        </p>

        <p className="font-body-sm text-body-sm text-on-surface-variant">
          <span className="text-on-surface font-semibold">大戶 ＋ 散戶 ≠ 100%</span>
          ：中間還有 50～400 張那一段（中實戶），所以這一頁不做堆疊長條也不做圓餅
          （那會讓人以為兩者互補），改成把中實戶一起算出來擺在旁邊。
          「資料日期」是<span className="text-on-surface font-semibold">該週基準日</span>
          （通常是週五）而不是公布日——那一份實際上要到下週一至週三才拿得到。
          總股數指的是集保庫存，不含未匯入集保的實體股票與海外存託憑證，會略小於發行
          股數，<span className="text-on-surface font-semibold">不能拿去算市值或週轉率</span>
          ，它在這裡的唯一用途是當比例的分母。
        </p>

        {!symbol && (
          <PageState
            kind="idle"
            hint="先用右上角搜尋一檔股票。這一頁是逐檔看的，上市上櫃都查得到。"
          />
        )}
        {symbol && loading && <PageState kind="loading" />}
        {symbol && error && <PageState kind="error" message={error} onRetry={reload} />}

        {symbol && !loading && !error && items.length === 0 && (
          <PageState
            kind="empty"
            message={`還沒有 ${symbol} 的股權分散資料`}
            hint="上游只提供「最新一週」的全市場資料，沒有歷史檔可以下載，所以這一檔要等下一次收集才會出現。剛開始收集時多數股票都是這樣。"
          />
        )}

        {latest && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-stack-md">
              {/* 大戶與千張大戶：增加＝籌碼集中，用漲跌色（紅＝增加）沒問題。 */}
              <StatCard
                label="大戶 ≥400 張"
                icon="account_balance"
                value={formatRatio(latest.big_holder_ratio)}
                hint={`較前一週 ${formatPoints(latest.big_holder_change)}，${
                  latest.big_holder_shares_change == null
                    ? '張數未知'
                    : `${formatShareToLot(latest.big_holder_shares_change)} 張`
                }`}
                valueClassName={quoteColor(latest.big_holder_change)}
              />
              <StatCard
                label="千張大戶 ≥1,000 張"
                icon="workspace_premium"
                value={formatRatio(latest.thousand_lot_ratio)}
                hint={`較前一週 ${formatPoints(latest.thousand_lot_change)}`}
                valueClassName={quoteColor(latest.thousand_lot_change)}
              />
              {/* 散戶刻意走中性色：跟大戶用同一個紅色會讓人以為「散戶變多」也是好事。 */}
              <StatCard
                label="散戶 ≤50 張"
                icon="groups"
                value={formatRatio(latest.retail_ratio)}
                hint={
                  latest.retail_change == null
                    ? '沒有前一週可以比'
                    : `${latest.retail_change > 0 ? '散戶增加' : '散戶減少'} ${formatPoints(
                        latest.retail_change
                      )}`
                }
              />
              <StatCard
                label="中實戶 50～400 張"
                icon="balance"
                value={formatRatio(midRatio)}
                hint="＝100% − 大戶 − 散戶，三者相加才是全部"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-stack-md">
              <StatCard
                label="股東人數"
                icon="person"
                value={formatNumber(latest.total_holders)}
                hint={
                  latest.holders_change == null
                    ? '人，沒有前一週可以比'
                    : `人，較前一週 ${formatSigned(latest.holders_change, 0)}（${
                        latest.holders_change < 0 ? '人數減少' : '人數增加'
                      }）`
                }
              />
              <StatCard
                label="平均每人持有"
                icon="pie_chart"
                value={latest.average_lots == null ? DASH : latest.average_lots.toFixed(2)}
                hint="張／人"
              />
              <StatCard
                label="集保庫存總股數"
                icon="inventory"
                value={formatNumber(latest.total_shares)}
                hint="股，不是發行股數，只當比例的分母"
              />
              <StatCard
                label="資料日期"
                icon="event"
                value={formatDate(latest.date)}
                hint={`該週基準日，共 ${data?.count ?? 0} 週`}
              />
            </div>

            <p className="font-body-sm text-body-sm text-on-surface-variant">
              <span className="text-on-surface font-semibold">
                股東人數往下 ＋ 大戶比例往上 ＝ 籌碼集中
              </span>
              ，這是這一頁最有價值的組合訊號：同樣的股票被更少的人拿著。反過來
              人數往上而大戶往下，代表籌碼從大戶流向散戶。破折號一律代表
              <span className="text-on-surface font-semibold">「沒有前一週可以比」</span>
              （最舊那一筆一定是，剛開始收集時每一筆都是），不是「這週沒變」。
            </p>

            {/* ── 逐週趨勢 ── */}
            {items.length <= 1 ? (
              <PageState
                kind="empty"
                message="資料累積中，還畫不出趨勢"
                hint="上游只提供最新一週，沒有歷史檔可以回補，所以每過一週才多一筆。要等幾週之後趨勢圖才有東西看——上面的摘要是目前唯一那一週的數字。"
              />
            ) : (
              <>
                <section className="flex flex-col gap-stack-md">
                  <div className="flex flex-wrap items-baseline justify-between gap-stack-sm">
                    <h2 className="font-headline-md text-headline-md text-primary">
                      持股比例逐週走勢
                    </h2>
                    <label className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant">
                      <input
                        type="checkbox"
                        checked={showThousand}
                        onChange={(event) => setShowThousand(event.target.checked)}
                        className="rounded border-outline-variant text-primary focus:ring-primary"
                      />
                      顯示千張大戶
                    </label>
                  </div>
                  <TrendChart
                    series={ratioSeries}
                    unit="%"
                    digits={2}
                    footnote="Y 軸不從 0 起算：這種比例的週變化通常在 1 個百分點以內，從 0 畫會看起來像一條直線。線在某一週斷開代表那一週沒有資料，不是掉到 0。"
                  />
                </section>

                <section className="flex flex-col gap-stack-md">
                  <div className="flex flex-wrap items-baseline justify-between gap-stack-sm">
                    <h2 className="font-headline-md text-headline-md text-primary">
                      每週增減張數
                    </h2>
                    <div className="flex flex-wrap gap-1.5">
                      {CHANGE_TARGETS.map((target) => (
                        <button
                          key={target.value}
                          type="button"
                          onClick={() => setChangeTarget(target.value)}
                          className={`px-3 py-1.5 rounded border font-body-sm text-body-sm transition-colors ${
                            changeTarget === target.value
                              ? 'border-primary bg-primary-container/20 text-primary font-semibold'
                              : 'border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container-low'
                          }`}
                        >
                          {target.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <TrendChart
                    series={changeSeries}
                    mode="bar"
                    unit="張"
                    footnote="⚠️ 這是持股的淨變化，不是成交量：長條代表週末那個時點這一群手上多了或少了幾張，中間可能來回買賣過好幾次，也看不出對手方是誰。集保只公布每週的持股分佈，台灣沒有免費的大戶逐筆買賣資料。看張數而不是只看比例，是因為比例的分母（集保庫存總股數）會變動——新股上市或實體股票匯入都會讓分母變大，那時大戶就算一張沒賣，比例也會往下。"
                  />
                </section>

                <section className="flex flex-col gap-stack-md">
                  <h2 className="font-headline-md text-headline-md text-primary">
                    股東人數逐週走勢
                  </h2>
                  <TrendChart
                    series={holderSeries}
                    unit="人"
                    digits={0}
                    footnote="跟上面那張一起看：人數往下而大戶比例往上，就是籌碼集中。這是週資料，X 軸的間隔是一週，不要拿去跟日 K 的時間軸對齊。"
                  />
                </section>
              </>
            )}

            {/* ── 分級明細 ── */}
            <section className="flex flex-col gap-stack-md">
              <button
                type="button"
                onClick={() => setShowLevels((prev) => !prev)}
                className="flex items-center gap-2 text-primary self-start"
              >
                <span className="material-symbols-outlined text-[20px]">
                  {showLevels ? 'expand_more' : 'chevron_right'}
                </span>
                <span className="font-headline-md text-headline-md">
                  持股分級明細（{latest.levels.length} 級）
                </span>
              </button>

              {showLevels && (
                <>
                  <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
                    <table className="w-full border-collapse">
                      <thead className="bg-surface-container-low border-b border-outline-variant">
                        <tr>
                          <th className={`${headCell} pl-4 text-right`}>級</th>
                          <th className={`${headCell} text-left`}>持股區間（股）</th>
                          <th className={`${headCell} text-right`}>人數</th>
                          <th className={`${headCell} text-right`}>股數</th>
                          <th className={`${headCell} pr-4 text-right`}>佔庫存</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/50">
                        {latest.levels.map((level) => {
                          // 佔比在這裡算是安全的：分母就是同一筆的 total_shares，
                          // 不是拿兩個來源的數字湊出來的。
                          const share =
                            latest.total_shares > 0
                              ? (level.shares / latest.total_shares) * 100
                              : null;
                          return (
                            <tr
                              key={level.level}
                              className="hover:bg-surface-container-low/50 transition-colors"
                            >
                              <td className={`${numberCell} pl-4 text-on-surface-variant`}>
                                {level.level}
                              </td>
                              <td className="p-2 py-3 font-body-sm text-body-sm text-on-surface whitespace-nowrap">
                                {LEVEL_LABELS[level.level - 1] ?? DASH}
                              </td>
                              <td className={`${numberCell} text-on-surface-variant`}>
                                {formatNumber(level.holders)}
                              </td>
                              <td className={`${numberCell} text-on-surface`}>
                                {formatNumber(level.shares)}
                              </td>
                              <td className={`${numberCell} text-on-surface-variant`}>
                                {formatRatio(share)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    級距是集保定義的，不是這裡分的。「大戶」取第 12 級以上（400,001 股
                    ＝400 張以上）、「千張大戶」是第 15 級、「散戶」取第 8 級以下
                    （50,000 股＝50 張以下），中間的第 9～11 級就是中實戶。
                  </p>
                </>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
