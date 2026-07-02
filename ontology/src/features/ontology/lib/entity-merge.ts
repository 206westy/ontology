// PRD-F P2-2: 청크 간 전역 entity 병합. 청크별 Stage1 결과를 하나로 합친다.
// 1차: 정규화 이름 + nodeKind 일치 → 자동 병합(같은 개념). 2차: 임베딩 근접만인
// 쌍은 후보로만 제안하고 자동 병합하지 않는다(v5 원칙: 동의어 의심은 ER 큐로).
import type { ParsedEntity } from './schemas';
import { normalizeName } from './similarity';

// parse 시점 entity 동일성 키. 구획은 apply 시점에 부여되므로 여기선 kind+이름만.
export function entityKey(e: Pick<ParsedEntity, 'name' | 'nodeKind'>): string {
  return `${e.nodeKind}|${normalizeName(e.name)}`;
}

function richer(a: ParsedEntity, b: ParsedEntity): ParsedEntity {
  // 더 풍부한 정보를 남긴다: description 있는 쪽 우선, 없으면 긴 쪽. parentType/
  // type 은 non-empty 우선. properties 는 이름 기준 합집합.
  const desc =
    (a.description?.trim().length ?? 0) >= (b.description?.trim().length ?? 0)
      ? a.description
      : b.description;
  const type = a.type?.trim() ? a.type : b.type;
  const parentType = a.parentType ?? b.parentType;
  const evidence = a.evidence?.trim() ? a.evidence : b.evidence;

  const propByName = new Map<string, ParsedEntity['properties'][number]>();
  for (const p of [...a.properties, ...b.properties]) {
    if (!propByName.has(p.name)) propByName.set(p.name, p);
  }

  return {
    name: a.name,
    type,
    nodeKind: a.nodeKind,
    parentType,
    evidence,
    description: desc,
    properties: [...propByName.values()],
  };
}

export function mergeEntitiesAcrossChunks(entities: ParsedEntity[]): {
  merged: ParsedEntity[];
  mergedCount: number;
} {
  const byKey = new Map<string, ParsedEntity>();
  let mergedCount = 0;
  for (const e of entities) {
    const key = entityKey(e);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, e);
    } else {
      byKey.set(key, richer(existing, e));
      mergedCount += 1;
    }
  }
  return { merged: [...byKey.values()], mergedCount };
}

// 코사인 유사도(임베딩 2차 병합 후보 탐지용). 길이 불일치/0벡터는 0.
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface MergeCandidate {
  a: string; // entity name
  b: string;
  score: number;
}

// 이미 1차 병합된 entity 들 중 임베딩만 근접한 쌍(서로 다른 키)을 후보로 반환.
// 자동 병합하지 않는다 — UI/ER 큐에서 사람이 판단(과병합 방지).
export function findEmbeddingMergeCandidates(
  entities: ParsedEntity[],
  embeddings: number[][],
  threshold = 0.92,
): MergeCandidate[] {
  const out: MergeCandidate[] = [];
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      if (entityKey(entities[i]) === entityKey(entities[j])) continue;
      const score = cosineSimilarity(embeddings[i] ?? [], embeddings[j] ?? []);
      if (score >= threshold) {
        out.push({ a: entities[i].name, b: entities[j].name, score });
      }
    }
  }
  return out.sort((x, y) => y.score - x.score);
}
