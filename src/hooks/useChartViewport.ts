import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * 圖表的可視範圍：一個蓋在「第 0 ～ 第 total-1 個點」上的滑動視窗。
 *
 * 兩張圖（TrendChart 與 PriceChart）共用這一份，而不是各自寫一套：縮放的倍率、
 * 平移的步幅、最少留幾個點這些數字一旦分岔，同一頁上兩張圖的手感就會不一樣，
 * 而那種不一致很難被當成 bug 回報，只會讓人覺得「這個站的圖怪怪的」。
 *
 * 視窗只管索引，不認識日期也不認識數值——所以它對 K 棒、折線、柱狀圖一視同仁。
 */

/**
 * 可視範圍最少留幾個點。
 *
 * 再少下去就不是「放大看細節」而是「把三個點攤開到整個版面」：折線只剩兩段、
 * Y 軸級距被那兩三個值決定，看起來像劇烈波動，實際上只是尺度被抽掉了。
 */
const MIN_POINTS = 5;

/**
 * 按一次放大／縮小的倍率。
 *
 * 用 1.5 而不是 2：2 倍是「每按一次砍一半」，從 240 筆按三下就只剩 30 筆，
 * 常常一下就過頭而要再按回去。1.5 大約三下縮到三分之一，比較好停在想要的位置。
 */
const ZOOM_STEP = 1.5;

/** 按一次左右移走可視範圍的幾成。半個畫面會失去參照點，四分之一還看得到重疊的部分。 */
const PAN_STEP = 0.25;

export interface ChartViewport {
  /** 可視範圍的第一個索引。 */
  start: number;
  /** 可視範圍有幾個點。 */
  count: number;
  /** 資料總共幾個點。 */
  total: number;
  /** 目前不是「全部顯示」。 */
  zoomed: boolean;
  /** 拖得動（已經放大過，左右還有東西）。 */
  pannable: boolean;
  canZoomIn: boolean;
  canZoomOut: boolean;
  canPanLeft: boolean;
  canPanRight: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  panLeft: () => void;
  panRight: () => void;
  /** 回到預設視窗。 */
  reset: () => void;
  /** 掛在圖表容器上：拖曳平移、Shift + 滾輪縮放。 */
  containerProps: {
    // React 19 的 useRef<T>(null) 型別是 RefObject<T | null>，這裡要跟著寫成可為 null。
    ref: React.RefObject<HTMLDivElement | null>;
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
    style: React.CSSProperties;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * @param total 資料點總數。
 * @param initialCount 預設顯示幾個點，不給就是全部。K 線那張有自己的預設
 *   （日線 120 根、月線 36 根），資料再長也不該一開始就全部擠進來。
 */
export function useChartViewport(total: number, initialCount?: number): ChartViewport {
  const defaultCount = Math.min(total, initialCount ?? total);
  const [view, setView] = useState({
    // 預設看最新的那一段：這幾張圖的時間軸都是左舊右新，而使用者要看的是「最近」。
    start: Math.max(0, total - defaultCount),
    count: defaultCount,
  });

  // 資料換掉就回到預設視窗（換代號、換區間、換日／週／月）。留著舊的 start
  // 會讓新資料一進來就停在某個跟它無關的位置，而畫面上完全看不出為什麼。
  useEffect(() => {
    setView({ start: Math.max(0, total - defaultCount), count: defaultCount });
  }, [total, defaultCount]);

  // 夾在合法範圍內。所有改動都走這裡，才不會有某一條路徑忘了夾。
  const apply = useCallback(
    (next: { start: number; count: number }) => {
      if (total === 0) return;
      const count = clamp(Math.round(next.count), Math.min(MIN_POINTS, total), total);
      const start = clamp(Math.round(next.start), 0, total - count);
      setView((current) =>
        current.start === start && current.count === count ? current : { start, count }
      );
    },
    [total]
  );

  /**
   * 以 anchor（0 是最左、1 是最右）為定點縮放。
   *
   * 定點很重要：不以游標所在位置為中心的話，滾輪往前推時想看的那一段會往旁邊跑掉，
   * 使用者得「放大 → 平移 → 再放大」才追得回來。
   */
  const zoomAt = useCallback(
    (factor: number, anchor: number) => {
      setView((current) => {
        const count = clamp(
          Math.round(current.count / factor),
          Math.min(MIN_POINTS, total),
          total
        );
        const focus = current.start + current.count * anchor;
        const start = clamp(Math.round(focus - count * anchor), 0, Math.max(0, total - count));
        return { start, count };
      });
    },
    [total]
  );

  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; start: number; width: number } | null>(null);

  // Shift + 滾輪縮放。
  //
  // 兩個決定：
  //  1. 用原生 listener 而不是 React 的 onWheel——React 把 wheel 掛成 passive，
  //     在裡面 preventDefault 沒有作用，只會在 console 印一行警告。
  //  2. 一定要按著 Shift。這幾張圖散在很長的頁面裡，滑鼠一經過就吃掉滾輪的話，
  //     使用者會捲不動頁面而且不知道為什麼——那比「不能用滾輪縮放」糟得多。
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.shiftKey) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const anchor = rect.width > 0 ? clamp((event.clientX - rect.left) / rect.width, 0, 1) : 0.5;
      zoomAt(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, anchor);
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const width = event.currentTarget.clientWidth;
      if (width === 0) return;
      // 設 pointer capture：拖到圖表外面（甚至視窗外）也還收得到 move，
      // 不然快速拖曳時常常會在半路斷掉，看起來像卡住。
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, start: view.start, width };
    },
    [view.start]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = drag.current;
      if (!state) return;
      // 往右拖＝把資料往右推＝看更早的資料，所以是負號。
      const delta = -((event.clientX - state.x) / state.width) * view.count;
      apply({ start: state.start + delta, count: view.count });
    },
    [apply, view.count]
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const zoomIn = useCallback(() => zoomAt(ZOOM_STEP, 0.5), [zoomAt]);
  const zoomOut = useCallback(() => zoomAt(1 / ZOOM_STEP, 0.5), [zoomAt]);
  const panLeft = useCallback(
    () => apply({ start: view.start - view.count * PAN_STEP, count: view.count }),
    [apply, view.start, view.count]
  );
  const panRight = useCallback(
    () => apply({ start: view.start + view.count * PAN_STEP, count: view.count }),
    [apply, view.start, view.count]
  );
  const reset = useCallback(
    () => apply({ start: Math.max(0, total - defaultCount), count: defaultCount }),
    [apply, total, defaultCount]
  );

  const containerProps = useMemo(
    () => ({
      ref,
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      // 觸控時垂直方向留給頁面捲動，只攔水平的拖曳。兩個方向都攔的話，
      // 手機上會變成「手指落在圖上就捲不動整頁」。
      style: { touchAction: 'pan-y' as const },
    }),
    [onPointerDown, onPointerMove, endDrag]
  );

  const count = Math.min(view.count, total);
  const start = Math.min(view.start, Math.max(0, total - count));

  return {
    start,
    count,
    total,
    zoomed: count < total,
    pannable: count < total,
    canZoomIn: count > Math.min(MIN_POINTS, total),
    canZoomOut: count < total,
    canPanLeft: start > 0,
    canPanRight: start + count < total,
    zoomIn,
    zoomOut,
    panLeft,
    panRight,
    reset,
    containerProps,
  };
}
