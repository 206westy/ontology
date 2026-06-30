// S6 — 추출 품질 측정. 골든셋(expected)과 실제 추출 결과(actual)를 대조해
// 엔티티/관계의 정밀도·재현율·F1을 계산한다. 순수·결정론 — 라이브 LLM 출력을
// 넣으면 그대로 숫자가 나오는 측정 루프의 코어.

import { normalizeName } from '../similarity';

export interface ScoredEntity {
  name: string;
}

export interface ScoredRelation {
  source: string;
  target: string;
  type: string;
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

export interface ExtractionScore {
  entities: PRF;
  relations: PRF;
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

  return {
    entities: prf(entityTP, expectedEntityKeys.size, actualEntityKeys.size),
    relations: prf(relTP, expectedRelKeys.size, actualRelKeys.size),
  };
}
