import { ReactNode, useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import RangeFilter from '../components/RangeFilter';
import SymbolSearch from '../components/SymbolSearch';
import TrendChart from '../components/TrendChart';
import { getIndicators } from '../api/indicator';
import { HistoryParams } from '../api/types';
import { useSymbol } from '../context/SymbolContext';
import { useAsyncData } from '../hooks/useAsyncData';
import { formatDate } from '../utils/format';

// 這一頁只畫「另開一格」的那五種：KD、RSI、MACD、CCI、DMI。
//
// 端點還算得出 ma／ema／bollinger／bias，那四種是疊在 K 線上的東西，
// 位置在個股總覽那張 K 線圖裡（均線由 utils/chart.ts 自己併），
// 拉到這裡會變成一張沒有價格的均線圖，看不出「站上」或「跌破」。
const INDICATORS = 'kd,rsi,macd,cci,dmi';

export default function Indicators() {
  const { symbol } = useSymbol();
  const [params, setParams] = useState<HistoryParams>({ limit: 60 });

  const { data, loading, error, reload } = useAsyncData(
    () => getIndicators(symbol, { ...params, indicators: INDICATORS }),
    [symbol, params.from, params.to, params.limit],
    { enabled: !!symbol }
  );

  // 後端這一組是由舊到新給的（其他歷史端點都是由新到舊），畫圖前不要再反轉。
  const kd = data?.kd ?? [];
  const rsi = data?.rsi ?? [];
  const macd = data?.macd ?? [];
  const cci = data?.cci ?? [];
  const dmi = data?.dmi ?? [];
  const p = data?.params;
  const hasBars = (data?.bars ?? 0) > 0;

  // 回看視窗裡含「沒成交、延用前一日收盤」的 KD 點。那幾點的 RSV 分母不是真的
  // 盤中高低差，跟正常點長得一模一樣，只能靠這個數字講出來。
  const syntheticKD = kd.filter((point) => point.synthetic).length;

  return (
    <>
      <PageHeader
        title="技術指標"
        icon="show_chart"
        subtitle={
          symbol
            ? `${symbol}${data?.name ? ` ${data.name}` : ''}${
                data?.as_of ? ` · 資料日 ${formatDate(data.as_of)}` : ''
              }${hasBars ? ` · 用了 ${data?.bars} 根日 K` : ''}`
            : undefined
        }
        right={
          <>
            <RangeFilter value={params} onChange={setParams} />
            <SymbolSearch />
          </>
        }
      />

      <div className="flex flex-col gap-stack-lg">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          指標是拿落地的日 K <span className="text-on-surface font-semibold">現算的，沒有落地</span>
          ，換一組參數就是換一次查詢，數字不會跟上一批混在一起。
          <span className="text-on-surface font-semibold">價格沒有做除權息還原</span>
          ，除權息當天的跳空會被指標當成真的下跌；沒成交的日子延用前一日收盤頂替，
          那幾根的高低不是真的盤中區間。查詢筆數是「回幾個點」，前置期會另外多撈、不佔筆數。
        </p>

        {!symbol && (
          <PageState kind="idle" hint="在右上角輸入股票代號，或從左側自選股清單挑一檔。" />
        )}
        {symbol && loading && <PageState kind="loading" />}
        {symbol && error && <PageState kind="error" message={error} onRetry={reload} />}
        {symbol && !loading && !error && !hasBars && (
          <PageState
            kind="empty"
            message="這一檔沒有日 K 可以算"
            hint="每日收盤只落地自選股清單裡的檔，所以這不是查無此股——把它加進自選股，等收集跑過幾天就會有。整段期間都停牌時也會是空的。"
          />
        )}

        {symbol && !loading && !error && hasBars && data && (
          <>
            {/* ── 這批數字能不能信 ── */}
            <DataQuality
              warmupShort={data.warmup_short}
              warmupBars={data.warmup_bars}
              warmupWanted={data.warmup_bars_wanted}
              carriedBars={data.carried_bars}
              bars={data.bars}
              exDividendDates={data.ex_dividend_dates}
            />

            {/* ── KD ── */}
            <Panel
              title="KD 隨機指標"
              params={p ? `${p.kd_period},${p.kd_k_smooth},${p.kd_d_smooth}` : undefined}
              count={kd.length}
              shortfall={`日 K 還不夠長，算不出 ${p?.kd_period ?? 9} 日的 KD。`}
            >
              <TrendChart
                unit="%"
                series={[
                  {
                    label: 'K（快線）',
                    className: 'stroke-primary',
                    points: kd.map((point) => ({ date: point.date, value: point.k })),
                  },
                  {
                    label: 'D（慢線）',
                    className: 'stroke-secondary',
                    dash: '8 5',
                    points: kd.map((point) => ({ date: point.date, value: point.d })),
                  },
                ]}
                references={[
                  { value: 80, label: '80' },
                  { value: 20, label: '20' },
                ]}
                footnote={`K 穿越 D 往上是黃金交叉、往下是死亡交叉。80／20 兩條線是台股軟體的慣例，不是本專案定的規則：強勢股可以在 80 以上鈍化好幾週，那段期間「超買」不代表快跌了。${
                  syntheticKD > 0
                    ? `這 ${kd.length} 個點裡有 ${syntheticKD} 個的回看視窗含沒成交的日子，那幾點的 RSV 分母不是真的盤中高低差。`
                    : ''
                }`}
              />
            </Panel>

            {/* ── RSI ── */}
            <Panel
              title="RSI 相對強弱"
              params={p ? String(p.rsi_period) : undefined}
              count={rsi.length}
              shortfall={`日 K 還不夠長，算不出 ${p?.rsi_period ?? 14} 日的 RSI。`}
            >
              <TrendChart
                unit="%"
                series={[
                  {
                    label: `RSI(${p?.rsi_period ?? 14})`,
                    className: 'stroke-primary',
                    points: rsi.map((point) => ({ date: point.date, value: point.value })),
                  },
                ]}
                references={[
                  { value: 70, label: '70' },
                  { value: 50, label: '50', className: 'stroke-outline-variant' },
                  { value: 30, label: '30' },
                ]}
                footnote="RSI 講的是「這段期間漲的力道占全部波動的比例」，50 是多空分界。70／30 同樣是慣例線而不是買賣點——單邊行情裡 RSI 會長期貼在 70 以上，那是趨勢強不是該賣了。"
              />
            </Panel>

            {/* ── MACD ── */}
            <Panel
              title="MACD"
              params={p ? `${p.macd_fast},${p.macd_slow},${p.macd_signal}` : undefined}
              count={macd.length}
              shortfall={`日 K 還不夠長，算不出 ${p?.macd_slow ?? 26} 日慢線的 MACD。`}
            >
              <TrendChart
                unit="元"
                series={[
                  {
                    label: 'DIF（快慢線差）',
                    className: 'stroke-primary',
                    points: macd.map((point) => ({ date: point.date, value: point.dif })),
                  },
                  {
                    label: 'MACD（訊號線）',
                    className: 'stroke-secondary',
                    dash: '8 5',
                    points: macd.map((point) => ({ date: point.date, value: point.macd })),
                  },
                ]}
                bars={{
                  label: 'OSC（柱狀）',
                  points: macd.map((point) => ({ date: point.date, value: point.osc })),
                }}
                footnote="OSC＝DIF−訊號線，也就是柱子。柱子由綠翻紅的那一天就是兩線黃金交叉的那一天——同一件事的兩種畫法，不是兩個各自成立的訊號。單位是元：它是兩條均線的價差，所以低價股的柱子天生就小，不同檔之間不能直接比高低。"
              />
            </Panel>

            {/* ── CCI ── */}
            <Panel
              title="CCI 順勢指標"
              params={p ? String(p.cci_period) : undefined}
              count={cci.length}
              shortfall={`日 K 還不夠長，算不出 ${p?.cci_period ?? 20} 日的 CCI。`}
            >
              <TrendChart
                series={[
                  {
                    label: `CCI(${p?.cci_period ?? 20})`,
                    className: 'stroke-primary',
                    points: cci.map((point) => ({ date: point.date, value: point.value })),
                  },
                ]}
                references={[
                  { value: 100, label: '+100' },
                  { value: 0, label: '0', className: 'stroke-outline-variant' },
                  { value: -100, label: '−100' },
                ]}
                footnote="±100 出自 CCI 的原始定義（設計上約七成的時間會落在區間內），不是本專案挑的門檻。它沒有上下限，站上 +100 代表價格明顯高於近期均值——這在原始用法裡是「順勢做多」而不是「超買該賣」，跟 KD、RSI 的讀法相反。台股軟體慣用 20 日，英文文獻常見 14，兩者算出來的數字差不少，跨軟體比對前先確認是同一個週期。"
              />
            </Panel>

            {/* ── DMI ── */}
            <Panel
              title="DMI 趨勢方向"
              params={p ? String(p.dmi_period) : undefined}
              count={dmi.length}
              shortfall={`日 K 還不夠長，算不出 ${p?.dmi_period ?? 14} 日的 DMI（ADX 要到第 ${
                (p?.dmi_period ?? 14) * 2
              } 根才出得來）。`}
            >
              <TrendChart
                unit="%"
                series={[
                  {
                    // +DI／−DI 用漲跌色：它們講的就是「往上的動能」與「往下的動能」，
                    // 跟台股慣例的漲紅跌綠是同一個方向，用中性色反而要多看一次圖例。
                    label: '+DI（往上動能）',
                    className: 'stroke-quote-up',
                    points: dmi.map((point) => ({ date: point.date, value: point.plus_di })),
                  },
                  {
                    label: '−DI（往下動能）',
                    className: 'stroke-quote-down',
                    points: dmi.map((point) => ({ date: point.date, value: point.minus_di })),
                  },
                  {
                    label: 'ADX（趨勢強度）',
                    className: 'stroke-primary',
                    dash: '8 5',
                    points: dmi.map((point) => ({ date: point.date, value: point.adx })),
                  },
                ]}
                references={[{ value: 25, label: '25' }]}
                footnote="+DI 在上代表往上的動能較強。ADX 只講「趨勢有多明確」，不講方向——ADX 走高而 −DI 在上，那是明確的下跌趨勢，不是要漲了，這是這個指標最常被讀反的地方。25 是慣例門檻（以下多半是盤整），本專案沒有對它做過任何檢定。"
              />
            </Panel>

            {/* ── 後端定義的注意事項 ── */}
            <section className="rounded-xl border border-outline-variant bg-surface-container-low p-4 flex flex-col gap-stack-sm">
              <h2 className="font-headline-md text-headline-md text-primary">讀之前要知道的事</h2>
              <ul className="flex flex-col gap-1.5">
                {data.caveats.map((caveat) => (
                  <li
                    key={caveat}
                    className="font-body-sm text-body-sm text-on-surface-variant flex gap-2"
                  >
                    <span className="text-outline shrink-0">・</span>
                    {caveat}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </>
  );
}

/**
 * 一張圖的外框。
 *
 * count 為 0 時不畫空圖而是講原因：一張沒有線的座標軸跟「算出來全是零」長得一樣，
 * 而這裡的 0 幾乎都是「日 K 根數還不夠這個週期用」。
 */
function Panel({
  title,
  params,
  count,
  shortfall,
  children,
}: {
  title: string;
  params?: string;
  count: number;
  shortfall: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-stack-md rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-headline-md text-headline-md text-primary">{title}</h2>
        {/* 參數要跟圖擺在一起：兩張 KD 圖放在一起時，沒有參數就分不出誰是 (9,3,3)。 */}
        {params && (
          <span className="font-data-md text-data-md text-on-surface-variant">（{params}）</span>
        )}
        <span className="ml-auto font-body-sm text-body-sm text-outline">{count} 個點</span>
      </div>
      {count > 0 ? (
        children
      ) : (
        <p className="font-body-sm text-body-sm text-on-surface-variant">{shortfall}</p>
      )}
    </section>
  );
}

/**
 * 這批數字能不能信。
 *
 * 三件事都是「數字看起來正常但其實不能用」的情況，不標出來的話畫面上完全看不出來，
 * 所以擺在所有圖之前而不是折在最下面。
 */
function DataQuality({
  warmupShort,
  warmupBars,
  warmupWanted,
  carriedBars,
  bars,
  exDividendDates,
}: {
  warmupShort: boolean;
  warmupBars: number;
  warmupWanted: number;
  carriedBars: number;
  bars: number;
  exDividendDates: string[];
}) {
  if (!warmupShort && carriedBars === 0 && exDividendDates.length === 0) return null;

  return (
    <section className="flex flex-col gap-stack-sm rounded-xl border border-outline-variant bg-surface-container-low p-4">
      {warmupShort && (
        <p className="font-body-sm text-body-sm text-error">
          <span className="material-symbols-outlined text-[16px] align-text-bottom mr-1">
            warning
          </span>
          前置期只有 {warmupBars} 根，這組參數要 {warmupWanted} 根。
          <span className="font-semibold">序列前段還帶著起始值的影響</span>
          （KD 從 50 起算、EMA 從前 N 根的簡單平均起算），那幾個點看起來跟正常值一模一樣，
          不要拿來當訊號。日 K 收集得夠久之後這行會自己消失。
        </p>
      )}
      {carriedBars > 0 && (
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          用到的 {bars} 根日 K 裡有 <span className="text-on-surface font-semibold">{carriedBars} 根</span>
          是當天沒成交、延用前一日收盤頂替的。那幾根的最高最低都等於收盤價，
          吃高低差的指標（KD 的 RSV、DMI 的真實區間）在那幾天會偏小。
        </p>
      )}
      {exDividendDates.length > 0 && (
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          區間內有 {exDividendDates.length} 個除權息日，
          <span className="text-on-surface font-semibold">價格沒有做還原</span>
          ，那幾天的跳空會被指標當成真的下跌：
          <span className="font-data-md text-data-md text-on-surface ml-1">
            {exDividendDates.map((date) => formatDate(date)).join('、')}
          </span>
        </p>
      )}
    </section>
  );
}
