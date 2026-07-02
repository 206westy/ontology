import { detectTermsNeedingResolution, type DetectableEntity } from '../terms/detect';
import type { BridgeSuggestion } from '../bridge/cross-partition';
import type { GovernanceProposal } from '../schemas';
import type { EnrichmentItem } from '../enrich-types';
import type { CriticIssue } from '../critic/review';

// PRD-H (H8/M5) · PRD-I (M3, Task 3.1): HITL 오케스트레이션(PURE). 패턴-시드 생성 결과 +
// 패턴 맥락 + 크로스-구획 후보 + (선택) 중복/거버넌스/보강/Critic 입력을 보고, 확정 전에
// 사용자에게 띄워야 할 컨펌 카드 목록을 결정한다.
//  - terms:          미정의·모호 용어 → TermConfirmCard (H8-e)
//  - dedup:          기존과 중복 대조 결정 → ConfirmCard (PRD-E P2-5)
//  - driftConcepts:  패턴 역할 밖 개념 → DriftDecisionCard (H8-d)
//  - driftRelations: 패턴 관계 밖 관계 → DriftDecisionCard (H8-d)
//  - governance:     제약/공리 제안 → GovernanceProposalCard (PRD-E P2-7)
//  - enrichment:     정성 갭 보강 제안 → EnrichmentCard (A-5)
//  - critic:         결정론 검수 자문 → ConfirmCard (S4, 읽기전용)
//  - bridges:        같은 대상이 두 구획에 등장 → BridgeSuggestCard (H8-f)
// 자동 확정 없음 — 무엇을 "띄울지"만 결정한다(반영은 컨펌 시에만).

export interface HitlRelation {
  name: string;
}

export interface HitlPatternContext {
  roleNames: string[];
  relationNames: string[];
}

// PRD-E P2-5 중복 대조 결정. 팝오버의 DedupResolveResponse 를 이름과 함께 평탄화한 것.
export interface HitlDedupItem {
  name: string;
  decision: 'reuse' | 'relate' | 'possible_duplicate' | 'new';
  targetName?: string | null;
  relationType?: string | null;
  confidence?: number | null;
  evidence?: string | null;
}

export interface HitlPlan {
  terms: string[];
  dedup: HitlDedupItem[];
  driftConcepts: string[];
  driftRelations: string[];
  governance: GovernanceProposal[];
  enrichment: EnrichmentItem[];
  critic: CriticIssue[];
  bridges: BridgeSuggestion[];
  // 하나라도 컨펌이 필요한가.
  hasWork: boolean;
}

export interface HitlInput {
  entities: DetectableEntity[];
  relations: HitlRelation[];
  pattern: HitlPatternContext;
  // 아래는 모두 선택 — 주어질 때만 해당 스텝을 계획한다(기존 호출자 무영향).
  // 중복 대조 결정(decision==='new' 은 결정할 게 없어 스텝에서 제외).
  dedup?: HitlDedupItem[];
  // 거버넌스 제안(전부 HITL 제안 — 그대로 실어 나른다).
  governance?: GovernanceProposal[];
  // 정성 보강 제안(고립 노드는 섬 영역에서 따로 다루므로 여기서는 제외).
  enrichment?: EnrichmentItem[];
  // Critic 자문(읽기전용 — 확정을 막지 않지만 검수 대상으로 띄운다).
  critic?: CriticIssue[];
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

  // 'new' 는 기존과 겹치지 않는 순수 신규라 결정할 게 없다 — 스텝에서 제외.
  const dedup = (input.dedup ?? []).filter((d) => d.decision !== 'new');
  const governance = input.governance ?? [];
  // 고립 노드(isolated)는 섬 영역 담당 — 보강 스텝에서는 제외해 노이즈를 줄인다.
  const enrichment = (input.enrichment ?? []).filter((e) => e.gap.kind !== 'isolated');
  const critic = input.critic ?? [];

  const hasWork =
    terms.length > 0 ||
    dedup.length > 0 ||
    driftConcepts.length > 0 ||
    driftRelations.length > 0 ||
    governance.length > 0 ||
    enrichment.length > 0 ||
    critic.length > 0 ||
    bridges.length > 0;

  return {
    terms,
    dedup,
    driftConcepts,
    driftRelations,
    governance,
    enrichment,
    critic,
    bridges,
    hasWork,
  };
}
