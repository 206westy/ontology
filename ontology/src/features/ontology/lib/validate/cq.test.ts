import { describe, it, expect } from 'vitest';
import {
  evaluateCompetencyQuestions,
  buildGraphPathChecker,
  parsePathRelations,
  type CqGraphEdge,
} from './cq';
import type { PatternTraversalTemplate } from '../patterns/types';

const FMEA_CQS = [
  '증상 X의 원인은 무엇인가?',
  '원인 Y의 조치는 무엇인가?',
];

const FMEA_TEMPLATES: PatternTraversalTemplate[] = [
  { cq: '증상 X의 원인은 무엇인가?', path: '(:Symptom)-[:indicates]->(:FailureMode)-[:caused_by]->(:Cause)' },
  { cq: '원인 Y의 조치는 무엇인가?', path: '(:Cause)-[:resolved_by]->(:Action)' },
];

describe('parsePathRelations', () => {
  it('경로에서 관계타입을 순서대로 추출한다', () => {
    expect(parsePathRelations(FMEA_TEMPLATES[0].path)).toEqual([
      'indicates',
      'caused_by',
    ]);
    expect(parsePathRelations(FMEA_TEMPLATES[1].path)).toEqual(['resolved_by']);
  });
});

describe('buildGraphPathChecker (다중 홉 체인)', () => {
  it('필요한 체인이 있으면 경로 존재로 본다', () => {
    const edges: CqGraphEdge[] = [
      { sourceId: 's1', targetId: 'f1', relationName: 'indicates' },
      { sourceId: 'f1', targetId: 'c1', relationName: 'caused_by' },
    ];
    const checker = buildGraphPathChecker(edges);
    expect(checker(FMEA_TEMPLATES[0].path)).toBe(true);
  });

  it('체인이 끊기면(다음 홉 없음) 경로 없음으로 본다', () => {
    const edges: CqGraphEdge[] = [
      { sourceId: 's1', targetId: 'f1', relationName: 'indicates' },
      // caused_by 없음 → 체인 끊김.
    ];
    const checker = buildGraphPathChecker(edges);
    expect(checker(FMEA_TEMPLATES[0].path)).toBe(false);
  });

  it('연결되지 않은 엣지는 체인으로 잇지 않는다', () => {
    const edges: CqGraphEdge[] = [
      { sourceId: 's1', targetId: 'f1', relationName: 'indicates' },
      { sourceId: 'OTHER', targetId: 'c1', relationName: 'caused_by' }, // f1 과 무관
    ];
    const checker = buildGraphPathChecker(edges);
    expect(checker(FMEA_TEMPLATES[0].path)).toBe(false);
  });
});

describe('evaluateCompetencyQuestions (H7 통과율)', () => {
  it('필요한 체인이 모두 있으면 4/4처럼 전부 통과', () => {
    const edges: CqGraphEdge[] = [
      { sourceId: 's1', targetId: 'f1', relationName: 'indicates' },
      { sourceId: 'f1', targetId: 'c1', relationName: 'caused_by' },
      { sourceId: 'c1', targetId: 'a1', relationName: 'resolved_by' },
    ];
    const rate = evaluateCompetencyQuestions(
      FMEA_CQS,
      FMEA_TEMPLATES,
      buildGraphPathChecker(edges),
    );
    expect(rate.passed).toBe(2);
    expect(rate.total).toBe(2);
    expect(rate.label).toBe('2/2');
    expect(rate.results.every((r) => r.passed)).toBe(true);
  });

  it('답 경로가 없는 CQ는 실패로 표시된다', () => {
    const edges: CqGraphEdge[] = [
      { sourceId: 's1', targetId: 'f1', relationName: 'indicates' },
      { sourceId: 'f1', targetId: 'c1', relationName: 'caused_by' },
      // resolved_by 없음 → 2번째 CQ 실패.
    ];
    const rate = evaluateCompetencyQuestions(
      FMEA_CQS,
      FMEA_TEMPLATES,
      buildGraphPathChecker(edges),
    );
    expect(rate.label).toBe('1/2');
    const failed = rate.results.find((r) => !r.passed);
    expect(failed?.cq).toBe('원인 Y의 조치는 무엇인가?');
  });

  it('템플릿 없는 CQ는 답 경로 미정의 → 실패', () => {
    const rate = evaluateCompetencyQuestions(
      ['템플릿 없는 질문'],
      [],
      () => true, // 어떤 경로든 존재한다고 해도 path 자체가 없으면 실패.
    );
    expect(rate.passed).toBe(0);
    expect(rate.results[0].path).toBeNull();
    expect(rate.results[0].passed).toBe(false);
  });

  it('CQ 가 하나도 없으면 vacuous 통과(1.0)', () => {
    const rate = evaluateCompetencyQuestions([], [], () => false);
    expect(rate.total).toBe(0);
    expect(rate.passRate).toBe(1);
    expect(rate.label).toBe('0/0');
  });
});
