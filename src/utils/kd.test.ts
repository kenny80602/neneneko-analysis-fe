import { KD_HIGH, KD_NEAR, kdLevel } from './kd';

describe('kdLevel', () => {
  it('80 以上是高檔、70～80 是接近、其餘不提示', () => {
    expect(kdLevel(95)).toBe('high');
    expect(kdLevel(KD_HIGH)).toBe('high');
    expect(kdLevel(79.99)).toBe('near');
    expect(kdLevel(KD_NEAR)).toBe('near');
    expect(kdLevel(69.99)).toBe('none');
    expect(kdLevel(20)).toBe('none');
  });

  it('算不出來不提示，不當成 0', () => {
    expect(kdLevel(null)).toBe('none');
    expect(kdLevel(undefined)).toBe('none');
    expect(kdLevel(NaN)).toBe('none');
  });
});
