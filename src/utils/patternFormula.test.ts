import {
  boxTargets,
  gapToLower,
  measuredTarget,
  moveToTarget,
  parseInput,
  percentB,
  rangeRatio,
  reversalTarget,
  volumeRatio,
} from './patternFormula';

describe('reversalTarget', () => {
  // 例子抄自圖鑑文字：W 底腳 100、頸線 110 → 120；M 頭高點 100、頸線 90 → 80。
  it('W 底往上、M 頭往下，方向由極值在頸線的哪一側決定', () => {
    expect(reversalTarget(110, 100)).toBe(120);
    expect(reversalTarget(90, 100)).toBe(80);
  });
  it('極值等於頸線、缺值、非正價位都算不出來', () => {
    expect(reversalTarget(100, 100)).toBeNull();
    expect(reversalTarget(null, 100)).toBeNull();
    expect(reversalTarget(110, 0)).toBeNull();
    expect(reversalTarget(NaN, 100)).toBeNull();
  });
});

describe('boxTargets', () => {
  it('突破箱頂加箱高、跌破箱底減箱高', () => {
    const r = boxTargets(110, 100);
    expect(r?.height).toBe(10);
    expect(r?.up).toBe(120);
    expect(r?.down).toBe(90);
    expect(r?.heightPct).toBeCloseTo(0.1);
  });
  it('箱頂不高於箱底算不出來', () => {
    expect(boxTargets(100, 100)).toBeNull();
    expect(boxTargets(90, 100)).toBeNull();
  });
});

describe('measuredTarget', () => {
  it('依方向加減度量', () => {
    expect(measuredTarget(100, 15, 'up')).toBe(115);
    expect(measuredTarget(100, 15, 'down')).toBe(85);
    expect(measuredTarget(100, 0, 'up')).toBeNull();
  });
});

describe('moveToTarget', () => {
  it('回傳百分比，正負代表方向', () => {
    expect(moveToTarget(100, 120)).toBe(20);
    expect(moveToTarget(100, 80)).toBe(-20);
    expect(moveToTarget(0, 80)).toBeNull();
  });
});

describe('volumeRatio', () => {
  it('均量為 0 或缺值是 null，不是 Infinity', () => {
    expect(volumeRatio(3000, 2000)).toBe(1.5);
    expect(volumeRatio(3000, 0)).toBeNull();
    expect(volumeRatio(null, 2000)).toBeNull();
  });
});

describe('gapToLower', () => {
  it('除以較低的那個，跟後端的腳差口徑一致', () => {
    expect(gapToLower(104, 100)).toBeCloseTo(0.04);
    expect(gapToLower(100, 104)).toBeCloseTo(0.04);
  });
});

describe('rangeRatio', () => {
  it('區間最高低於最低是 null', () => {
    expect(rangeRatio(110, 100, 105)).toBeCloseTo(10 / 105);
    expect(rangeRatio(100, 110, 105)).toBeNull();
  });
});

describe('percentB', () => {
  // 例子抄自圖鑑：下軌 90、上軌 110、收 105 → 0.75。
  it('下軌 90 上軌 110 收 105 是 0.75', () => {
    expect(percentB(105, 110, 90)).toBe(0.75);
  });
  it('上下軌重合算不出來', () => {
    expect(percentB(100, 100, 100)).toBeNull();
  });
  it('收在軌道外可以小於 0 或大於 1', () => {
    expect(percentB(120, 110, 90)).toBe(1.5);
    expect(percentB(80, 110, 90)).toBe(-0.5);
  });
});

describe('parseInput', () => {
  it('空字串與非數字是 null、千分位逗號可以吃', () => {
    expect(parseInput('')).toBeNull();
    expect(parseInput('  ')).toBeNull();
    expect(parseInput('abc')).toBeNull();
    expect(parseInput('1,234.5')).toBe(1234.5);
    expect(parseInput('0')).toBe(0);
  });
});
