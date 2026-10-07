import { buildChainGraph, ChainSource } from './groupChain';

const link = (name: string, inferred = false) => ({ name, inferred });

// 玻纖布、銅箔 → CCL → PCB 板廠 → 伺服器 ODM；另有旁支「鑽針」也供貨給 PCB 板廠。
const groups: ChainSource[] = [
  { name: '玻纖布', upstream: [] },
  { name: '銅箔', upstream: [] },
  { name: '鑽針', upstream: [] },
  { name: 'CCL', upstream: [link('玻纖布'), link('銅箔', true)] },
  { name: 'PCB 板廠', upstream: [link('CCL'), link('鑽針')] },
  { name: '伺服器 ODM', upstream: [link('PCB 板廠'), link('CCL')] },
];

describe('buildChainGraph', () => {
  it('由上游到下游一欄一個層級，選中的在 0', () => {
    const { columns } = buildChainGraph(groups, 'CCL');
    expect(columns.map((c) => c.map((n) => n.name))).toEqual([['玻纖布', '銅箔'], ['CCL'], ['PCB 板廠'], ['伺服器 ODM']]);
    expect(columns.map((c) => c[0].level)).toEqual([-1, 0, 1, 2]);
  });

  it('層級用最長路徑：ODM 同時是 CCL 與 PCB 的下游，仍排在 PCB 之後', () => {
    const { columns } = buildChainGraph(groups, 'CCL');
    expect(columns[3][0].name).toBe('伺服器 ODM');
  });

  it('只畫這條鏈：旁支的鑽針不進來，CCL → ODM 的捷徑邊保留', () => {
    const { columns, edges } = buildChainGraph(groups, 'CCL');
    expect(columns.flat().map((n) => n.name)).not.toContain('鑽針');
    expect(edges).toContainEqual({ from: 'CCL', to: '伺服器 ODM', inferred: false });
    expect(edges).toContainEqual({ from: '銅箔', to: 'CCL', inferred: true });
    expect(edges.some((e) => e.from === '鑽針')).toBe(false);
  });

  it('沒有任何上下游時只有自己一欄', () => {
    const { columns, edges } = buildChainGraph(groups, '鑽針');
    expect(columns.flat().map((n) => n.name)).toEqual(['鑽針', 'PCB 板廠', '伺服器 ODM']);
    expect(edges.length).toBe(2);
    const alone = buildChainGraph([{ name: '金控', upstream: [] }], '金控');
    expect(alone.columns).toEqual([[{ name: '金控', level: 0 }]]);
    expect(alone.edges).toEqual([]);
  });

  it('資料有環也不會無限遞迴', () => {
    const cyclic: ChainSource[] = [
      { name: 'A', upstream: [link('B')] },
      { name: 'B', upstream: [link('A')] },
    ];
    expect(() => buildChainGraph(cyclic, 'A')).not.toThrow();
  });
});
