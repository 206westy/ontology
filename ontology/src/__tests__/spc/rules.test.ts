import { describe, it, expect } from 'vitest';
import {
  evaluateRules,
  ruleSeverity,
  zoneOf,
  DEFAULT_RULES,
} from '@/lib/spc/rules';
import { evaluateSpc } from '@/lib/spc';

describe('zoneOf', () => {
  it('σ 거리를 존으로 라벨링한다', () => {
    expect(zoneOf(3.5)).toBe('beyond+');
    expect(zoneOf(-2.5)).toBe('A-');
    expect(zoneOf(1.5)).toBe('B+');
    expect(zoneOf(0.5)).toBe('C+');
  });
});

describe('ruleSeverity', () => {
  it('3σ 초과·산포이탈은 fail, 그 외 패턴은 warn, 없으면 pass', () => {
    expect(ruleSeverity(['WE1'])).toBe('fail');
    expect(ruleSeverity(['RANGE'])).toBe('fail');
    expect(ruleSeverity(['WE4'])).toBe('warn');
    expect(ruleSeverity([])).toBe('pass');
  });
});

describe('evaluateRules (Western Electric 기본)', () => {
  it('WE1: 3σ 초과 1점을 플래그', () => {
    const hits = evaluateRules([0, 0, 3.5, 0], ['WE1']);
    expect(hits.get(2)).toEqual(['WE1']);
    expect(hits.has(0)).toBe(false);
  });

  it('WE2: 연속 3점 중 2점 같은 쪽 2σ 초과', () => {
    const hits = evaluateRules([0, 0, 2.5, 2.5], ['WE2']);
    expect(hits.get(3)).toContain('WE2');
  });

  it('WE3: 연속 5점 중 4점 같은 쪽 1σ 초과', () => {
    const hits = evaluateRules([1.5, 1.5, 1.5, 1.5, 1.5], ['WE3']);
    expect(hits.get(4)).toContain('WE3');
  });

  it('WE4: 연속 8점 같은 쪽', () => {
    const hits = evaluateRules([0.1, 0.2, 0.3, 0.1, 0.2, 0.3, 0.1, 0.2], ['WE4']);
    expect(hits.get(7)).toEqual(['WE4']);
    expect(hits.has(6)).toBe(false);
  });

  it('기본 룰셋은 Nelson 추세를 켜지 않는다', () => {
    const hits = evaluateRules([0, 1, 2, 3, 4, 5], DEFAULT_RULES);
    expect([...hits.values()].flat()).not.toContain('NELSON3');
  });
});

describe('evaluateRules (Nelson 옵션)', () => {
  it('NELSON3: 연속 6점 증가 추세', () => {
    const hits = evaluateRules([0, 1, 2, 3, 4, 5], ['NELSON3']);
    expect(hits.get(5)).toContain('NELSON3');
  });

  it('NELSON2: 연속 9점 같은 쪽', () => {
    const nine = [0.1, 0.2, 0.1, 0.2, 0.1, 0.2, 0.1, 0.2, 0.1];
    const hits = evaluateRules(nine, ['NELSON2']);
    expect(hits.get(8)).toContain('NELSON2');
  });
});

describe('evaluateSpc (종단)', () => {
  it('관리상태 데이터는 pass', () => {
    const r = evaluateSpc({
      chartType: 'xbar_r',
      subgroups: [
        [10, 12, 11],
        [11, 10, 12],
        [12, 11, 10],
        [10, 11, 12],
        [11, 12, 10],
      ],
      spec: { usl: 20, lsl: 2 },
    });
    expect(r.verdict).toBe('pass');
    expect(r.capability).not.toBeNull();
  });

  it('이상점(3σ 초과)은 fail + WE1 근거', () => {
    const r = evaluateSpc({
      chartType: 'i_mr',
      values: [10, 10, 10, 10, 10, 10, 10, 50],
    });
    expect(r.verdict).toBe('fail');
    expect(r.violatedRuleSummary).toContain('WE1');
    expect(r.points[7].verdict).toBe('fail');
  });
});
