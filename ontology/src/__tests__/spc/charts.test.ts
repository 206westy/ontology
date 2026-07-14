import { describe, it, expect } from 'vitest';
import { computeXbarR, computeImr, computeAttribute } from '@/lib/spc/charts';

describe('computeImr', () => {
  it('개별값 관리한계를 표준 상수(E2=2.66)로 산정한다', () => {
    // MR=[1,2,1,2,4,2,1], MRbar=13/7, xbar=81/8=10.125
    const r = computeImr([10, 11, 9, 10, 12, 8, 10, 11]);
    expect(r.chartType).toBe('i_mr');
    expect(r.centerline).toBeCloseTo(10.125, 3);
    expect(r.ucl).toBeCloseTo(15.065, 2); // 10.125 + 2.66*(13/7)
    expect(r.lcl).toBeCloseTo(5.185, 2);
    expect(r.uclSecondary).toBeCloseTo(6.069, 2); // 3.267*(13/7)
    expect(r.lclSecondary).toBe(0);
    expect(r.sigma).toBeCloseTo(1.6464, 3); // MRbar/1.128
  });

  it('2점 미만은 거부한다', () => {
    expect(() => computeImr([1])).toThrow();
  });
});

describe('computeXbarR', () => {
  it('X-bar/R 관리한계를 부분군 상수(n=3)로 산정한다', () => {
    const r = computeXbarR([
      [2, 4, 6],
      [3, 5, 4],
      [5, 5, 5],
    ]);
    // means=[4,4,5] xbarbar=13/3, ranges=[4,2,0] rbar=2, a2(3)=1.023
    expect(r.centerline).toBeCloseTo(4.3333, 3);
    expect(r.ucl).toBeCloseTo(6.3793, 3);
    expect(r.lcl).toBeCloseTo(2.2873, 3);
    expect(r.uclSecondary).toBeCloseTo(5.148, 3); // d4(3)=2.574 * 2
    expect(r.lclSecondary).toBe(0); // d3(3)=0
    expect(r.sigma).toBeCloseTo(1.1813, 3); // rbar/d2(3)=2/1.693
    expect(r.subgroupSize).toBe(3);
  });

  it('부분군 크기 불균일은 거부한다', () => {
    expect(() => computeXbarR([[1, 2], [1, 2, 3]])).toThrow();
  });
});

describe('computeAttribute', () => {
  it('c 관리도 중심선·한계를 산정한다', () => {
    const r = computeAttribute('c', [2, 3, 1, 4, 2].map((count) => ({ count, size: 1 })));
    expect(r.limits.centerline).toBeCloseTo(2.4, 3); // cbar=12/5
    expect(r.limits.ucl).toBeCloseTo(7.048, 2); // 2.4 + 3*sqrt(2.4)
    expect(r.limits.lcl).toBe(0);
    expect(r.series).toEqual([2, 3, 1, 4, 2]);
  });

  it('p 관리도는 표본크기별 점 한계를 산정한다', () => {
    const r = computeAttribute('p', [
      { count: 2, size: 50 },
      { count: 1, size: 50 },
      { count: 3, size: 50 },
      { count: 0, size: 50 },
    ]);
    expect(r.limits.centerline).toBeCloseTo(0.03, 4); // pbar=6/200
    expect(r.series[0]).toBeCloseTo(0.04, 4);
    expect(r.lclArr.every((l) => l === 0)).toBe(true); // 하한 0 바닥
    expect(r.uclArr[0]).toBeCloseTo(0.1024, 3);
  });

  it('np 관리도는 표본크기 불일치를 거부한다', () => {
    expect(() =>
      computeAttribute('np', [
        { count: 1, size: 50 },
        { count: 2, size: 60 },
      ]),
    ).toThrow();
  });
});
