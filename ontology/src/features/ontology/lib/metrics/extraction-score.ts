// S6 — 추출 품질 측정. 골든셋(expected)과 실제 추출 결과(actual)를 대조해
// 엔티티/관계의 정밀도·재현율·F1을 계산한다. 순수·결정론 — 라이브 LLM 출력을
// 넣으면 그대로 숫자가 나오는 측정 루프의 코어.

import { normalizeName } from '../similarity';
import type { RelationCategory } from '../schemas';

const RELATION_CATEGORIES: RelationCategory[] = [
  'structural',
  'causal',
  'diagnostic',
  'procedural',
  'descriptive',
];

export interface ScoredEntity {
  name: string;
}

export interface ScoredRelation {
  source: string;
  target: string;
  type: string;
  // PRD-F P3-2: category 실측용. 없으면 category 채점에서 제외(회귀 안전).
  category?: RelationCategory;
}

export interface ScoredSet {
  entities: ScoredEntity[];
  relations: ScoredRelation[];
}

export interface PRF {
  precision: number;
  recall: number;
  f1: number;
  truePositives: number;
  expected: number;
  actual: number;
}

// 5×5 혼동행렬: confusion[expected][actual] = 건수. 어느 카테고리가 어디로
// 오분류되는지(예: diagnostic↔procedural) 가시화한다.
export type CategoryConfusion = Record<
  RelationCategory,
  Record<RelationCategory, number>
>;

export interface CategoryScore {
  // (source,target,type)로 매칭된 관계 중 category가 일치하는 비율.
  // 양쪽 모두 category 라벨이 있는 매칭이 하나도 없으면 null.
  accuracy: number | null;
  matched: number; // category 라벨이 양쪽에 있는 매칭 수
  correct: number; // 그중 category 일치 수
  confusion: CategoryConfusion;
}

export interface ExtractionScore {
  entities: PRF;
  relations: PRF;
  category: CategoryScore;
}

function emptyConfusion(): CategoryConfusion {
  const m = {} as CategoryConfusion;
  for (const e of RELATION_CATEGORIES) {
    m[e] = {} as Record<RelationCategory, number>;
    for (const a of RELATION_CATEGORIES) m[e][a] = 0;
  }
  return m;
}

function prf(truePositives: number, expected: number, actual: number): PRF {
  const precision = actual === 0 ? (expected === 0 ? 1 : 0) : truePositives / actual;
  const recall = expected === 0 ? 1 : truePositives / expected;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1, truePositives, expected, actual };
}

function entityKey(e: ScoredEntity): string {
  return normalizeName(e.name);
}

function relationKey(r: ScoredRelation): string {
  return `${normalizeName(r.source)}->${normalizeName(r.target)}::${normalizeName(r.type)}`;
}

// expected 대비 actual의 정밀도/재현율. 엔티티는 정규화 이름, 관계는
// (source, target, type) 정규화 키로 매칭한다(방향 민감).
export function scoreExtraction(expected: ScoredSet, actual: ScoredSet): ExtractionScore {
  const expectedEntityKeys = new Set(expected.entities.map(entityKey));
  const actualEntityKeys = new Set(actual.entities.map(entityKey));
  let entityTP = 0;
  for (const k of actualEntityKeys) if (expectedEntityKeys.has(k)) entityTP++;

  const expectedRelKeys = new Set(expected.relations.map(relationKey));
  const actualRelKeys = new Set(actual.relations.map(relationKey));
  let relTP = 0;
  for (const k of actualRelKeys) if (expectedRelKeys.has(k)) relTP++;

  // Category 채점: (source,target,type)로 매칭된 관계 중 category 일치율 + 혼동행렬.
  const expectedCatByKey = new Map<string, RelationCategory>();
  for (const r of expected.relations) {
    if (r.category) expectedCatByKey.set(relationKey(r), r.category);
  }
  const actualCatByKey = new Map<string, RelationCategory>();
  for (const r of actual.relations) {
    if (r.category) actualCatByKey.set(relationKey(r), r.category);
  }
  const confusion = emptyConfusion();
  let matched = 0;
  let correct = 0;
  for (const [key, expCat] of expectedCatByKey) {
    const actCat = actualCatByKey.get(key);
    if (!actCat) continue;
    matched += 1;
    confusion[expCat][actCat] += 1;
    if (expCat === actCat) correct += 1;
  }

  return {
    entities: prf(entityTP, expectedEntityKeys.size, actualEntityKeys.size),
    relations: prf(relTP, expectedRelKeys.size, actualRelKeys.size),
    category: {
      accuracy: matched === 0 ? null : correct / matched,
      matched,
      correct,
      confusion,
    },
  };
}
