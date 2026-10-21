import { useMemo, useState } from 'react';
import ChartControls from './ChartControls';
import { ChartPatterns, DailyQuote } from '../api/types';
import PatternPanel from './PatternPanel';
import { useChartViewport } from '../hooks/useChartViewport';
import { CandleInterval, movingAverage, toCandles } from '../utils/chart';
import { formatNumber, formatPrice, formatShareToLot } from '../utils/format';
import {
  directionClasses,
  GAP_CLASSES,
  gapName,
  PATTERN_INFO,
  PatternFamily,
  patternFamily,
  patternName,
} from '../utils/patterns';

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

export default function PriceChart({ quotes, patterns, patternsError }: PriceChartProps) {
  const [interval, setInterval] = useState<CandleInterval>('day');
  const [showPatterns, setShowPatterns] = useState(true);
  const [showGaps, setShowGaps] = useState(true);
  // 型態分類：圖上與清單一起篩，型態一多（十八種）全畫會蓋住 K 棒。
  const [family, setFamily] = useState<PatternFamily | 'all'>('all');
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

  // 把型態與缺口對到目前週期的 K 棒：日期取「第一根收盤日 ≥ 該日」的 K 棒，
  // 週線與月線的 K 棒日期是那一週／那一月最後一個交易日，所以轉折點會落在它所屬的那一根。
  // 型態的第一個與最後一個轉折點都在可視範圍內才畫：只畫一半的型態比不畫更容易讓人讀錯。
  const overlay = useMemo(() => {
    const indexOf = (date: string) => candles.findIndex((candle) => candle.date >= date);
    const last = start + count - 1;
    const shapes = (patterns?.patterns ?? []).map((pattern, id) => {
      const idx = pattern.pivots.map((pivot) => indexOf(pivot.date));
      const confirmIdx = pattern.confirmed_at ? indexOf(pattern.confirmed_at) : -1;
      const visible = idx.length > 0 && idx[0] >= start && idx[idx.length - 1] <= last && idx.every((i) => i >= 0);
      return { id, pattern, idx, confirmIdx, visible };
    });
    const gaps = (patterns?.gaps ?? []).map((gap) => {
      const idx = indexOf(gap.date);
      const fillIdx = gap.filled ? indexOf(gap.filled_at) : candles.length - 1;
      return { gap, idx, fillIdx, visible: idx >= start && idx <= last };
    });
    return { shapes, gaps, last };
  }, [patterns, candles, start, count]);

  const visibleIds = useMemo(
    () => new Set(overlay.shapes.filter((shape) => shape.visible).map((shape) => shape.id)),
    [overlay]
  );

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

  // 型態與缺口的文字標籤：一個一個放，跟已經放好的框重疊就上下挪開，挪不開的不畫。
  // 擠在一起的標籤互相蓋住比少一個標籤更難讀；完整資訊都在底下的清單與滑鼠提示裡。
  const labels = placeLabels(
    [
      ...(showPatterns
        ? overlay.shapes
            .filter((shape) => shape.visible && (family === 'all' || patternFamily(shape.pattern.kind) === family))
            .map(({ id, pattern, idx }) => {
              const mid = Math.floor(idx.length / 2);
              return {
                key: `p${id}`,
                text: `${patternName(pattern.kind)}${pattern.status === 'confirmed' ? '' : '?'}`,
                x: centerX(idx[mid] - start),
                y: scale.y(pattern.pivots[mid].price) + (pattern.pivots[mid].kind === 'low' ? 20 : -10),
                className: directionClasses(pattern.direction).fill,
                priority: selected === id ? 2 : 1,
              };
            })
        : []),
      ...(showGaps
        ? overlay.gaps
            .filter((item) => item.visible && item.gap.kind !== 'common')
            .map(({ gap, idx }) => ({
              key: `g${gap.date}`,
              text: `${gap.direction === 'up' ? '↑' : '↓'}${gapName(gap.kind)}`,
              x: centerX(idx - start),
              y: scale.y(gap.direction === 'up' ? gap.low : gap.high) + (gap.direction === 'up' ? 16 : -6),
              className: GAP_CLASSES.fill,
              priority: 0,
            }))
        : []),
    ],
    LEFT + 16,
    LEFT + PLOT_WIDTH - 16,
    PRICE_TOP + 10,
    PRICE_BOTTOM - 2
  );

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
            title="價格型態是後端用機械規則偵測的，包含已確認的歷史型態與目前形成中的"
            className={`${intervalButton(showPatterns)} border border-outline-variant`}
          >
            型態{patterns ? `（${patterns.count}）` : ''}
          </button>
          <button
            type="button"
            onClick={() => setShowGaps((value) => !value)}
            aria-pressed={showGaps}
            title="跳空缺口：突破、逃逸、竭盡、普通"
            className={`${intervalButton(showGaps)} border border-outline-variant`}
          >
            缺口{patterns ? `（${patterns.gaps.length}）` : ''}
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

      {patterns && (showPatterns || showGaps) && (
        <div className="flex flex-wrap items-center gap-stack-md font-body-sm text-body-sm text-on-surface-variant">
          {showPatterns && (
            <>
              <LegendSwatch className="bg-pattern-up" label="看漲型態" />
              <LegendSwatch className="bg-pattern-down" label="看跌型態" />
              <LegendSwatch className="bg-pattern-neutral" label="方向未定" />
            </>
          )}
          {showGaps && <LegendSwatch className="bg-pattern-gap" label="跳空缺口" />}
          <span>實線已確認、虛線形成中</span>
        </div>
      )}

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

        {showGaps &&
          overlay.gaps
            .filter((item) => item.visible)
            .map(({ gap, idx, fillIdx }) => {
              const color = GAP_CLASSES;
              const endIdx = Math.min(Math.max(fillIdx, idx), overlay.last);
              const x1 = centerX(idx - start) - step / 2;
              const x2 = centerX(endIdx - start) + step / 2;
              const yTop = scale.y(gap.high);
              const yBottom = scale.y(gap.low);
              const notable = gap.kind !== 'common';
              return (
                <g key={gap.date} opacity={gap.filled ? 0.55 : 1}>
                  <title>{`${gap.date} ${gapName(gap.kind)}（${gap.direction === 'up' ? '向上' : '向下'}）${formatPrice(
                    gap.low
                  )} ～ ${formatPrice(gap.high)}${gap.filled ? `，${gap.filled_at} 回補` : '，尚未回補'}`}</title>
                  <rect
                    x={x1}
                    y={yTop}
                    width={Math.max(2, x2 - x1)}
                    height={Math.max(2, yBottom - yTop)}
                    className={`${color.fill} ${color.stroke}`}
                    fillOpacity={notable ? 0.22 : 0.1}
                    strokeWidth="1"
                    strokeDasharray={gap.filled ? '3 3' : undefined}
                  />
                </g>
              );
            })}

        {showPatterns &&
          overlay.shapes
            .filter((shape) => shape.visible && (family === 'all' || patternFamily(shape.pattern.kind) === family))
            .map(({ id, pattern, idx, confirmIdx }) => {
              const info = PATTERN_INFO[pattern.kind];
              const color = directionClasses(pattern.direction);
              const isSelected = selected === id;
              const dimmed = selected != null && !isSelected;
              const confirmed = pattern.status === 'confirmed';
              const lastIdx = overlay.last;
              const xs = idx.map((i) => centerX(i - start));
              const ys = pattern.pivots.map((pivot) => scale.y(pivot.price));
              const candleIndexOf = (date: string) => candles.findIndex((candle) => candle.date >= date);

              // 邊界線：端點若超出可視範圍就裁在邊界上，價位照直線內插，不然線會畫到圖外。
              const lines = pattern.lines
                .map((line) => {
                  const fi = candleIndexOf(line.from.date);
                  const ti = candleIndexOf(line.to.date);
                  if (fi < 0 || ti < 0 || ti < start || fi > lastIdx) return null;
                  const priceAt = (i: number) =>
                    ti === fi ? line.from.price : line.from.price + ((line.to.price - line.from.price) * (i - fi)) / (ti - fi);
                  const a = Math.max(fi, start);
                  const b = Math.min(ti, lastIdx);
                  return { label: line.label, x1: centerX(a - start), y1: scale.y(priceAt(a)), x2: centerX(b - start), y2: scale.y(priceAt(b)) };
                })
                .filter((line): line is NonNullable<typeof line> => line != null);

              const curve = pattern.curve
                .map((point) => ({ i: candleIndexOf(point.date), price: point.price }))
                .filter((point) => point.i >= start && point.i <= lastIdx)
                .map((point) => `${centerX(point.i - start)},${scale.y(point.price)}`)
                .join(' ');

              return (
                <g key={id} opacity={dimmed ? 0.25 : 1}>
                  <title>
                    {`${patternName(pattern.kind)}${confirmed ? '（已確認）' : '（形成中）'} 關鍵價 ${formatPrice(
                      pattern.neckline
                    )}${pattern.target != null ? ` 目標 ${formatPrice(pattern.target)}` : ''}`}
                  </title>
                  {lines.map((line) => (
                    <line
                      key={line.label}
                      x1={line.x1}
                      y1={line.y1}
                      x2={line.x2}
                      y2={line.y2}
                      strokeWidth={isSelected ? 2 : 1.5}
                      strokeDasharray="3 4"
                      className={color.stroke}
                    />
                  ))}
                  {curve && (
                    <polyline
                      points={curve}
                      fill="none"
                      strokeWidth={isSelected ? 3.5 : 2.2}
                      strokeDasharray={confirmed ? undefined : '7 5'}
                      className={color.stroke}
                    />
                  )}
                  {info?.line !== false && !curve && (
                    <polyline
                      points={xs.map((x, i) => `${x},${ys[i]}`).join(' ')}
                      fill="none"
                      strokeWidth={isSelected ? 3.5 : 2.2}
                      strokeLinejoin="round"
                      strokeDasharray={confirmed ? undefined : '7 5'}
                      className={color.stroke}
                    />
                  )}
                  {xs.map((x, i) => (
                    <circle key={i} cx={x} cy={ys[i]} r={isSelected ? 5 : 3.5} className={color.fill} />
                  ))}
                  {confirmed && confirmIdx >= start && confirmIdx <= lastIdx && pattern.confirm_close != null && (
                    <circle
                      cx={centerX(confirmIdx - start)}
                      cy={scale.y(pattern.confirm_close)}
                      r="6"
                      strokeWidth="2.5"
                      className={`fill-surface-container-lowest ${color.stroke}`}
                    />
                  )}
                </g>
              );
            })}

        {labels.map((label) => (
          <text
            key={label.key}
            x={label.x}
            y={label.y}
            fontSize="12"
            textAnchor="middle"
            paintOrder="stroke"
            strokeWidth="3"
            strokeLinejoin="round"
            className={`font-body-sm stroke-surface-container-lowest ${label.className}`}
          >
            {label.text}
          </text>
        ))}

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
      {(showPatterns || showGaps) && patterns && (
        <PatternPanel
          patterns={patterns}
          visibleIds={visibleIds}
          family={family}
          onFamily={setFamily}
          selected={selected}
          onSelect={setSelected}
        />
      )}

      <p className="font-body-sm text-body-sm text-on-surface-variant">
        K 棒紅綠比的是收盤與開盤（漲紅跌綠），均線以目前顯示的週期計算——週線的 MA5 是五週均線。
        當日無成交的交易日不畫，收盤價未還原權值，跨除權息日的均線與漲幅會有落差。
      </p>
    </section>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block w-3 h-3 rounded-sm ${className}`} aria-hidden="true" />
      {label}
    </span>
  );
}

interface LabelInput {
  key: string;
  text: string;
  x: number;
  y: number;
  className: string;
  /** 數字大的先放（先搶到位置）。選中的型態優先。 */
  priority: number;
}

/**
 * 標籤防重疊：依優先序與位置一個一個放，跟已放好的標籤重疊就依序試上下挪開，都不行就不畫。
 * 文字寬度用字數估（中日韓字 12 像素、半形 7 像素），不量測 DOM：量測要等 render 之後，
 * 而標籤位置又是 render 的輸入。
 */
function placeLabels(items: LabelInput[], minX: number, maxX: number, minY: number, maxY: number): LabelInput[] {
  const width = (text: string) =>
    Array.from(text).reduce((sum, ch) => sum + (ch.charCodeAt(0) > 255 ? 12 : 7), 0) + 6;
  const placed: (LabelInput & { w: number })[] = [];
  const order = [...items].sort((a, b) => b.priority - a.priority || a.x - b.x);
  const offsets = [0, -15, 15, -30, 30, -45, 45];
  for (const item of order) {
    const w = width(item.text);
    const x = Math.min(Math.max(item.x, minX + w / 2), maxX - w / 2);
    for (const offset of offsets) {
      const y = Math.min(Math.max(item.y + offset, minY), maxY);
      const clash = placed.some((o) => Math.abs(o.y - y) < 14 && Math.abs(o.x - x) < (o.w + w) / 2);
      if (!clash) {
        placed.push({ ...item, x, y, w });
        break;
      }
    }
  }
  return placed;
}
