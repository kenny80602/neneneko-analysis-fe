// 族群上下游關聯圖的版面計算。純函式，不碰畫面也不碰 api。

export interface ChainLink {
  name: string;
  inferred: boolean;
}

/** 只需要「名稱＋上游」就能畫圖，熱度榜的列與族群清單的列都能直接餵進來。 */
export interface ChainSource {
  name: string;
  upstream: ChainLink[];
}

export interface ChainNode {
  name: string;
  /** 0 是選中的族群，負數往上游、正數往下游，數字大小是離它的最長距離。 */
  level: number;
}

export interface ChainEdge {
  /** 上游，供貨方。 */
  from: string;
  /** 下游，收貨方。 */
  to: string;
  inferred: boolean;
}

export interface ChainGraph {
  /** 由上游到下游，一欄一個層級，同一欄內依名稱排序。 */
  columns: ChainNode[][];
  edges: ChainEdge[];
}

/**
 * 畫出 name 這個族群的整條供應鏈：往上追到最上游、往下追到最下游。
 *
 * 只畫「這個族群的祖先與後代」，不畫旁支——例如晶圓代工的下游是封測，但封測自己還有
 * 探針卡等別的上游，那些不是晶圓代工的鏈，畫進來整張圖會長成整個產業的網。
 *
 * 層級用最長路徑：A→B→C 同時 A→C 時，C 排在 B 之後而不是跟 B 同一欄，這樣所有箭頭都往右。
 * 資料理論上是無環的（後端存檔時擋掉了），這裡仍然防呆：遇到環就停，不會無限遞迴。
 */
export function buildChainGraph(groups: ChainSource[], name: string): ChainGraph {
  const parents = new Map<string, ChainLink[]>();
  const children = new Map<string, ChainLink[]>();
  for (const group of groups) {
    parents.set(group.name, group.upstream);
    for (const up of group.upstream) {
      const list = children.get(up.name) ?? [];
      list.push({ name: group.name, inferred: up.inferred });
      children.set(up.name, list);
    }
  }

  const reach = (start: string, next: Map<string, ChainLink[]>): Set<string> => {
    const seen = new Set<string>();
    const stack = [start];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      for (const link of next.get(current) ?? []) {
        if (link.name !== start && !seen.has(link.name)) {
          seen.add(link.name);
          stack.push(link.name);
        }
      }
    }
    return seen;
  };

  const ancestors = reach(name, parents);
  const descendants = reach(name, children);
  // 有環的話一個節點會同時是祖先與後代，那種資料畫不出有方向的圖，只留祖先那一側。
  ancestors.forEach((n) => descendants.delete(n));

  // 離選中族群的最長距離。memo 同時當作「正在算」的標記，遇到環回 0 而不是無限遞迴。
  const longest = (
    node: string,
    allowed: Set<string>,
    next: Map<string, ChainLink[]>,
    memo: Map<string, number>
  ): number => {
    if (node === name) return 0;
    const cached = memo.get(node);
    if (cached !== undefined) return cached;
    memo.set(node, 0);
    let best = 0;
    for (const link of next.get(node) ?? []) {
      if (link.name === name || allowed.has(link.name)) {
        best = Math.max(best, longest(link.name, allowed, next, memo) + 1);
      }
    }
    memo.set(node, best);
    return best;
  };

  const levels = new Map<string, number>([[name, 0]]);
  const upMemo = new Map<string, number>();
  ancestors.forEach((node) => levels.set(node, -longest(node, ancestors, children, upMemo)));
  const downMemo = new Map<string, number>();
  descendants.forEach((node) => levels.set(node, longest(node, descendants, parents, downMemo)));

  const byLevel = new Map<number, ChainNode[]>();
  levels.forEach((level, node) => {
    const list = byLevel.get(level) ?? [];
    list.push({ name: node, level });
    byLevel.set(level, list);
  });
  const columns = Array.from(byLevel.keys())
    .sort((a, b) => a - b)
    .map((level) => (byLevel.get(level) as ChainNode[]).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')));

  // 邊只收「兩端都在這條鏈上」的：祖先之間、祖先到選中族群、選中族群與後代、後代之間。
  // 旁支（例如封測自己另外的上游）兩端有一端不在鏈上，所以不會畫進來。
  const onChain = new Set<string>([name]);
  ancestors.forEach((n) => onChain.add(n));
  descendants.forEach((n) => onChain.add(n));
  const edges: ChainEdge[] = [];
  onChain.forEach((node) => {
    for (const link of parents.get(node) ?? []) {
      // 後代的上游若是祖先（跨過選中族群的捷徑），兩端雖然都在鏈上但不是同一條線，不畫。
      const crosses = ancestors.has(link.name) && descendants.has(node);
      if (onChain.has(link.name) && !crosses) {
        edges.push({ from: link.name, to: node, inferred: link.inferred });
      }
    }
  });
  return { columns, edges };
}
