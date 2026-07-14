import { describe, it, expect } from 'vitest';
import { computeCapability } from '@/lib/spc/capability';

describe('computeCapability', () => {
  const values = [9, 10, 11, 10, 9, 11, 10]; // mean=10, 표본표준편차≈0.8165

  it('양측 스펙에서 Cp/Cpk/Pp/Ppk 를 산정한다', () => {
    const r = computeCapability(values, { usl: 16, lsl: 4 }, 2);
    expect(r.mean).toBeCloseTo(10, 6);
    expect(r.cp).toBeCloseTo(1, 6); // (16-4)/(6*2)
    expect(r.cpk).toBeCloseTo(1, 6); // min((16-10)/6,(10-4)/6)
    expect(r.pp).toBeCloseTo(2.449, 2); // 12/(6*0.8165)
    expect(r.ppk).toBeCloseTo(2.449, 2);
  });

  it('한쪽(USL) 스펙만 있으면 Cp/Pp 는 null, Cpk/Ppk 만 산정', () => {
    const r = computeCapability(values, { usl: 16 }, 2);
    expect(r.cp).toBeNull();
    expect(r.pp).toBeNull();
    expect(r.cpk).toBeCloseTo(1, 6);
    expect(r.ppk).toBeCloseTo(2.449, 2);
  });

  it('편향된 평균에서 Cpk 가 Cp 보다 작다', () => {
    const off = [13, 14, 13, 14, 13]; // mean=13.4, USL 16 근접
    const r = computeCapability(off, { usl: 16, lsl: 4 }, 2);
    expect(r.cp).toBeCloseTo(1, 6);
    expect(r.cpk!).toBeLessThan(r.cp!);
  });
});
