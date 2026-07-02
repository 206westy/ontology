import type { PatternTraversalTemplate } from '../patterns/types';

// PRD-H (H7/M5): CQ(Competency Question) 통과율 — 순수/DI.
// 패턴의 competencyQuestions + traversalTemplates 와 현재 그래프를 대조해,
// 각 CQ 에 답할 경로(traversal)가 그래프에 실제로 존재하는지 판정하고 N/M 통과율을 낸다.
// 경로 존재 판정기는 주입(DI)해 네트워크·DB 없이 단위 테스트한다.

export interface CqEvaluation {
  cq: string;
  // 이 CQ 를 답하는 traversal 경로(템플릿). 없으면 null(답 경로 미정의 → 실패).
  path: string | null;
  passed: boolean;
}

export interface CqPassRate {
  passed: number;
  total: number;
  // 0..1. 총 CQ 가 0이면 1(vacuous).
  passRate: number;
  // 검수 표시용 라벨(예 "4/4").
  label: string;
  results: CqEvaluation[];
}

// DI: 주어진 traversal 경로가 현재 그래프에서 답 가능한지.
export type PathChecker = (path: string) => boolean;

// CQ 목록 + traversal 템플릿을 합쳐(둘 다 소스) 각 CQ 의 답 경로 유무를 판정한다.
export function evaluateCompetencyQuestions(
  competencyQuestions: string[],
  traversalTemplates: PatternTraversalTemplate[],
  pathExists: PathChecker,
): CqPassRate {
  const pathByCq = new Map<string, string>();
  for (const t of traversalTemplates) {
    if (!pathByCq.has(t.cq)) pathByCq.set(t.cq, t.path);
  }

  // 질문 집합 = CQ 목록 ∪ 템플릿 CQ (CQ 목록 우선, 중복 제거).
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const cq of [...competencyQuestions, ...traversalTemplates.map((t) => t.cq)]) {
    if (seen.has(cq)) continue;
    seen.add(cq);
    ordered.push(cq);
  }

  const results: CqEvaluation[] = ordered.map((cq) => {
    const path = pathByCq.get(cq) ?? null;
    const passed = path != null && pathExists(path);
    return { cq, path, passed };
  });

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  return {
    passed,
    total,
    passRate: total === 0 ? 1 : passed / total,
    label: `${passed}/${total}`,
    results,
  };
}

// ─── 그래프 경로 존재 판정기(구체) ─────────────────────────────────────────
// traversal 경로(예 `(:Symptom)-[:indicates]->(:FailureMode)-[:caused_by]->(:Cause)`)의
// 관계타입 시퀀스를 뽑아, 그래프에 그 시퀀스를 머리-꼬리로 잇는 실제 엣지 체인이
// 있는지 검사한다. 관계타입 이름(패턴 관계타입)에 키잉된 판정 — 순수.

export interface CqGraphEdge {
  sourceId: string;
  targetId: string;
  relationName: string;
}

// 경로 문자열에서 관계타입 토큰을 순서대로 추출. `-[:rel]->` / `[rel]` 모두 허용.
export function parsePathRelations(path: string): string[] {
  const out: string[] = [];
  const re = /\[\s*:?\s*([A-Za-z0-9_]+)\s*(?:\|[^\]]*)?\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) out.push(m[1]);
  return out;
}

// 관계타입 시퀀스가 그래프에 머리-꼬리로 연결된 체인으로 존재하는지.
function chainExists(edges: CqGraphEdge[], hops: string[]): boolean {
  if (hops.length === 0) return false;
  // frontier: 첫 k 홉을 매칭한 뒤 도달한 노드 집합. null=시작(아무 노드).
  let frontier: Set<string> | null = null;
  for (const rel of hops) {
    const next = new Set<string>();
    for (const e of edges) {
      if (e.relationName !== rel) continue;
      if (frontier === null || frontier.has(e.sourceId)) next.add(e.targetId);
    }
    if (next.size === 0) return false;
    frontier = next;
  }
  return true;
}

// 현재 그래프 엣지로 경로 존재 판정기를 만든다(CQ 평가에 주입).
export function buildGraphPathChecker(edges: CqGraphEdge[]): PathChecker {
  return (path: string) => chainExists(edges, parsePathRelations(path));
}
