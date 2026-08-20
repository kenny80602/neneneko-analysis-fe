import { useMemo, useState } from 'react';
import ChartControls from './ChartControls';
import { DailyQuote } from '../api/types';
import { useChartViewport } from '../hooks/useChartViewport';
import { CandleInterval, movingAverage, toCandles } from '../utils/chart';
import { formatNumber, formatPrice, formatShareToLot } from '../utils/format';

interface PriceChartProps {
  /** 每日收盤，日期由新到舊（後端原樣）。併週併月與均線都在前端算。 */
  quotes: DailyQuote[];
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

export default function PriceChart({ quotes }: PriceChartProps) {
  const [interval, setInterval] = useState<CandleInterval>('day');

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

      <p className="font-body-sm text-body-sm text-on-surface-variant">
        K 棒紅綠比的是收盤與開盤（漲紅跌綠），均線以目前顯示的週期計算——週線的 MA5 是五週均線。
        當日無成交的交易日不畫，收盤價未還原權值，跨除權息日的均線與漲幅會有落差。
      </p>
    </section>
  );
}
