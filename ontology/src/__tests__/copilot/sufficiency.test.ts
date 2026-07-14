import { describe, it, expect } from 'vitest';
import {
  classifyProblemType,
  getTemplate,
  DOMAIN_TEMPLATES,
} from '@/lib/copilot/templates';
import { scoreSufficiency } from '@/lib/copilot/sufficiency';

describe('classifyProblemType', () => {
  it('SPC 키워드를 spc 로 분류한다', () => {
    expect(classifyProblemType('공정 관리도로 이상탐지하고 싶다')).toBe('spc');
  });
  it('정비 키워드를 maintenance 로 분류한다', () => {
    expect(classifyProblemType('예방정비 시점을 결정')).toBe('maintenance');
  });
  it('매칭 없으면 unknown', () => {
    expect(classifyProblemType('고객 이탈 예측')).toBe('unknown');
  });
});

describe('scoreSufficiency', () => {
  const spc = getTemplate('spc')!;

  it('컬럼이 없으면 verdict=모름(데이터 없이 단정 금지)', () => {
    const r = scoreSufficiency(spc, []);
    expect(r.verdict).toBe('모름');
    expect(r.score).toBe(0);
  });

  it('동의어로 필수 컬럼을 매칭한다(측정값←measure, 규격상한←USL)', () => {
    const r = scoreSufficiency(spc, ['measure', 'timestamp', 'eqp_id', 'USL', 'LSL']);
    expect(r.verdict).toBe('충분');
    expect(r.score).toBeGreaterThanOrEqual(80);
    const measure = r.requiredColumns.find((c) => c.role === '측정값');
    expect(measure?.present).toBe(true);
    expect(measure?.matchedTo).toBe('measure');
  });

  it('일부만 있으면 부족 + 결측 목록', () => {
    const r = scoreSufficiency(spc, ['measure', 'eqp_id']);
    expect(r.verdict).toBe('부족');
    expect(r.missing.some((m) => m.what === '규격상한')).toBe(true);
    expect(r.missing.every((m) => m.why && m.howToGet)).toBe(true); // 근거·획득처 필수
  });
});

describe('DOMAIN_TEMPLATES', () => {
  it('모든 템플릿은 필수 컬럼과 함수 템플릿을 가진다', () => {
    for (const t of DOMAIN_TEMPLATES) {
      expect(t.requiredColumns.length).toBeGreaterThan(0);
      expect(t.functionTemplates.length).toBeGreaterThan(0);
    }
  });
});
