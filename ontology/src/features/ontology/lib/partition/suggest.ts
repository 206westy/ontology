// PRD-N M1: AI 자동 구획 제안 — 결정론 판정 코어(순수 함수, LLM 불필요).
// 추출분(엔티티/관계)과 현재 구획의 기존 노드 이름 겹침률로 attach/new/bridge 를 가른다.
// 겹침 매칭은 정규화 Levenshtein(프리뷰 시점엔 임베딩이 없어 문자열 신호만 가용) →
// combinedMatchScore(null, s) 로 dedup 인프라와 동일 임계 체계를 공유한다.
// 억지 계층/무분별 연결 금지: 겹침이 낮으면 정직하게 "새 구획"으로, 일부만 겹치면 bridge.

import { analyzeConnectivity, type ConnectivityReport } from '../validate/connectivity';
import {
  buildBridgeSuggestions,
  DEFAULT_BRIDGE_RELATION,
  type BridgeSuggestion,
  type CrossPartitionCandidate,
} from '../bridge/cross-partition';
import { levenshtein, normalizeName } from '../similarity';
import { MATCH_CANDIDATE_THRESHOLD } from '@/lib/entity-match/score';

export type PartitionDecision = 'attach' | 'new' | 'bridge';

export interface ExtractedNodeLite {
  name: string;
  nodeKind?: 'class' | 'instance';
}

export interface ExtractedRelationLite {
  source: string;
  target: string;
}

export interface CurrentPartitionNode {
  id: string;
  name: string;
  kind: 'class' | 'instance';
}

export interface DecidePartitionOptions {
  currentPartitionId?: string | null;
  // 이름 겹침으로 볼 최소 유사도(0..1). 기본은 dedup 공통 임계.
  matchThreshold?: number;
  // 겹침률이 이 이상이면 attach(무소음). 기본 0.6.
  attachMinOverlap?: number;
  // 겹침률이 이 이하이면 new(완전 이질). 기본 0.15.
  newMaxOverlap?: number;
}

export interface MatchedConcept {
  extractedName: string;
  existingId: string;
  existingName: string;
  kind: 'class' | 'instance';
  score: number;
}

export interface PartitionScopeDecision {
  decision: PartitionDecision;
  // 매칭된 고유 추출 개념 수 / 전체 고유 추출 개념 수.
  overlapRatio: number;
  matched: MatchedConcept[];
  // 어떤 기존 노드와도 매칭 안 된 추출 이름(= 새 구획 귀속 후보).
  unmatchedNames: string[];
  connectivity: ConnectivityReport;
  // decision === 'bridge' 일 때만 채워진다. sourceId 는 확정 시 실제 id 로 치환할 pending 마커.
  bridgeCandidates: BridgeSuggestion[];
}

export const DEFAULT_MATCH_THRESHOLD = MATCH_CANDIDATE_THRESHOLD;
export const ATTACH_MIN_OVERLAP = 0.6;
export const NEW_MAX_OVERLAP = 0.15;
// 브릿지 후보의 소스(신규 구획 측)는 아직 미영속 → 확정 시 stableEntityId 로 교체할 placeholder.
export const NEW_PARTITION_PLACEHOLDER = '__new__';
export const PENDING_SOURCE_PREFIX = 'pending:';

// 정규화 후 완전일치=1, 아니면 1 - levenshtein/maxLen. similarity.ts 재사용.
function nameMatchScore(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 0;
  return 1 - levenshtein(na, nb) / maxLen;
}

export function decidePartitionScope(
  entities: ExtractedNodeLite[],
  relations: ExtractedRelationLite[],
  currentPartitionNodes: CurrentPartitionNode[],
  options: DecidePartitionOptions = {},
): PartitionScopeDecision {
  const matchThreshold = options.matchThreshold ?? DEFAULT_MATCH_THRESHOLD;
  const attachMin = options.attachMinOverlap ?? ATTACH_MIN_OVERLAP;
  const newMax = options.newMaxOverlap ?? NEW_MAX_OVERLAP;
  const currentPartitionId = options.currentPartitionId ?? '';

  // 고유 추출 개념(정규화 이름 기준 중복 제거).
  const seen = new Set<string>();
  const uniqueEntities: ExtractedNodeLite[] = [];
  for (const e of entities) {
    const key = normalizeName(e.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueEntities.push(e);
  }

  // 추출 서브그래프의 내부 섬 구조(정직한 섬 보고 — 억지 병합 금지).
  const connectivity = analyzeConnectivity(
    uniqueEntities.map((e) => ({ id: normalizeName(e.name) })),
    relations.map((r) => ({
      sourceId: normalizeName(r.source),
      targetId: normalizeName(r.target),
    })),
  );

  // 각 추출 개념을 현재 구획 노드와 최고점 매칭.
  const matched: MatchedConcept[] = [];
  const unmatchedNames: string[] = [];
  for (const e of uniqueEntities) {
    let best: { node: CurrentPartitionNode; score: number } | null = null;
    for (const node of currentPartitionNodes) {
      const s = nameMatchScore(e.name, node.name);
      if (s >= matchThreshold && (best === null || s > best.score)) {
        best = { node, score: s };
      }
    }
    if (best !== null) {
      matched.push({
        extractedName: e.name,
        existingId: best.node.id,
        existingName: best.node.name,
        kind: e.nodeKind ?? best.node.kind,
        score: best.score,
      });
    } else {
      unmatchedNames.push(e.name);
    }
  }

  const total = uniqueEntities.length;
  const overlapRatio = total === 0 ? 0 : matched.length / total;

  let decision: PartitionDecision;
  if (total === 0 || currentPartitionNodes.length === 0) {
    // 분리할 대상이 없다(빈 입력 또는 빈 구획) → 무소음 attach.
    decision = 'attach';
  } else if (overlapRatio >= attachMin) {
    decision = 'attach';
  } else if (overlapRatio <= newMax) {
    decision = 'new';
  } else {
    decision = 'bridge';
  }

  // bridge 일 때만 크로스 후보를 기존 인프라(buildBridgeSuggestions)로 정규화.
  let bridgeCandidates: BridgeSuggestion[] = [];
  if (decision === 'bridge' && matched.length > 0) {
    const candidates: CrossPartitionCandidate[] = matched.map((m) => ({
      sourceId: `${PENDING_SOURCE_PREFIX}${normalizeName(m.extractedName)}`,
      targetId: m.existingId,
      sourceName: m.extractedName,
      targetName: m.existingName,
      sourcePartition: NEW_PARTITION_PLACEHOLDER,
      targetPartition: currentPartitionId,
      kind: m.kind,
      vectorScore: null,
      trigramScore: m.score,
      relationType: DEFAULT_BRIDGE_RELATION,
    }));
    bridgeCandidates = buildBridgeSuggestions(candidates, { threshold: matchThreshold });
  }

  return {
    decision,
    overlapRatio,
    matched,
    unmatchedNames,
    connectivity,
    bridgeCandidates,
  };
}

export interface StoreClassLite {
  id: string;
  name: string;
  partitionId: string;
}
export interface StoreInstanceLite {
  id: string;
  name: string;
  classId: string;
}

// 현재 구획에 속한 노드(클래스 + 그 클래스의 인스턴스)를 이름·id·종류로 모은다.
// 인스턴스는 자체 partition_id 가 없으므로 소속 클래스의 구획으로 판정한다(도메인 규칙).
export function collectPartitionNodes(
  classes: StoreClassLite[],
  instances: StoreInstanceLite[],
  partitionId: string,
): CurrentPartitionNode[] {
  const partitionClassIds = new Set(
    classes.filter((c) => c.partitionId === partitionId).map((c) => c.id),
  );
  return [
    ...classes
      .filter((c) => partitionClassIds.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, kind: 'class' as const })),
    ...instances
      .filter((i) => partitionClassIds.has(i.classId))
      .map((i) => ({ id: i.id, name: i.name, kind: 'instance' as const })),
  ];
}
