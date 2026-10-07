import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GroupHeat } from '../api/types';
import { buildChainGraph, ChainSource } from '../utils/groupChain';
import { formatSignedPercent, quoteColor } from '../utils/format';

// 節點與版面尺寸（px）。名稱最長的族群約 14 個字，寬度給到兩行放得下。
const NODE_W = 148;
const NODE_H = 52;
const COL_GAP = 56;
const ROW_GAP = 10;
const POPOVER_MARGIN = 16;
// 滑鼠從圖示移到浮層中間會經過一小段空白，延遲一下才關，不然永遠點不到浮層。
const CLOSE_DELAY_MS = 200;

interface HeatEntry {
  item: GroupHeat;
  rank: number;
}

interface GroupChainButtonProps {
  /** 要畫哪個族群的鏈。 */
  name: string;
  /** 全部族群的「名稱＋上游」，圖要沿著它往上下追。 */
  sources: ChainSource[];
  /** 今天的熱度榜，用來在節點上標名次與報酬；不在榜上的節點標「今天不在榜上」。 */
  heat: Map<string, HeatEntry>;
  total: number;
}

/**
 * 族群旁邊的小圖示：滑鼠移上去（或點一下釘住）就顯示這個族群整條上下游的關聯圖。
 *
 * 浮層用 fixed 定位：表格容器有 overflow-x-auto，絕對定位的浮層會被裁掉。
 * 圖本身是 HTML 節點加一層 SVG 箭頭，不引入任何圖表套件。
 */
export default function GroupChainButton({ name, sources, heat, total }: GroupChainButtonProps) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [box, setBox] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  const graph = useMemo(() => buildChainGraph(sources, name), [sources, name]);
  const rows = Math.max(1, ...graph.columns.map((column) => column.length));
  const width = graph.columns.length * NODE_W + (graph.columns.length - 1) * COL_GAP;
  const height = rows * NODE_H + (rows - 1) * ROW_GAP;

  const place = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const popoverWidth = Math.min(width + 32, window.innerWidth - POPOVER_MARGIN * 2);
    const left = Math.max(POPOVER_MARGIN, Math.min(rect.left, window.innerWidth - popoverWidth - POPOVER_MARGIN));
    // 下方放不下就放上方，兩邊都放不下就選比較大的那一邊並讓浮層自己捲動。
    const below = window.innerHeight - rect.bottom - POPOVER_MARGIN;
    const above = rect.top - POPOVER_MARGIN;
    const useBelow = below >= Math.min(height + 120, above) || below >= above;
    setBox(
      useBelow
        ? { left, top: rect.bottom + 6, maxHeight: below }
        : { left, top: Math.max(POPOVER_MARGIN, rect.top - 6 - Math.min(above, height + 120)), maxHeight: above }
    );
  }, [width, height]);

  const show = () => {
    window.clearTimeout(closeTimer.current);
    place();
    setOpen(true);
  };
  const hideSoon = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      if (!pinned) setOpen(false);
    }, CLOSE_DELAY_MS);
  };

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // 釘住之後點外面或按 Esc 才關。
  useEffect(() => {
    if (!open || !pinned) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setPinned(false);
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPinned(false);
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, pinned]);

  // 捲動或縮放時位置會跑掉，直接收起來比追著重算簡單。
  useEffect(() => {
    if (!open) return;
    const close = () => {
      setPinned(false);
      setOpen(false);
    };
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  // 節點座標。欄內垂直置中，讓欄數少的那幾欄不會全擠在最上面。
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    graph.columns.forEach((column, columnIndex) => {
      const columnHeight = column.length * NODE_H + (column.length - 1) * ROW_GAP;
      const offset = (height - columnHeight) / 2;
      column.forEach((node, rowIndex) => {
        map.set(node.name, {
          x: columnIndex * (NODE_W + COL_GAP),
          y: offset + rowIndex * (NODE_H + ROW_GAP),
        });
      });
    });
    return map;
  }, [graph, height]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`${name} 的上下游關聯圖`}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onFocus={show}
        onBlur={hideSoon}
        onClick={() => {
          if (pinned) {
            setPinned(false);
            setOpen(false);
          } else {
            setPinned(true);
            show();
          }
        }}
        className={`ml-1 inline-flex align-middle rounded p-0.5 hover:bg-surface-container ${
          pinned ? 'text-primary' : 'text-outline hover:text-primary'
        }`}
      >
        <span className="material-symbols-outlined text-[18px]">account_tree</span>
      </button>

      {open && box && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={`${name} 的上下游關聯圖`}
          onMouseEnter={() => window.clearTimeout(closeTimer.current)}
          onMouseLeave={hideSoon}
          style={{ position: 'fixed', left: box.left, top: box.top, maxHeight: box.maxHeight, maxWidth: window.innerWidth - POPOVER_MARGIN * 2 }}
          className="z-50 overflow-auto rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-lg"
        >
          <p className="font-body-md text-body-md text-on-surface font-semibold">
            {name}
            <span className="ml-2 font-body-sm text-body-sm font-normal text-on-surface-variant">
              上下游關聯圖
            </span>
          </p>
          <p className="mt-1 mb-3 font-body-sm text-body-sm text-on-surface-variant">
            由左到右是供貨方向（上游 → 下游）。實線是已確認的關係，虛線是推論。
            節點下方是今天的熱度名次與中位數報酬——這是現況，不是預測。
          </p>

          <div className="relative" style={{ width, height }}>
            <svg width={width} height={height} className="absolute inset-0" aria-hidden="true">
              <defs>
                <marker id="chain-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" style={{ fill: 'rgb(var(--c-outline))' }} />
                </marker>
              </defs>
              {graph.edges.map((edge) => {
                const from = positions.get(edge.from);
                const to = positions.get(edge.to);
                if (!from || !to) return null;
                const x1 = from.x + NODE_W;
                const y1 = from.y + NODE_H / 2;
                const x2 = to.x;
                const y2 = to.y + NODE_H / 2;
                const mid = (x1 + x2) / 2;
                return (
                  <path
                    key={`${edge.from}→${edge.to}`}
                    d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
                    fill="none"
                    strokeWidth={1.5}
                    strokeDasharray={edge.inferred ? '5 4' : undefined}
                    markerEnd="url(#chain-arrow)"
                    style={{ stroke: 'rgb(var(--c-outline))' }}
                  />
                );
              })}
            </svg>

            {graph.columns.flat().map((node) => {
              const pos = positions.get(node.name);
              if (!pos) return null;
              const entry = heat.get(node.name);
              const isSelf = node.level === 0;
              return (
                <div
                  key={node.name}
                  style={{ position: 'absolute', left: pos.x, top: pos.y, width: NODE_W, height: NODE_H }}
                  className={`flex flex-col justify-center rounded-lg border px-2 py-1 ${
                    isSelf
                      ? 'border-primary bg-primary/10 ring-1 ring-primary'
                      : 'border-outline-variant bg-surface-container-low'
                  }`}
                  title={entry ? `熱度第 ${entry.rank} / ${total} 名` : '今天不在榜上（成員一檔都算不出報酬）'}
                >
                  <span className="font-body-sm text-body-sm text-on-surface font-semibold leading-tight line-clamp-2">
                    {node.name}
                  </span>
                  {entry ? (
                    <span className="font-data-md text-[11px] text-on-surface-variant">
                      #{entry.rank}{' '}
                      <span className={quoteColor(entry.item.median_return)}>
                        {formatSignedPercent(entry.item.median_return)}
                      </span>
                    </span>
                  ) : (
                    <span className="font-body-sm text-[11px] text-outline">今天不在榜上</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
