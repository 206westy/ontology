import { describe, it, expect } from 'vitest';
import { scoreExtraction, type ScoredSet } from '@/features/ontology/lib/metrics/extraction-score';
import { computeHealth } from '@/features/ontology/lib/metrics/health';
import { GOLDEN_CASES } from '../fixtures/golden';

const set = (entities: string[], relations: [string, string, string][] = []): ScoredSet => ({
  entities: entities.map((name) => ({ name })),
  relations: relations.map(([source, target, type]) => ({ source, target, type })),
});

describe('scoreExtraction', () => {
  it('scores a perfect extraction as precision/recall/f1 = 1', () => {
    const gold = set(['Pump', 'Bearing'], [['Pump', 'Bearing', 'causes']]);
    const score = scoreExtraction(gold, gold);
    expect(score.entities.precision).toBe(1);
    expect(score.entities.recall).toBe(1);
    expect(score.entities.f1).toBe(1);
    expect(score.relations.f1).toBe(1);
  });

  it('penalizes recall when an expected entity is missed', () => {
    const gold = set(['Pump', 'Bearing', 'Seal']);
    const actual = set(['Pump', 'Bearing']);
    const score = scoreExtraction(gold, actual);
    expect(score.entities.recall).toBeCloseTo(2 / 3);
    expect(score.entities.precision).toBe(1); // nothing hallucinated
  });

  it('penalizes precision when an extra (hallucinated) entity appears', () => {
    const gold = set(['Pump', 'Bearing']);
    const actual = set(['Pump', 'Bearing', 'Ghost']);
    const score = scoreExtraction(gold, actual);
    expect(score.entities.precision).toBeCloseTo(2 / 3);
    expect(score.entities.recall).toBe(1);
  });

  it('matches entities case/spacing-insensitively', () => {
    const gold = set(['RF Matcher']);
    const actual = set(['rfmatcher']);
    expect(scoreExtraction(gold, actual).entities.f1).toBe(1);
  });

  it('treats relation direction as significant', () => {
    const gold = set(['A', 'B'], [['A', 'B', 'causes']]);
    const reversed = set(['A', 'B'], [['B', 'A', 'causes']]);
    expect(scoreExtraction(gold, reversed).relations.truePositives).toBe(0);
  });
});

describe('scoreExtraction layer (PRD-L M2)', () => {
  it('매칭된 관계의 layer 정확도 산출 + 혼동행렬', () => {
    const expected: ScoredSet = {
      entities: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      relations: [
        { source: 'A', target: 'B', type: 'causes', layer: 'semantic' },
        { source: 'B', target: 'C', type: 'inspected_by', layer: 'kinetic' },
      ],
    };
    const actual: ScoredSet = {
      entities: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      relations: [
        { source: 'A', target: 'B', type: 'causes', layer: 'semantic' }, // 일치
        { source: 'B', target: 'C', type: 'inspected_by', layer: 'semantic' }, // 오분류
      ],
    };
    const score = scoreExtraction(expected, actual);
    expect(score.layer.matched).toBe(2);
    expect(score.layer.correct).toBe(1);
    expect(score.layer.accuracy).toBeCloseTo(0.5);
    expect(score.layer.confusion.kinetic.semantic).toBe(1);
    expect(score.layer.confusion.semantic.semantic).toBe(1);
  });

  it('layer 라벨이 없으면 accuracy=null (회귀 안전, relation PRF 불변)', () => {
    const gold: ScoredSet = set(['A', 'B'], [['A', 'B', 'causes']]);
    const score = scoreExtraction(gold, gold);
    expect(score.layer.accuracy).toBeNull();
    expect(score.layer.matched).toBe(0);
    expect(score.relations.f1).toBe(1);
  });
});

describe('golden set measurement loop', () => {
  it('every golden case scores perfectly against itself (self-consistent fixture)', () => {
    for (const c of GOLDEN_CASES) {
      const score = scoreExtraction(c.expected, c.expected);
      expect(score.entities.f1).toBe(1);
      expect(score.relations.f1).toBe(1);
    }
  });

  it('produces a structural-health baseline for each golden case', () => {
    for (const c of GOLDEN_CASES) {
      // Treat expected entities as classes and relations as edges (by name) to
      // record the baseline 별모양 지수 / 고립률 the extraction should aim for.
      const model = {
        classes: c.expected.entities.map((e) => ({ id: e.name, name: e.name })),
        instances: [],
        edges: c.expected.relations.map((r) => ({ sourceId: r.source, targetId: r.target })),
      };
      const health = computeHealth(model);
      expect(health.score).toBeGreaterThanOrEqual(0);
      expect(health.score).toBeLessThanOrEqual(100);
      // The synthetic causal chain should not be a degenerate star.
      expect(health.starIndex).toBeLessThan(1);
    }
  });
});
