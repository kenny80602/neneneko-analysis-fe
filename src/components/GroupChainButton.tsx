import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GroupHeat, GroupMembers } from '../api/types';
import { buildChainGraph, ChainSource } from '../utils/groupChain';
import { TargetStore } from '../hooks/useTargets';
import { DASH, formatSignedPercent, quoteColor } from '../utils/format';
import TargetPriceEditor from './TargetPriceEditor';

// 節點與版面尺寸（px）。名稱最長的族群約 14 個字，寬度給到兩行放得下。
const NODE_W = 148;
const NODE_H = 52;
const COL_GAP = 56;
const ROW_GAP = 10;
const POPOVER_MARGIN = 16;
// 滑鼠從圖示移到浮層中間會經過一小段空白，延遲一下才關，不然永遠點不到浮層。
const CLOSE_DELAY_MS = 200;

// 詳情面板最小寬度。只有一個節點的圖很窄（148px），但底下的股票小卡片至少要放得下兩欄。
const DETAIL_MIN_W = 340;

interface HeatEntry {
  item: GroupHeat;
  rank: number;
}

/** 族群裡的一檔股票。returnPct 是 null 代表今天算不出來或這一頁沒有行情，不是平盤。 */
export interface ChainStock {
  symbol: string;
  name: string;
  returnPct: number | null;
  /** 在這個族群的龍頭排名：1 龍頭、2 老二、3 老三；不在龍頭三檔裡是 null。 */
  coreRank: number | null;
}

const CORE_LABEL: Record<number, string> = { 1: '龍頭', 2: '老二', 3: '老三' };

/**
 * 組出「族群名稱 → 這個族群的股票」。
 *
 * 名單以完整成員清單為準（含今天停牌、除權息、算不出報酬的），今天的漲跌取自熱度榜；
 * 成員清單還沒載入時退到熱度榜裡算得出報酬的那幾檔。兩邊都沒有就是空陣列，
 * 畫面會說明，不會畫成「這個族群沒有股票」。
 * 有行情的依報酬由高到低排在前面，沒行情的接在後面保持原順序。
 */
export function chainStocksOf(
  roster: GroupMembers[],
  heat?: Map<string, HeatEntry>
): (group: string) => ChainStock[] {
  const rosterByName = new Map(roster.map((entry) => [entry.group.name, entry.members]));
  const rosterLeaders = new Map(
    roster
      .filter((entry) => (entry.group.leaders ?? []).length > 0)
      .map((entry) => [entry.group.name, entry.group.leaders.map((l) => l.symbol)])
  );
  return (group) => {
    const heatMembers = heat?.get(group)?.item.members ?? [];
    const returns = new Map(heatMembers.map((m) => [m.symbol, m.return_pct]));
    // 龍頭三檔優先取族群本身落地的（每一頁都拿得到），沒有才用熱度榜帶的。
    const leaders = rosterLeaders.get(group) ?? heat?.get(group)?.item.core?.map((c) => c.symbol) ?? [];
    const coreRankOf = (symbol: string) => {
      const index = leaders.indexOf(symbol);
      return index >= 0 ? index + 1 : null;
    };
    const full = rosterByName.get(group);
    const stocks: ChainStock[] = full
      ? full.map((m) => ({
          symbol: m.symbol,
          name: m.name,
          returnPct: returns.get(m.symbol) ?? null,
          coreRank: coreRankOf(m.symbol),
        }))
      : heatMembers.map((m) => ({
          symbol: m.symbol,
          name: m.name,
          returnPct: m.return_pct,
          coreRank: coreRankOf(m.symbol),
        }));
    const rank = (stock: ChainStock) => (stock.returnPct == null ? -Infinity : stock.returnPct);
    return stocks
      .map((stock, index) => ({ stock, index }))
      .sort((a, b) => rank(b.stock) - rank(a.stock) || a.index - b.index)
      .map(({ stock }) => stock);
  };
}

interface GroupChainButtonProps {
  /** 要畫哪個族群的鏈。 */
  name: string;
  /** 全部族群的「名稱＋上游」，圖要沿著它往上下追。 */
  sources: ChainSource[];
  /**
   * 今天的熱度榜，用來在節點上標名次與報酬；不在榜上的節點標「今天不在榜上」。
   * 不傳（例如族群維護頁沒載入熱度榜）就整個不標，而不是每個節點都寫「不在榜上」誤導人。
   */
  heat?: Map<string, HeatEntry>;
  total?: number;
  /**
   * 摸（或點）圖裡的族群時，底下顯示這個族群的股票。不傳就沒有這個功能。
   * 用 chainStocksOf 組。
   */
  stocksOf?: (group: string) => ChainStock[];
  /** 傳了就在每檔股票旁顯示自己設定的目標價，並可就地設定。 */
  targets?: TargetStore;
}

/**
 * 族群旁邊的小圖示：滑鼠移上去（或點一下釘住）就顯示這個族群整條上下游的關聯圖。
 *
 * 浮層用 fixed 定位：表格容器有 overflow-x-auto，絕對定位的浮層會被裁掉。
 * 圖本身是 HTML 節點加一層 SVG 箭頭，不引入任何圖表套件。
 */
export default function GroupChainButton({ name, sources, heat, total = 0, stocksOf, targets }: GroupChainButtonProps) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  // 圖裡目前選中看股票的族群。打開時從自己開始，摸到哪個就換成哪個。
  const [focus, setFocus] = useState(name);
  const [box, setBox] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  const graph = useMemo(() => buildChainGraph(sources, name), [sources, name]);
  const rows = Math.max(1, ...graph.columns.map((column) => column.length));
  const width = graph.columns.length * NODE_W + (graph.columns.length - 1) * COL_GAP;
  const popoverInner = Math.max(width, DETAIL_MIN_W);
  const height = rows * NODE_H + (rows - 1) * ROW_GAP;

  // 有股票面板時浮層會高一截，放置位置要多留空間。只取「有沒有」，函式本身每次 render 都是新的。
  const hasStocks = stocksOf !== undefined;

  const place = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const popoverWidth = Math.min(popoverInner + 32, window.innerWidth - POPOVER_MARGIN * 2);
    const left = Math.max(POPOVER_MARGIN, Math.min(rect.left, window.innerWidth - popoverWidth - POPOVER_MARGIN));
    // 想要的高度：標題與說明＋圖＋股票面板。放不下的話圖和股票面板各自捲動，整個浮層不會被裁掉。
    const wanted = height + (hasStocks ? 320 : 100) + 90;
    const boxHeight = Math.min(wanted, window.innerHeight - POPOVER_MARGIN * 2);
    // 優先放在圖示正下方；放不下就整個往上挪到下緣貼齊視窗。浮層可以蓋住圖示：
    // 滑鼠從圖示移進浮層的瞬間不會被收起（見 closeTimer）。
    const top = Math.max(
      POPOVER_MARGIN,
      Math.min(rect.bottom + 6, window.innerHeight - POPOVER_MARGIN - boxHeight)
    );
    setBox({ left, top, maxHeight: window.innerHeight - POPOVER_MARGIN - top });
  }, [popoverInner, height, hasStocks]);

  const show = () => {
    window.clearTimeout(closeTimer.current);
    if (!open) setFocus(name);
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

  // 頁面捲動或視窗縮放時重新算位置；圖示捲出畫面就收起來（釘住的也一樣，不然浮層會飄在半空）。
  // 浮層自己內部的捲動不算頁面捲動：之前這裡一律收起來，結果在浮層裡往下捲看底下的股票時，
  // 浮層就整個消失了。
  useEffect(() => {
    if (!open) return;
    const reposition = (event?: Event) => {
      // resize 的目標是 window、不是 DOM 節點，先確認是節點才能問 contains。
      if (event && event.target instanceof Node && popoverRef.current?.contains(event.target)) return;
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) {
        setPinned(false);
        setOpen(false);
        return;
      }
      place();
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, place]);

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
        onClick={(event) => {
          // 這顆按鈕會放在可點擊展開的表格列裡，不能讓點擊冒泡成「展開這一列」。
          event.stopPropagation();
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

      {open && box && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={`${name} 的上下游關聯圖`}
          onMouseEnter={() => window.clearTimeout(closeTimer.current)}
          onMouseLeave={hideSoon}
          // 掛在 body 之後，React 的事件仍會沿著元件樹冒泡回放按鈕的那一列：
          // 不擋的話，點圖裡的節點會連帶把表格那一列展開或選取。
          onClick={(event) => event.stopPropagation()}
          style={{
            position: 'fixed',
            left: box.left,
            top: box.top,
            maxHeight: box.maxHeight,
            width: Math.min(popoverInner + 32, window.innerWidth - POPOVER_MARGIN * 2),
          }}
          className="z-50 flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-lg"
        >
          <p className="font-body-md text-body-md text-on-surface font-semibold">
            {name}
            <span className="ml-2 font-body-sm text-body-sm font-normal text-on-surface-variant">
              上下游關聯圖
            </span>
          </p>
          <p className="mt-1 mb-3 font-body-sm text-body-sm text-on-surface-variant">
            由左到右是供貨方向（上游 → 下游）。實線是已確認的關係，虛線是推論。
            {heat && '節點下方是今天的熱度名次與中位數報酬——這是現況，不是預測。'}
          </p>

          {/* 圖本身超過高度或寬度時自己捲動，底下的股票面板才一直看得到。 */}
          <div className="max-h-[40vh] shrink-0 overflow-auto overscroll-contain">
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
              const entry = heat?.get(node.name);
              const isSelf = node.level === 0;
              return (
                <div
                  key={node.name}
                  style={{ position: 'absolute', left: pos.x, top: pos.y, width: NODE_W, height: NODE_H }}
                  onMouseEnter={() => stocksOf && setFocus(node.name)}
                  onClick={() => stocksOf && setFocus(node.name)}
                  data-testid={`chain-node-${node.name}`}
                  className={`flex flex-col justify-center rounded-lg border px-2 py-1 ${stocksOf ? 'cursor-pointer' : ''} ${
                    isSelf
                      ? 'border-primary bg-primary/10 ring-1 ring-primary'
                      : 'border-outline-variant bg-surface-container-low'
                  } ${stocksOf && focus === node.name ? 'ring-2 ring-primary' : ''}`}
                  title={
                    heat ? (entry ? `熱度第 ${entry.rank} / ${total} 名` : '今天不在榜上（成員一檔都算不出報酬）') : undefined
                  }
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
                    heat && <span className="font-body-sm text-[11px] text-outline">今天不在榜上</span>
                  )}
                </div>
              );
            })}
          </div>
          </div>

          {stocksOf && (
            <StockPanel group={focus} stocks={stocksOf(focus)} showReturn={heat !== undefined} targets={targets} />
          )}
        </div>,
        document.body
      )}
    </>
  );
}

// 圖底下的股票面板：摸到（或點到）哪個族群就列出它的股票。
function StockPanel({
  group,
  stocks,
  showReturn,
  targets,
}: {
  group: string;
  stocks: ChainStock[];
  showReturn: boolean;
  targets?: TargetStore;
}) {
  return (
    <div
      className="mt-4 min-h-[160px] flex-1 overflow-auto overscroll-contain border-t border-outline-variant pt-3"
      data-testid="chain-stocks"
    >
      <p className="mb-2 font-body-sm text-body-sm text-on-surface-variant">
        <span className="text-on-surface font-semibold">{group}</span> 的股票
        {stocks.length > 0 && `（${stocks.length} 檔）`}
        <span className="ml-2 text-outline">摸圖裡的族群可以換看別的</span>
      </p>
      {stocks.length === 0 ? (
        <p className="font-body-sm text-body-sm text-outline">成員清單還沒載入，或這個族群沒有成員。</p>
      ) : (
        <div className="grid gap-1 sm:grid-cols-2">
          {stocks.map((stock) => (
            <div
              key={stock.symbol}
              className="flex items-baseline gap-2 rounded border border-outline-variant bg-surface-container-low px-2 py-1"
            >
              <span className="font-data-md text-data-md text-on-surface-variant">{stock.symbol}</span>
              <span className="font-body-sm text-body-sm text-on-surface truncate">{stock.name || DASH}</span>
              {stock.coreRank != null && (
                <span
                  className="shrink-0 rounded px-1 py-0.5 bg-primary/15 text-primary font-body-sm text-[11px] font-bold"
                  title="依最新月營收排序，營收大不一定是產業龍頭"
                >
                  {CORE_LABEL[stock.coreRank] ?? `第${stock.coreRank}`}
                </span>
              )}
              {showReturn && (
                <span className={`ml-auto font-data-md text-data-md ${quoteColor(stock.returnPct)}`}>
                  {formatSignedPercent(stock.returnPct)}
                </span>
              )}
              {targets && (
                <span className={`${showReturn ? '' : 'ml-auto'} font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap`}>
                  目標 <TargetPriceEditor symbol={stock.symbol} store={targets} compact />
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
