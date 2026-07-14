import { describe, it, expect } from 'vitest';
import { evaluateSpcFunction, type OrderedMeasurement } from '@/lib/functions/spc-eval';

function seq(values: number[]): OrderedMeasurement[] {
  return values.map((value, i) => ({ instanceId: `inst-${i}`, value }));
}

describe('evaluateSpcFunction (i_mr)', () => {
  it('측정값 시퀀스를 인스턴스 1:1 판정으로 매핑한다', () => {
    const m = seq([10, 10, 10, 10, 10, 10, 10, 50]);
    const r = evaluateSpcFunction(m, { chartType: 'i_mr' });
    expect(r.runRows).toHaveLength(8);
    expect(r.decisionRows).toHaveLength(8);
    expect(r.spcResult.verdict).toBe('fail');
    // 마지막 인스턴스가 이상점
    expect(r.runRows[7].instanceId).toBe('inst-7');
    expect(r.runRows[7].verdict).toBe('fail');
    // decision verdict 는 통일 계약(pass_fail + spc 근거)
    expect(r.decisionRows[7].verdict.kind).toBe('pass_fail');
    expect((r.decisionRows[7].verdict as { spc: { verdict: string } }).spc.verdict).toBe('fail');
  });

  it('2개 미만은 거부한다', () => {
    expect(() => evaluateSpcFunction(seq([1]), { chartType: 'i_mr' })).toThrow();
  });
});

describe('evaluateSpcFunction (xbar_r)', () => {
  it('연속 n개를 부분군으로 묶어 판정한다', () => {
    const m = seq([2, 4, 6, 3, 5, 4, 5, 5, 5]); // 9점, n=3 → 3 부분군
    const r = evaluateSpcFunction(m, { chartType: 'xbar_r', subgroupSize: 3 });
    expect(r.runRows).toHaveLength(3);
    expect(r.runRows[0].lotId).toBe('subgroup-1');
    // 대표 인스턴스 = 각 부분군의 마지막
    expect(r.runRows[0].instanceId).toBe('inst-2');
  });

  it('부분군 크기보다 측정값이 적으면 거부', () => {
    expect(() => evaluateSpcFunction(seq([1, 2]), { chartType: 'xbar_r', subgroupSize: 5 })).toThrow();
  });
});
