import { PointerEvent, useMemo, useState } from 'react';
import { DASH } from '../utils/format';

/**
 * 一條線。values 跟 CreditChart 的 dates 同長，null 代表那天「沒有這個值」，
 * 線在那裡斷開，不是掉到 0。
 */
export interface CreditSeries {
  label: string;
  values: (number | null)[];
  /** 這條線掛在哪一條 Y 軸。兩條線量級差很多（億元 vs 張）時才需要分左右。 */
  axis: 'left' | 'right';
  /** 線的顏色 class（stroke-*）。圖例的小色塊與 tooltip 的圓點用同一個色。 */
  className: string;
  /** 圖例與 tooltip 的底色 class（bg-*），要跟 className 同色。 */
  swatchClassName: string;
  /** tooltip 內的數值格式，單位也寫在這裡（「4,020.95 億元」）。 */
  format: (value: number) => string;
  /** 虛線樣式（SVG stroke-dasharray）。兩條線疊在同一張圖時用來區分，不給就是實線。 */
  dash?: string;
  /** 在區間最高點打一個標記並寫出數值。 */
  showPeak?: boolean;
  /** 現值離最高點 5% 以內時警示。只用在「部位堆到上限才危險」的線（融資、融券、當日沖銷）。 */
  warnNearPeak?: boolean;
}

/** 現值離最高點 5% 以內算接近高點，跟後端 LINE 推播（marginPeakWarnPct）同一個門檻。 */
export const NEAR_PEAK_PCT = 5;

export interface PeakStat {
  peak: number;
  peakIndex: number;
  /** 最後一個有值的點。最新一天常常還沒公布，所以不是 values 的最後一格。 */
  current: number;
  /** 現值相對最高點的幅度（%）。在高點以下是負數，剛好在高點是 0。 */
  pct: number;
}

/** 區間最高點與現值的位置。整段都沒有值、或最高點不是正數（沒有分母）時回 null。 */
export function peakStat(values: (number | null)[]): PeakStat | null {
  let peak = -Infinity;
  let peakIndex = -1;
  let current: number | null = null;
  values.forEach((value, index) => {
    if (value == null || !Number.isFinite(value)) return;
    if (value > peak) {
      peak = value;
      peakIndex = index;
    }
    current = value;
  });
  if (current == null || peakIndex < 0 || peak <= 0) return null;
  return { peak, peakIndex, current, pct: (current / peak - 1) * 100 };
}

interface CreditChartProps {
  dates: string[];
  series: CreditSeries[];
  /** 軸刻度的格式。同一條軸上的線共用，所以只給一組。 */
  axisFormat?: { left?: (value: number) => string; right?: (value: number) => string };
}

// 座標系刻意跟 TrendChart 一樣寬（1000），同一頁上兩種圖的線寬與字級才會一致。
const WIDTH = 1000;
const HEIGHT = 240;
const TOP = 12;
const BOTTOM = 190;
const GUTTER = 70;
const PLOT_WIDTH = WIDTH - GUTTER * 2;
const GRID_LINES = 4;
const X_LABELS = 6;

interface Axis {
  min: number;
  max: number;
}

/** 把範圍抓到好讀的刻度（1／2／5 的倍數），否則會出現 3,847 到 6,213 這種刻度。 */
function niceAxis(values: number[]): Axis | null {
  if (values.length === 0) return null;
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    const pad = Math.abs(min) / 10 || 1;
    min -= pad;
    max += pad;
  }
  const rawStep = (max - min) / GRID_LINES;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step };
}

const defaultFormat = (value: number) =>
  Math.abs(value) >= 1000 ? `${Math.round(value / 1000)}k` : String(Math.round(value));

/**
 * 雙 Y 軸折線圖，附游標對準的十字線與 tooltip。
 *
 * 為什麼不擴充 TrendChart：它是單軸、不帶 tooltip，「大盤信用交易」那組圖要的是
 * 融資（億元）與融券（張）擺在同一張圖——兩者差兩個數量級，共用一條軸的話
 * 融券會被壓成貼著底部的一條直線。分成兩張圖又看不出「融資上升時融券怎麼動」。
 */
export default function CreditChart({ dates, series, axisFormat }: CreditChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const axes = useMemo(() => {
    const collect = (side: 'left' | 'right') =>
      series
        .filter((s) => s.axis === side)
        .flatMap((s) => s.values)
        .filter((v): v is number => v != null && Number.isFinite(v));
    return { left: niceAxis(collect('left')), right: niceAxis(collect('right')) };
  }, [series]);

  const length = dates.length;
  const hasRight = axes.right != null;
  // 沒有右軸時把右邊的留白收掉，不要留一塊空白。
  const plotWidth = hasRight ? PLOT_WIDTH : WIDTH - GUTTER - 10;

  const x = (index: number) =>
    length === 1 ? GUTTER + plotWidth / 2 : GUTTER + (index / (length - 1)) * plotWidth;
  const yOf = (axis: Axis, value: number) =>
    BOTTOM - ((value - axis.min) / (axis.max - axis.min)) * (BOTTOM - TOP);

  if (length < 2 || !axes.left) return null;

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    // 螢幕座標換成 viewBox 座標，再找最近的那一天。
    const px = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const ratio = (px - GUTTER) / plotWidth;
    setHover(Math.min(length - 1, Math.max(0, Math.round(ratio * (length - 1)))));
  };

  const leftFormat = axisFormat?.left ?? defaultFormat;
  const rightFormat = axisFormat?.right ?? defaultFormat;
  const labelStep = Math.max(1, Math.ceil(length / X_LABELS));
  const grid = Array.from({ length: GRID_LINES + 1 }, (_, i) => i / GRID_LINES);

  // tooltip 靠近右緣時翻到游標左邊，不然會被容器切掉。
  const hoverRatio = hover == null ? 0 : (x(hover) / WIDTH) * 100;
  const flip = hoverRatio > 60;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto select-none touch-pan-y"
        role="img"
        aria-label={`${series.map((s) => s.label).join('、')}走勢圖`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {grid.map((t) => {
          const y = BOTTOM - t * (BOTTOM - TOP);
          return (
            <g key={t}>
              <line
                x1={GUTTER}
                y1={y}
                x2={GUTTER + plotWidth}
                y2={y}
                className="stroke-outline-variant"
                strokeWidth="1"
                opacity="0.5"
              />
              <text x={GUTTER - 8} y={y + 4} textAnchor="end" className="fill-on-surface-variant" fontSize="12">
                {leftFormat(axes.left!.min + t * (axes.left!.max - axes.left!.min))}
              </text>
              {axes.right && (
                <text x={GUTTER + plotWidth + 8} y={y + 4} className="fill-on-surface-variant" fontSize="12">
                  {rightFormat(axes.right.min + t * (axes.right.max - axes.right.min))}
                </text>
              )}
            </g>
          );
        })}

        {series.map((s) => {
          const axis = s.axis === 'left' ? axes.left : axes.right;
          if (!axis) return null;
          // 遇到 null 就斷線，不要跨過去連成一條——那會憑空畫出不存在的走勢。
          const segments: string[] = [];
          let current: string[] = [];
          s.values.forEach((value, index) => {
            if (value == null || !Number.isFinite(value)) {
              if (current.length > 1) segments.push(current.join(' '));
              current = [];
              return;
            }
            current.push(`${current.length === 0 ? 'M' : 'L'}${x(index)},${yOf(axis, value)}`);
          });
          if (current.length > 1) segments.push(current.join(' '));
          return segments.map((d, i) => (
            <path
              key={`${s.label}-${i}`}
              d={d}
              fill="none"
              strokeWidth="2"
              strokeDasharray={s.dash}
              className={s.className}
            />
          ));
        })}

        {dates.map((date, index) =>
          index % labelStep === 0 || index === length - 1 ? (
            <text
              key={date}
              x={x(index)}
              y={HEIGHT - 12}
              textAnchor="middle"
              className="fill-outline"
              fontSize="12"
            >
              {date.slice(5).replace('-', '/')}
            </text>
          ) : null
        )}

        {series.map((s) => {
          const axis = s.axis === 'left' ? axes.left : axes.right;
          const stat = s.showPeak && axis ? peakStat(s.values) : null;
          if (!stat || !axis) return null;
          const px = x(stat.peakIndex);
          const py = yOf(axis, stat.peak);
          // 靠近左右緣時文字改靠邊對齊，不然會被切掉；太靠上時標到點的下方。
          const anchor = px < GUTTER + 60 ? 'start' : px > GUTTER + plotWidth - 60 ? 'end' : 'middle';
          return (
            <g key={`peak-${s.label}`}>
              <circle cx={px} cy={py} r="4" className={`${s.className} fill-surface-container-lowest`} strokeWidth="2" />
              <text
                x={px}
                y={py < TOP + 14 ? py + 18 : py - 8}
                textAnchor={anchor}
                className="fill-on-surface"
                fontSize="12"
                fontWeight="600"
              >
                高 {s.format(stat.peak)}
              </text>
            </g>
          );
        })}

        {hover != null && (
          <g>
            <line
              x1={x(hover)}
              y1={TOP}
              x2={x(hover)}
              y2={BOTTOM}
              className="stroke-outline"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {series.map((s) => {
              const axis = s.axis === 'left' ? axes.left : axes.right;
              const value = s.values[hover];
              if (!axis || value == null) return null;
              return (
                <circle
                  key={s.label}
                  cx={x(hover)}
                  cy={yOf(axis, value)}
                  r="4"
                  className={`${s.className} fill-surface-container-lowest`}
                  strokeWidth="2"
                />
              );
            })}
          </g>
        )}
      </svg>

      {hover != null && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-[160px] rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 shadow-md"
          style={flip ? { right: `${100 - hoverRatio + 2}%` } : { left: `${hoverRatio + 2}%` }}
        >
          <p className="font-body-sm text-body-sm text-on-surface-variant">{dates[hover]}</p>
          {series.map((s) => {
            const value = s.values[hover];
            return (
              <p key={s.label} className="flex items-center gap-1.5 font-body-sm text-body-sm">
                <span className={`inline-block h-2 w-2 rounded-sm ${s.swatchClassName}`} />
                <span className="text-on-surface-variant">{s.label}</span>
                <span className="ml-auto pl-3 font-data-md text-data-md text-on-surface">
                  {value == null ? DASH : s.format(value)}
                </span>
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}
