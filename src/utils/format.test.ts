import { gapToTarget } from './format';

describe('gapToTarget', () => {
  it('還要漲多少才到目標價；負數是已經超過', () => {
    expect(gapToTarget(100, 120)).toBeCloseTo(20);
    expect(gapToTarget(100, 80)).toBeCloseTo(-20);
    expect(gapToTarget(100, 100)).toBe(0);
  });

  it('沒設目標價或沒有現價是 null，不是 0', () => {
    expect(gapToTarget(100, undefined)).toBeNull();
    expect(gapToTarget(100, null)).toBeNull();
    expect(gapToTarget(0, 120)).toBeNull();
    expect(gapToTarget(null, 120)).toBeNull();
  });
});
