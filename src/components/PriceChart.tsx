import { useMemo, useState } from 'react';
import ChartControls from './ChartControls';
import { ChartPattern, ChartPatterns, DailyQuote } from '../api/types';
import { useChartViewport } from '../hooks/useChartViewport';
import { CandleInterval, movingAverage, toCandles } from '../utils/chart';
import {
  DASH,
  formatNumber,
  formatPrice,
  formatShareToLot,
  formatSignedPercent,
  quoteColor,
} from '../utils/format';

interface PriceChartProps {
  /** 每日收盤，日期由新到舊（後端原樣）。併週併月與均線都在前端算。 */
  quotes: DailyQuote[];
  /** 後端偵測到的 W 底與 M 頭。沒給（還在載入或失敗）就只畫 K 線。 */
  patterns?: ChartPatterns;
  /** 型態偵測失敗的訊息。K 線本身不受影響，只是少了疊圖，所以只在圖旁邊提一句。 */
  patternsError?: string | null;
}

// SVG 的內部座標系。刻意不加 preserveAspectRatio="none"：讓它等比縮放，
// 否則容器一變寬，線寬與文字會跟著被橫向拉長。
const WIDTH = 1000;
const HEIGHT = 436;
const PRICE_TOP = 12;
const PRICE_BOTTOM = 300;
const VOLUME_TOP = 332;
const VOLUME_BOTTOM = 408;
const LEFT = 4;
// 右側留給價格刻度；刻度畫在圖內側會壓到 K 棒。
// 寬度要放得下「12,345」這種五位數加千分位，太窄的話 SVG 會把尾數裁掉。
const RIGHT_GUTTER = 80;
const PLOT_WIDTH = WIDTH - LEFT - RIGHT_GUTTER;
const GRID_LINES = 5;

// 每個週期**預設**顯示幾根 K。再多會擠成一片黑，而落地的收盤行情本來就不長
// （只有自選股、且從開始收集那天才有），設計稿的「年線」湊不出幾根，先不做。
//
// 這只是進來時的視窗，不是上限：縮小或拖曳看得到更早的資料，資料有多長就能看多長。
const VISIBLE_CANDLES: Record<CandleInterval, number> = { day: 120, week: 104, month: 36 };

const INTERVALS: { key: CandleInterval; label: string }[] = [
  { key: 'day', label: '日線' },
  { key: 'week', label: '週線' },
  { key: 'month', label: '月線' },
];

// 均線用線型區分而不是各自配色：設計系統的語意色裡，綠（secondary）與紅（error）
// 已經被漲跌佔走，剩下的角色彼此太接近，硬湊三個顏色不如實線／虛線／點線好認。
const MA_SERIES = [
  { period: 5, dash: '', className: 'stroke-primary' },
  { period: 20, dash: '8 5', className: 'stroke-on-primary-container' },
  { period: 60, dash: '2 5', className: 'stroke-outline' },
];

/**
 * y 軸刻度的小數位。千元以上的股票不需要小數，兩位小數只是把標籤撐長到被裁掉。
 *
 * 位數由整條軸的級距一次決定，不逐格判斷——不然同一條軸上會同時出現
 * 「1,650」與「822.68」兩種精度，看起來像兩套單位。
 */
function axisDigits(max: number): number {
  return Math.abs(max) >= 1000 ? 0 : 2;
}

/** x 軸標籤：日線與週線標到日，月線只標到月。 */
function axisLabel(date: string, interval: CandleInterval): string {
  return interval === 'month' ? date.slice(0, 7) : date.slice(5).replace('-', '/');
}

const PATTERN_LABEL: Record<ChartPattern['kind'], { name: string; bullish: boolean }> = {
  double_bottom: { name: 'W 底', bullish: true },
  double_top: { name: 'M 頭', bullish: false },
};

export default function PriceChart({ quotes, patterns, patternsError }: PriceChartProps) {
  const [interval, setInterval] = useState<CandleInterval>('day');
  const [showPatterns, setShowPatterns] = useState(true);
  // 表格點選的那一個型態（patterns.patterns 的索引），圖上加粗、其他淡化。
  const [selected, setSelected] = useState<number | null>(null);

  const candles = useMemo(() => toCandles(quotes, interval), [quotes, interval]);

  const viewport = useChartViewport(candles.length, VISIBLE_CANDLES[interval]);
  const { start, count } = viewport;

  // 均線先用全部資料算，再跟著 K 棒一起裁切；只算可見範圍的話，
  // 左邊界那幾根會因為「前面沒有資料」而斷掉一截——放大之後這件事更明顯，
  // 所以裁切一定要在算完之後做。
  const series = useMemo(() => {
    const end = start + count;
    return {
      view: candles.slice(start, end),
      averages: MA_SERIES.map((ma) => ({
        ...ma,
        values: movingAverage(candles, ma.period).slice(start, end),
      })),
    };
  }, [candles, start, count]);

  const { view, averages } = series;

  const scale = useMemo(() => {
    const values: number[] = [];
    view.forEach((candle) => values.push(candle.high, candle.low));
    averages.forEach((ma) =>
      ma.values.forEach((value) => {
        if (value != null) values.push(value);
      })
    );

    const rawMin = values.length ? Math.min(...values) : 0;
    const rawMax = values.length ? Math.max(...values) : 0;
    // 全部同價（只有一根 K，或整段沒動）時上下各撐開一點，否則除以 0。
    const padding = rawMax - rawMin > 0 ? (rawMax - rawMin) * 0.05 : Math.max(rawMax * 0.01, 1);
    const min = rawMin - padding;
    const max = rawMax + padding;

    const volumeMax = Math.max(1, ...view.map((candle) => candle.volume));

    return {
      min,
      max,
      volumeMax,
      y: (value: number) => PRICE_BOTTOM - ((value - min) / (max - min)) * (PRICE_BOTTOM - PRICE_TOP),
      volumeY: (value: number) => VOLUME_BOTTOM - (value / volumeMax) * (VOLUME_BOTTOM - VOLUME_TOP),
    };
  }, [view, averages]);

  // 把每個型態對到目前週期的 K 棒：日期取「第一根收盤日 ≥ 該日」的 K 棒，
  // 週線與月線的 K 棒日期是那一週／那一月最後一個交易日，所以轉折點會落在它所屬的那一根。
  // 三個轉折點都在可視範圍內才畫：只畫一半的型態比不畫更容易讓人讀錯。
  const patternShapes = useMemo(() => {
    if (!patterns) return [];
    const indexOf = (date: string) => candles.findIndex((candle) => candle.date >= date);
    const last = start + count - 1;
    return patterns.patterns.map((pattern, id) => {
      const idx = pattern.pivots.map((pivot) => indexOf(pivot.date));
      const confirmIdx = pattern.confirmed_at ? indexOf(pattern.confirmed_at) : -1;
      const visible = idx.length === 3 && idx.every((i) => i >= start && i <= last);
      return { id, pattern, idx, confirmIdx, visible };
    });
  }, [patterns, candles, start, count]);

  const intervalButton = (active: boolean) =>
    active
      ? 'px-3 py-1 rounded font-body-sm text-body-sm bg-primary text-on-primary transition-colors'
      : 'px-3 py-1 rounded font-body-sm text-body-sm text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors';

  if (view.length === 0) {
    return (
      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 shadow-sm">
        <h3 className="font-headline-md text-headline-md text-primary">價格走勢</h3>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">
          這個區間沒有可以畫的收盤資料。收盤行情只落地自選股清單裡的檔，可到「每日收盤」頁手動觸發收集。
        </p>
      </section>
    );
  }

  const step = PLOT_WIDTH / view.length;
  const bodyWidth = Math.max(1.5, step * 0.6);
  const centerX = (index: number) => LEFT + (index + 0.5) * step;

  const gridValues = Array.from(
    { length: GRID_LINES },
    (_, i) => scale.max - ((scale.max - scale.min) / (GRID_LINES - 1)) * i
  );

  const priceDigits = axisDigits(scale.max);

  // x 軸最多標六個日期，等距挑；每根都標會疊在一起。
  const labelStep = Math.max(1, Math.ceil(view.length / 6));

  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 sm:p-6 shadow-sm flex flex-col gap-stack-md">
      <div className="flex flex-wrap justify-between items-center gap-stack-sm">
        <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px]">show_chart</span>
          價格走勢
        </h3>
        <div className="flex flex-wrap items-center gap-stack-sm">
          <ChartControls
            viewport={viewport}
            rangeLabel={
              view.length > 0
                ? `${axisLabel(view[0].date, interval)} ～ ${axisLabel(
                    view[view.length - 1].date,
                    interval
                  )}`
                : undefined
            }
          />
          <button
            type="button"
            onClick={() => setShowPatterns((value) => !value)}
            aria-pressed={showPatterns}
            title="W 底與 M 頭是後端用機械規則偵測的，包含已確認的歷史型態與目前形成中的"
            className={`${intervalButton(showPatterns)} border border-outline-variant`}
          >
            型態{patterns ? `（${patterns.count}）` : ''}
          </button>
          <div className="flex gap-1 bg-surface-container-low p-1 rounded-xl border border-outline-variant">
          {INTERVALS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setInterval(item.key)}
              aria-pressed={interval === item.key}
              className={intervalButton(interval === item.key)}
            >
              {item.label}
            </button>
          ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-stack-md">
        {averages.map((ma) => {
          const latest = ma.values[ma.values.length - 1];
          return (
            <span key={ma.period} className="flex items-center gap-1.5">
              <svg width="20" height="6" aria-hidden="true">
                <line
                  x1="0"
                  y1="3"
                  x2="20"
                  y2="3"
                  strokeWidth="2"
                  strokeDasharray={ma.dash || undefined}
                  className={ma.className}
                />
              </svg>
              <span className="font-body-sm text-body-sm text-on-surface-variant">MA{ma.period}</span>
              <span className="font-data-md text-data-md text-on-surface">{formatPrice(latest)}</span>
            </span>
          );
        })}
      </div>

      <div
        {...viewport.containerProps}
        className={viewport.pannable ? 'cursor-grab active:cursor-grabbing' : undefined}
      >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto select-none"
        role="img"
        aria-label={`${view.length} 根${INTERVALS.find((i) => i.key === interval)?.label} K 棒與成交量，共 ${candles.length} 根`}
      >
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={LEFT}
              y1={scale.y(value)}
              x2={LEFT + PLOT_WIDTH}
              y2={scale.y(value)}
              strokeWidth="1"
              className="stroke-outline-variant"
              opacity="0.5"
            />
            <text
              x={LEFT + PLOT_WIDTH + 8}
              y={scale.y(value) + 4}
              fontSize="13"
              className="font-data-md fill-on-surface-variant"
            >
              {formatNumber(value, priceDigits)}
            </text>
          </g>
        ))}

        {averages.map((ma) => {
          const points = ma.values
            .map((value, index) => (value == null ? '' : `${centerX(index)},${scale.y(value)}`))
            .filter(Boolean)
            .join(' ');
          // 資料根數不夠算這條均線時整條不畫，而不是畫半截讓人以為均線走平。
          if (!points) return null;
          return (
            <polyline
              key={ma.period}
              points={points}
              fill="none"
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeDasharray={ma.dash || undefined}
              className={ma.className}
            />
          );
        })}

        {view.map((candle, index) => {
          // K 棒顏色照台股看盤慣例比「收盤 vs 開盤」，跟表格那種比昨收的漲跌是兩回事。
          // 紅綠用的是跟 quoteColor 同一組漲跌專用色（tailwind.config.js 的 quote-up／quote-down），
          // 調色只要改那兩個色票，這裡與表格就會一起變。
          const rising = candle.close >= candle.open;
          const color = rising
            ? 'fill-quote-up stroke-quote-up'
            : 'fill-quote-down stroke-quote-down';
          const top = scale.y(Math.max(candle.open, candle.close));
          const bottom = scale.y(Math.min(candle.open, candle.close));
          const x = centerX(index);

          return (
            <g key={candle.date} className={color}>
              <title>
                {`${candle.date} 開 ${formatPrice(candle.open)} 高 ${formatPrice(
                  candle.high
                )} 低 ${formatPrice(candle.low)} 收 ${formatPrice(
                  candle.close
                )} 量 ${formatShareToLot(candle.volume)} 張`}
              </title>
              <line
                x1={x}
                y1={scale.y(candle.high)}
                x2={x}
                y2={scale.y(candle.low)}
                strokeWidth="1"
              />
              {/* 開收同價（一字線）時實體高度會是 0，補一條 1 單位的橫線才看得見。 */}
              <rect
                x={x - bodyWidth / 2}
                y={top}
                width={bodyWidth}
                height={Math.max(1, bottom - top)}
              />
              <rect
                x={x - bodyWidth / 2}
                y={scale.volumeY(candle.volume)}
                width={bodyWidth}
                height={Math.max(1, VOLUME_BOTTOM - scale.volumeY(candle.volume))}
                opacity="0.75"
              />
            </g>
          );
        })}

        {showPatterns &&
          patternShapes
            .filter((shape) => shape.visible)
            .map(({ id, pattern, idx, confirmIdx }) => {
              const { name, bullish } = PATTERN_LABEL[pattern.kind];
              // 看漲的 W 底用漲色、看跌的 M 頭用跌色，跟 K 棒同一組色票。
              const stroke = bullish ? 'stroke-quote-up' : 'stroke-quote-down';
              const fill = bullish ? 'fill-quote-up' : 'fill-quote-down';
              const isSelected = selected === id;
              const dimmed = selected != null && !isSelected;
              const lastIdx = start + count - 1;
              const xs = idx.map((i) => centerX(i - start));
              const ys = pattern.pivots.map((pivot) => scale.y(pivot.price));
              const neckEnd = confirmIdx >= 0 ? Math.min(confirmIdx, lastIdx) : lastIdx;
              const neckY = scale.y(pattern.neckline);
              const confirmed = pattern.status === 'confirmed';
              return (
                <g key={id} opacity={dimmed ? 0.25 : 1}>
                  <title>
                    {`${name}${confirmed ? '（已確認）' : '（形成中）'} 頸線 ${formatPrice(pattern.neckline)} 目標 ${formatPrice(pattern.target)}`}
                  </title>
                  <line
                    x1={xs[0]}
                    y1={neckY}
                    x2={centerX(neckEnd - start)}
                    y2={neckY}
                    strokeWidth="1.5"
                    strokeDasharray="3 4"
                    className={stroke}
                  />
                  <polyline
                    points={xs.map((x, i) => `${x},${ys[i]}`).join(' ')}
                    fill="none"
                    strokeWidth={isSelected ? 3.5 : 2.2}
                    strokeLinejoin="round"
                    strokeDasharray={confirmed ? undefined : '7 5'}
                    className={stroke}
                  />
                  {xs.map((x, i) => (
                    <circle key={i} cx={x} cy={ys[i]} r={isSelected ? 5 : 3.5} className={fill} />
                  ))}
                  <text
                    x={xs[1]}
                    y={bullish ? ys[1] - 10 : ys[1] + 20}
                    fontSize="13"
                    textAnchor="middle"
                    className={`font-body-sm ${fill}`}
                  >
                    {name}
                    {confirmed ? '' : '?'}
                  </text>
                  {confirmed && confirmIdx >= start && confirmIdx <= lastIdx && pattern.confirm_close != null && (
                    <circle
                      cx={centerX(confirmIdx - start)}
                      cy={scale.y(pattern.confirm_close)}
                      r="6"
                      strokeWidth="2.5"
                      className={`fill-surface-container-lowest ${stroke}`}
                    />
                  )}
                </g>
              );
            })}

        <line
          x1={LEFT}
          y1={VOLUME_BOTTOM}
          x2={LEFT + PLOT_WIDTH}
          y2={VOLUME_BOTTOM}
          strokeWidth="1"
          className="stroke-outline-variant"
        />
        <text
          x={LEFT + PLOT_WIDTH + 8}
          y={VOLUME_TOP + 10}
          fontSize="13"
          className="font-data-md fill-on-surface-variant"
        >
          {formatShareToLot(scale.volumeMax)}
        </text>
        <text x={LEFT} y={VOLUME_TOP - 4} fontSize="13" className="font-body-sm fill-outline">
          成交量（張）
        </text>

        {view.map((candle, index) =>
          index % labelStep === 0 ? (
            <text
              key={candle.date}
              x={centerX(index)}
              y={HEIGHT - 8}
              fontSize="13"
              textAnchor="middle"
              className="font-data-md fill-on-surface-variant"
            >
              {axisLabel(candle.date, interval)}
            </text>
          ) : null
        )}
      </svg>
      </div>

      {patternsError && (
        <p className="font-body-sm text-body-sm text-error">型態偵測失敗：{patternsError}（K 線不受影響）</p>
      )}
      {showPatterns && patterns && (
        <PatternTable patterns={patterns} shapes={patternShapes} selected={selected} onSelect={setSelected} />
      )}

      <p className="font-body-sm text-body-sm text-on-surface-variant">
        K 棒紅綠比的是收盤與開盤（漲紅跌綠），均線以目前顯示的週期計算——週線的 MA5 是五週均線。
        當日無成交的交易日不畫，收盤價未還原權值，跨除權息日的均線與漲幅會有落差。
      </p>
    </section>
  );
}

interface PatternShape {
  id: number;
  pattern: ChartPattern;
  visible: boolean;
}

interface PatternTableProps {
  patterns: ChartPatterns;
  shapes: PatternShape[];
  selected: number | null;
  onSelect: (id: number | null) => void;
}

/**
 * 型態清單：最近的排最前面。圖上只畫得出目前視窗裡的，這張表列出整段資料偵測到的全部，
 * 點一列會在圖上加粗那個型態（不在視窗內的要先縮放或拖曳過去）。
 */
function PatternTable({ patterns, shapes, selected, onSelect }: PatternTableProps) {
  const rows = [...shapes].reverse();
  const th = 'p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap';
  const td = 'p-2 py-2 text-right font-data-md text-data-md whitespace-nowrap';

  return (
    <div className="flex flex-col gap-stack-sm">
      <h4 className="font-body-md text-body-md text-on-surface font-semibold">
        價格型態（W 底／M 頭）
        <span className="font-body-sm text-body-sm text-on-surface-variant font-normal">
          　分析 {patterns.bars} 根日 K{patterns.from && `（${patterns.from} ～ ${patterns.to}）`}
        </span>
      </h4>

      {rows.length === 0 ? (
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          這段資料沒有偵測到型態。這很常見，不代表系統壞了：一個型態動輒幾十到上百根日 K 才成形，
          落地的收盤行情又只有自選股、且從開始收集那天才有，根數不夠或這段走勢本來就沒有符合規則的雙底雙頂，都會是空的。
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                <th className={`${th} pl-4`}>型態</th>
                <th className={th}>兩隻腳</th>
                <th className={`${th} text-right`}>頸線</th>
                <th className={`${th} text-right`}>落差</th>
                <th className={th}>確認日</th>
                <th className={`${th} text-right`}>確認後 5 日</th>
                <th className={`${th} text-right`}>確認後 20 日</th>
                <th className={`${th} text-right`}>量測目標</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/50">
              {rows.map(({ id, pattern, visible }) => {
                const { name, bullish } = PATTERN_LABEL[pattern.kind];
                const outcome = pattern.outcome;
                const confirmed = pattern.status === 'confirmed';
                return (
                  <tr
                    key={id}
                    onClick={() => onSelect(selected === id ? null : id)}
                    className={`cursor-pointer hover:bg-surface-container-low/50 transition-colors ${
                      selected === id ? 'bg-surface-container-low' : ''
                    }`}
                  >
                    <td className="p-2 pl-4 py-2 font-body-md text-body-md whitespace-nowrap">
                      <span className={bullish ? 'text-quote-up' : 'text-quote-down'}>{name}</span>
                      <span className="text-on-surface-variant font-body-sm text-body-sm">
                        {bullish ? '（看漲）' : '（看跌）'}
                      </span>
                      {!confirmed && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-body-sm text-body-sm">
                          形成中
                        </span>
                      )}
                      {pattern.spans_ex_dividend && (
                        <span
                          className="ml-2 px-1.5 py-0.5 rounded bg-surface-container text-error font-body-sm text-body-sm"
                          title="收盤價未還原權值，除息的跳空會被當成一次下跌，轉折點與落差會失真"
                        >
                          含除權息
                        </span>
                      )}
                      {!visible && (
                        <span className="ml-2 text-outline font-body-sm text-body-sm">不在目前顯示範圍</span>
                      )}
                    </td>
                    <td className="p-2 py-2 font-data-md text-data-md whitespace-nowrap">
                      {pattern.pivots[0].date.slice(5)} ～ {pattern.pivots[2].date.slice(5)}
                    </td>
                    <td className={td}>{formatPrice(pattern.neckline)}</td>
                    <td className={td}>{formatNumber(pattern.depth_pct, 1)}%</td>
                    <td className="p-2 py-2 font-data-md text-data-md whitespace-nowrap">
                      {confirmed ? pattern.confirmed_at : DASH}
                    </td>
                    <td className={`${td} ${outcome ? quoteColor(outcome.after_5_pct) : ''}`}>
                      {outcome ? formatSignedPercent(outcome.after_5_pct) : DASH}
                    </td>
                    <td className={`${td} ${outcome ? quoteColor(outcome.after_20_pct) : ''}`}>
                      {outcome ? formatSignedPercent(outcome.after_20_pct) : DASH}
                    </td>
                    <td className={td}>
                      {formatPrice(pattern.target)}
                      <span className="text-on-surface-variant font-body-sm text-body-sm">
                        {!outcome ? '' : outcome.target_hit ? `　${outcome.target_hit_at.slice(5)} 達成` : '　未達成'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="font-body-sm text-body-sm text-on-surface-variant">
        型態是後端用機械規則從日 K 的轉折點偵測的：W 底／M 頭要兩隻腳接近、頸線落差夠深、之前有一段反向趨勢，
        並以<span className="text-on-surface">收盤價</span>突破（跌破）頸線才算確認；實線是已確認、虛線加問號是形成中，
        圓圈是確認那天的收盤。破折號代表資料還沒走到那麼遠或尚未確認，不是 0。
        這是現況描述，不是買賣訊號：門檻是經驗值、沒有檢定過出現後的表現，單一檔的幾次結果沒有統計意義，
        「量測目標」只是慣例上的算術（頸線再走一個落差），不保證會到。
      </p>
    </div>
  );
}
