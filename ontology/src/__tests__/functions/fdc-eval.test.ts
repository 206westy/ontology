import { describe, it, expect } from 'vitest';
import { evaluateFdcFunction, type OrderedMeasurement } from '@/lib/functions/fdc-eval';

function seq(values: number[]): OrderedMeasurement[] {
  return values.map((value, i) => ({ instanceId: `eq-${i}`, value }));
}

describe('evaluateFdcFunction', () => {
  it('임계값 초과 인스턴스를 이상으로 표기한다', () => {
    const r = evaluateFdcFunction(seq([1, 2, 3, 10]), {
      method: 'threshold',
      params: { upper: 5 },
    });
    expect(r.result.faultFlag).toBe(true);
    expect(r.faultInstanceIds).toEqual(['eq-3']);
    expect(r.decisionRows[3].verdict.pass).toBe(false);
    expect(r.decisionRows[0].verdict.pass).toBe(true);
  });

  it('드리프트는 마지막(대표) 인스턴스를 이상으로 표기한다', () => {
    const r = evaluateFdcFunction(seq([1, 2, 3, 4, 5, 6]), {
      method: 'trend',
      params: { driftSlopeThreshold: 0.5 },
    });
    expect(r.result.faultFlag).toBe(true);
    expect(r.faultInstanceIds).toContain('eq-5');
  });

  it('정상 신호는 이상 인스턴스가 없다', () => {
    const r = evaluateFdcFunction(seq([1, 1.1, 0.9, 1, 1.05]), {
      method: 'threshold',
      params: { upper: 5, lower: 0 },
    });
    expect(r.result.faultFlag).toBe(false);
    expect(r.faultInstanceIds).toEqual([]);
  });
});
