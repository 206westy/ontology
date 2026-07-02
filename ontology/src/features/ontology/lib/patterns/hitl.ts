import { detectTermsNeedingResolution, type DetectableEntity } from '../terms/detect';
import type { BridgeSuggestion } from '../bridge/cross-partition';

// PRD-H (H8/M5): HITL 오케스트레이션(PURE). 패턴-시드 생성 결과 + 패턴 맥락 +
// 크로스-구획 후보를 보고, 확정 전에 사용자에게 띄워야 할 컨펌 카드 목록을 결정한다.
//  - terms:          미정의·모호 용어 → TermConfirmCard (H8-e)
//  - driftConcepts:  패턴 역할 밖 개념 → DriftDecisionCard (H8-d)
//  - driftRelations: 패턴 관계 밖 관계 → DriftDecisionCard (H8-d)
//  - bridges:        같은 대상이 두 구획에 등장 → BridgeSuggestCard (H8-f)
// 자동 확정 없음 — 무엇을 "띄울지"만 결정한다(반영은 컨펌 시에만).

export interface HitlRelation {
  name: string;
}

export interface HitlPatternContext {
  roleNames: string[];
  relationNames: string[];
}

export interface HitlPlan {
  terms: string[];
  driftConcepts: string[];
  driftRelations: string[];
  bridges: BridgeSuggestion[];
  // 하나라도 컨펌이 필요한가.
  hasWork: boolean;
}

export interface HitlInput {
  entities: DetectableEntity[];
  relations: HitlRelation[];
  pattern: HitlPatternContext;
  // 크로스-구획 동일성 후보(DB-backed 모듈이 채운다). 없으면 브릿지 없음.
  bridges?: BridgeSuggestion[];
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

// 패턴 역할 밖 개념(중복 제거, 원문 유지). type 이 역할이 아니면 드리프트 후보.
function outsideRoleConcepts(
  entities: DetectableEntity[],
  roleNames: string[],
): string[] {
  const roles = new Set(roleNames.map(normalize));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of entities) {
    const type = e.type?.trim();
    if (!type) continue; // 무타입은 역할 가드가 따로 처리.
    if (roles.has(normalize(type))) continue;
    const key = normalize(type);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(type);
  }
  return out;
}

// 패턴 관계 밖 관계타입(중복 제거, 원문 유지).
function outsideRelations(
  relations: HitlRelation[],
  relationNames: string[],
): string[] {
  const known = new Set(relationNames.map(normalize));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of relations) {
    const name = r.name?.trim();
    if (!name) continue;
    if (known.has(normalize(name))) continue;
    const key = normalize(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export function buildHitlPlan(input: HitlInput): HitlPlan {
  const terms = detectTermsNeedingResolution(input.entities);
  const driftConcepts = outsideRoleConcepts(input.entities, input.pattern.roleNames);
  const driftRelations = outsideRelations(input.relations, input.pattern.relationNames);
  const bridges = input.bridges ?? [];

  const hasWork =
    terms.length > 0 ||
    driftConcepts.length > 0 ||
    driftRelations.length > 0 ||
    bridges.length > 0;

  return { terms, driftConcepts, driftRelations, bridges, hasWork };
}
