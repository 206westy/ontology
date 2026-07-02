import { z } from 'zod';
import {
  combinedMatchScore,
  MATCH_CANDIDATE_THRESHOLD,
} from '@/lib/entity-match/score';

// PRD-H (H6/M4): 크로스-구획 브릿지. 서로 다른 구획에 나타난 동일 대상(예 `펌프447`)을
// 크로스-구획 동일성(dedup 하이브리드 점수 재사용)으로 찾아 브릿지 후보로 제시한다.
// 순수: 같은-구획 쌍 제외 + 임계값 미만 제외 + 대칭쌍 중복 제거. 무분별 연결(hairball) 방지.
// 브릿지는 타입·근거를 갖는다. 확정은 컨펌 시에만.

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// 구획 간 동일성 후보(dedup 인프라가 채우는 원시 쌍).
export interface CrossPartitionCandidate {
  sourceId: string;
  targetId: string;
  sourceName: string;
  targetName: string;
  sourcePartition: string;
  targetPartition: string;
  kind: 'class' | 'instance';
  vectorScore: number | null;
  trigramScore: number | null;
  // 선택: 소스가 이미 타입/근거를 제안하면 사용, 아니면 기본값 생성.
  relationType?: string | null;
  evidence?: string | null;
}

export interface BridgeSuggestion {
  sourceId: string;
  targetId: string;
  sourceName: string;
  targetName: string;
  sourcePartition: string;
  targetPartition: string;
  kind: 'class' | 'instance';
  score: number;
  relationType: string;
  evidence: string;
}

// 기본 브릿지 타입: 동일 대상(same-as). 무의미 연결 방지를 위해 타입을 항상 부여.
export const DEFAULT_BRIDGE_RELATION = 'same_as';

export interface BridgeOptions {
  threshold?: number;
  relationType?: string;
}

function defaultEvidence(c: CrossPartitionCandidate, score: number): string {
  const pct = Math.round(score * 100);
  return `"${c.sourceName}"와(과) "${c.targetName}"가 서로 다른 구획에 ${pct}% 유사도로 등장 — 동일 대상 추정`;
}

// 크로스-구획 후보 → 브릿지 제안. 같은-구획·임계값 미만 제외, 대칭쌍은 최고점만 유지.
export function buildBridgeSuggestions(
  candidates: CrossPartitionCandidate[],
  options: BridgeOptions = {},
): BridgeSuggestion[] {
  const threshold = options.threshold ?? MATCH_CANDIDATE_THRESHOLD;
  const byPair = new Map<string, BridgeSuggestion>();

  for (const c of candidates) {
    // 같은 구획 쌍은 브릿지가 아니다(구획 격리 원칙).
    if (c.sourcePartition === c.targetPartition) continue;

    const score = combinedMatchScore(c.vectorScore, c.trigramScore);
    if (score < threshold) continue;

    // 대칭쌍(A-B == B-A) 중복 제거: 정렬한 id 쌍을 키로.
    const key = [c.sourceId, c.targetId].sort().join('|');
    const existing = byPair.get(key);
    if (existing && existing.score >= score) continue;

    byPair.set(key, {
      sourceId: c.sourceId,
      targetId: c.targetId,
      sourceName: c.sourceName,
      targetName: c.targetName,
      sourcePartition: c.sourcePartition,
      targetPartition: c.targetPartition,
      kind: c.kind,
      score,
      relationType: c.relationType ?? options.relationType ?? DEFAULT_BRIDGE_RELATION,
      evidence: c.evidence ?? defaultEvidence(c, score),
    });
  }

  return [...byPair.values()].sort((a, b) => b.score - a.score);
}

// ─── POST /api/bridges 요청 schema (브릿지 엣지 생성) ────────────────────
// 타입(relationTypeId) + 근거(evidence)를 반드시 갖는 브릿지 엣지(is_bridge=true).
export const createBridgeSchema = z.object({
  sourceId: z.string().regex(UUID_RE),
  targetId: z.string().regex(UUID_RE),
  sourceKind: z.enum(['class', 'instance']),
  targetKind: z.enum(['class', 'instance']),
  relationTypeId: z.string().regex(UUID_RE),
  evidence: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

export type CreateBridgeInput = z.infer<typeof createBridgeSchema>;
