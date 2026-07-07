// Shared enrichment types for the A-3 (gap detection) → A-4 (sourcing) → A-5 (HITL)
// pipeline. Kept framework-free so both API routes and UI can import them.

// PRD-L M1: 'missing_axiom' 은 내부 신호 라벨(엔티티 아님) — 의미는 "빠진 규칙
// (memo/enforced) 신호"다. wire 호환을 위해 문자열 값은 유지한다.
export type GapKind =
  | 'no_definition'
  | 'isolated'
  | 'missing_property'
  | 'missing_axiom'
  | 'undefined_concept'
  | 'low_confidence';

export type GapSeverity = 'high' | 'med' | 'low';

export interface Gap {
  // Name of the target node/relation the gap is about (names, not ids — the
  // preview works on freshly-extracted, not-yet-persisted nodes).
  targetName: string;
  kind: GapKind;
  reason: string;
  severity: GapSeverity;
}

export type EnrichSourceType =
  | 'existing_graph'
  | 'session_doc'
  | 'web'
  | 'inferred';

// A concrete enrichment proposal produced by A-4 sourcing for a given gap.
export interface EnrichProposal {
  kind: GapKind;
  // Human-readable proposed value (a definition, a rule expression, a numeric
  // value, a property suggestion, …).
  value: string;
  sourceType: EnrichSourceType;
  evidence: string;
  confidence: number;
  needsReview: boolean;
}

// What the UI renders/selects: a gap plus its (optional) sourced proposals.
export interface EnrichmentItem {
  id: string;
  gap: Gap;
  proposals: EnrichProposal[];
}

export const GAP_KIND_LABELS: Record<GapKind, string> = {
  no_definition: '정의 없음',
  isolated: '고립 노드',
  missing_property: '프로퍼티 누락',
  missing_axiom: '정량 규칙 누락',
  undefined_concept: '미정의 개념',
  low_confidence: '타입 확신 낮음',
};

export const SOURCE_TYPE_LABELS: Record<EnrichSourceType, string> = {
  existing_graph: '기존 그래프',
  session_doc: '세션 문서',
  web: '웹',
  inferred: '추론',
};

export const SEVERITY_LABELS: Record<GapSeverity, string> = {
  high: '높음',
  med: '중간',
  low: '낮음',
};
