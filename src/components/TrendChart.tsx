import { useMemo } from 'react';
import { DASH, formatNumber } from '../utils/format';

/**
 * 一個資料點。value 為 null 代表那一天「沒有這個值」（上游沒公布、算不出來），
 * 不是 0——線會在那裡斷開，而不是掉到底。
 */
export interface TrendPoint {
  /** X 軸標籤，YYYY-MM-DD。 */
  date: string;
  value: number | null;
}

export interface TrendSeries {
  label: string;
  points: TrendPoint[];
  /** 線的顏色 class（stroke-*）。柱狀圖忽略這一欄，改用漲跌色。 */
  className?: string;
  dash?: string;
}

interface TrendChartProps {
  series: TrendSeries[];
  /**
   * bar 用在「有正負號」的量（買賣超、增減），以零軸為基準上下長，紅漲綠跌；
   * line 用在「只有大小」的量（餘額、比率），單純看走勢。
   */
  mode?: 'line' | 'bar';
  /** Y 軸單位說明，例如「張」「%」。 */
  unit?: string;
  /** 圖表下方的說明，講清楚這張圖的陷阱。 */
  footnote?: string;
}

// 座標系與 PriceChart 一致，兩張圖放在同一頁時線寬與字級才會一樣。
const WIDTH = 1000;
const HEIGHT = 260;
const TOP = 12;
const BOTTOM = 210;
const LEFT = 4;
const RIGHT_GUTTER = 90;
const PLOT_WIDTH = WIDTH - LEFT - RIGHT_GUTTER;
const GRID_LINES = 4;
// X 軸最多標幾個日期。標太多會擠成一團，六個剛好夠看出區間。
const X_LABELS = 6;

/** 刻度小數位。級距由整條軸一次決定，不逐格判斷，避免同一條軸出現兩種精度。 */
function axisDigits(span: number): number {
  if (span >= 1000) return 0;
  if (span >= 10) return 1;
  return 2;
}

export default function TrendChart({
  series,
  mode = 'line',
  unit,
  footnote,
}: TrendChartProps) {
  const scale = useMemo(() => {
    const values: number[] = [];
    series.forEach((s) =>
      s.points.forEach((p) => {
        if (p.value != null && Number.isFinite(p.value)) values.push(p.value);
      })
    );
    if (values.length === 0) return null;

    let min = Math.min(...values);
    let max = Math.max(...values);
    // 柱狀圖一定要含 0，否則「零軸」會落在圖外，柱子的長短失去意義。
    if (mode === 'bar') {
      min = Math.min(min, 0);
      max = Math.max(max, 0);
    }
    if (min === max) {
      // 一條水平線：給它一點上下空間，否則會貼在邊界上看不見。
      const pad = Math.abs(min) || 1;
      min -= pad / 2;
      max += pad / 2;
    }
    const span = max - min;
    const y = (value: number) => BOTTOM - ((value - min) / span) * (BOTTOM - TOP);
    return { min, max, span, y, zero: y(0) };
  }, [series, mode]);

  const length = series[0]?.points.length ?? 0;
  // 有幾天真的有值。少於兩天畫不出走勢——一個點的折線圖只是一個孤立的圓，
  // 柱狀圖則是一根佔滿版面的柱子，兩種都會讓人誤以為「就是這樣」。
  const dated = useMemo(
    () => new Set(series.flatMap((s) => s.points.filter((p) => p.value != null).map((p) => p.date))),
    [series]
  );

  if (!scale || length === 0) return null;

  if (dated.size < 2) {
    return (
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        目前只有 {dated.size} 天的資料，畫不出走勢。這一類資料只能每天收集、無法回補歷史，
        要等排程多跑幾天才會有線。
      </p>
    );
  }

  // 每個資料點的水平位置。只有一點時擺中間，不然會貼在最左邊。
  const x = (index: number) =>
    length === 1 ? LEFT + PLOT_WIDTH / 2 : LEFT + (index / (length - 1)) * PLOT_WIDTH;

  const digits = axisDigits(scale.span);
  const gridValues = Array.from(
    { length: GRID_LINES + 1 },
    (_, i) => scale.min + (scale.span * i) / GRID_LINES
  );

  const labelStep = Math.max(1, Math.ceil(length / X_LABELS));

  return (
    <div className="flex flex-col gap-stack-sm">
      <div className="flex flex-wrap items-center gap-stack-md">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            {mode === 'line' && (
              <svg width="20" height="6" aria-hidden="true">
                <line
                  x1="0"
                  y1="3"
                  x2="20"
                  y2="3"
                  strokeWidth="2"
                  strokeDasharray={s.dash || undefined}
                  className={s.className ?? 'stroke-primary'}
                />
              </svg>
            )}
            <span className="font-body-sm text-body-sm text-on-surface-variant">{s.label}</span>
            <span className="font-data-md text-data-md text-on-surface">
              {(() => {
                // 圖例顯示最後一個有值的點，不是最後一點——最後一天常常還沒公布。
                const last = [...s.points].reverse().find((p) => p.value != null);
                return last?.value == null ? DASH : formatNumber(last.value, digits);
              })()}
            </span>
          </span>
        ))}
        {unit && <span className="font-body-sm text-body-sm text-outline">單位：{unit}</span>}
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label={series.map((s) => s.label).join('、') + '走勢圖'}
      >
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={LEFT}
              y1={scale.y(value)}
              x2={LEFT + PLOT_WIDTH}
              y2={scale.y(value)}
              className="stroke-outline-variant"
              strokeWidth="1"
              opacity="0.5"
            />
            <text
              x={LEFT + PLOT_WIDTH + 8}
              y={scale.y(value) + 4}
              className="fill-on-surface-variant"
              fontSize="12"
            >
              {formatNumber(value, digits)}
            </text>
          </g>
        ))}

        {/* 柱狀圖的零軸畫粗一點：正負的分界比其他格線重要。 */}
        {mode === 'bar' && scale.min < 0 && (
          <line
            x1={LEFT}
            y1={scale.zero}
            x2={LEFT + PLOT_WIDTH}
            y2={scale.zero}
            className="stroke-outline"
            strokeWidth="1.5"
          />
        )}

        {mode === 'bar'
          ? series[0].points.map((point, index) => {
              if (point.value == null) return null;
              const barWidth = Math.max(1.5, (PLOT_WIDTH / length) * 0.6);
              const top = Math.min(scale.y(point.value), scale.zero);
              const height = Math.abs(scale.y(point.value) - scale.zero);
              return (
                <rect
                  key={point.date}
                  x={x(index) - barWidth / 2}
                  y={top}
                  width={barWidth}
                  height={Math.max(height, 0.5)}
                  // 台股慣例漲紅跌綠，跟全站其他地方同一組色票。
                  className={point.value >= 0 ? 'fill-quote-up' : 'fill-quote-down'}
                />
              );
            })
          : series.map((s) => {
              // 遇到 null 就斷線，不要跨過去連成一條——那會憑空畫出不存在的走勢。
              const segments: string[] = [];
              let current: string[] = [];
              s.points.forEach((point, index) => {
                if (point.value == null) {
                  if (current.length > 1) segments.push(current.join(' '));
                  current = [];
                  return;
                }
                current.push(`${current.length === 0 ? 'M' : 'L'}${x(index)},${scale.y(point.value)}`);
              });
              if (current.length > 1) segments.push(current.join(' '));
              return segments.map((d, i) => (
                <path
                  key={`${s.label}-${i}`}
                  d={d}
                  fill="none"
                  strokeWidth="2"
                  strokeDasharray={s.dash || undefined}
                  className={s.className ?? 'stroke-primary'}
                />
              ));
            })}

        {series[0].points.map((point, index) =>
          index % labelStep === 0 || index === length - 1 ? (
            <text
              key={point.date}
              x={x(index)}
              y={HEIGHT - 14}
              textAnchor="middle"
              className="fill-outline"
              fontSize="12"
            >
              {point.date.slice(5).replace('-', '/')}
            </text>
          ) : null
        )}
      </svg>

      {footnote && (
        <p className="font-body-sm text-body-sm text-on-surface-variant">{footnote}</p>
      )}
    </div>
  );
}
