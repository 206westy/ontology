// PRD-L M5: 확정 신뢰도 트리아지 — "고신뢰는 기본 수락(접힌 요약), 저신뢰만 표면화".
//
// 파싱 미리보기의 항목(엔티티/관계)을 Critic 이슈·확신도·연결 상태로 판정해
// 'auto'(고신뢰) 또는 'review'(저신뢰)로 나눈다. 순수 함수 — LLM/네트워크 없음.
// 트리아지는 "표면화/정렬/접기"일 뿐 자동 제외가 아니다: review 항목도 기본 반영 대상.

import type { CriticIssue, CriticSeverity } from './critic/review';
import type { ParsedExtraction } from './parse-mapping';

// PRD-L M5: 이 확신도 미만이면 저신뢰로 표면화(0.7은 고신뢰 — 경계 포함).
export const TRIAGE_CONFIDENCE_MIN = 0.7;

export type TriageVerdict = 'auto' | 'review';
export type TriageReasonCode = 'low_confidence' | 'critic' | 'unresolved';

export interface TriageSignals {
  // 존재 확신(0..1). 없으면(엔티티 등) 이 신호는 판정에 쓰이지 않는다.
  confidence?: number | null;
  // 이 항목에 연결된 Critic 이슈 심각도들.
  criticSeverities?: readonly CriticSeverity[];
  // 관계의 양끝 중 하나라도 미해소(임시 노드 등)인가.
  hasUnresolvedEndpoint?: boolean;
}

export interface TriageOutcome {
  verdict: TriageVerdict;
  reasons: TriageReasonCode[];
}

// 순수 판정: 저신뢰 신호가 하나라도 있으면 'review', 아니면 'auto'.
export function triageItem(signals: TriageSignals): TriageOutcome {
  const { confidence, criticSeverities, hasUnresolvedEndpoint } = signals;
  const reasons: TriageReasonCode[] = [];

  if (typeof confidence === 'number' && confidence < TRIAGE_CONFIDENCE_MIN) {
    reasons.push('low_confidence');
  }
  if (criticSeverities?.some((s) => s === 'high' || s === 'med')) {
    reasons.push('critic');
  }
  if (hasUnresolvedEndpoint) {
    reasons.push('unresolved');
  }

  return { verdict: reasons.length > 0 ? 'review' : 'auto', reasons };
}

// PRD-K M3: 프리뷰 선택(체크박스) 키 — 파싱 항목의 안정 식별자(인덱스는 삭제 시 흔들림).
// 트리아지 맵과 컴포넌트의 excludedKeys 가 같은 키 공간을 공유하도록 여기서 단일 정의.
export const classSelKey = (name: string) => `class::${name}`;
export const propSelKey = (className: string, name: string) => `prop::${className}::${name}`;
export const instSelKey = (name: string) => `inst::${name}`;
export const relSelKey = (rel: { sourceName: string; relationName: string; targetName: string }) =>
  `rel::${rel.sourceName}|${rel.relationName}|${rel.targetName}`;

// Critic 이슈를 대상 이름 → 심각도 목록으로 색인. targetName 과 relatedName 둘 다
// 제안 항목일 수 있어(중복쌍 등) 양쪽을 색인해 표면화 누락을 막는다.
export function criticSeverityByName(issues: CriticIssue[]): Map<string, CriticSeverity[]> {
  const map = new Map<string, CriticSeverity[]>();
  const add = (name: string | undefined, sev: CriticSeverity) => {
    if (!name) return;
    const arr = map.get(name) ?? [];
    arr.push(sev);
    map.set(name, arr);
  };
  for (const i of issues) {
    add(i.targetName, i.severity);
    add(i.relatedName, i.severity);
  }
  return map;
}

export interface TriageMaps {
  // 선택 키(selKey) → 판정. 신규 클래스/속성/인스턴스/관계 전부 포함.
  byKey: Map<string, TriageOutcome>;
  autoCount: number;
  reviewCount: number;
}

// 파싱 결과 + Critic 이슈로 항목별 트리아지 맵과 요약 카운트를 만든다.
export function buildTriage(
  parsed: ParsedExtraction,
  existingClassNames: Set<string>,
  existingInstanceNames: Set<string>,
  criticIssues: CriticIssue[],
): TriageMaps {
  const criticByName = criticSeverityByName(criticIssues);
  // 관계 끝점이 추출되지 않아 임시 노드로 채워진 이름 집합(미해소 신호).
  const placeholderEndpoints = new Set<string>(
    parsed.warnings
      .filter((w) => w.kind === 'placeholder_endpoint' && w.name)
      .map((w) => w.name as string),
  );

  const byKey = new Map<string, TriageOutcome>();
  let autoCount = 0;
  let reviewCount = 0;
  const record = (key: string, outcome: TriageOutcome) => {
    byKey.set(key, outcome);
    if (outcome.verdict === 'review') reviewCount += 1;
    else autoCount += 1;
  };

  for (const c of parsed.classes) {
    if (existingClassNames.has(c.name)) continue; // 기존 노드는 초안이 아님
    record(classSelKey(c.name), triageItem({ criticSeverities: criticByName.get(c.name) }));
  }
  for (const p of parsed.properties) {
    record(
      propSelKey(p.className, p.name),
      triageItem({ criticSeverities: criticByName.get(p.name) }),
    );
  }
  for (const i of parsed.instances) {
    if (existingInstanceNames.has(i.name)) continue;
    record(instSelKey(i.name), triageItem({ criticSeverities: criticByName.get(i.name) }));
  }
  for (const r of parsed.relations) {
    const relCritic = [
      ...(criticByName.get(r.sourceName) ?? []),
      ...(criticByName.get(r.targetName) ?? []),
    ];
    record(
      relSelKey(r),
      triageItem({
        confidence: r.confidence,
        criticSeverities: relCritic,
        hasUnresolvedEndpoint:
          placeholderEndpoints.has(r.sourceName) || placeholderEndpoints.has(r.targetName),
      }),
    );
  }

  return { byKey, autoCount, reviewCount };
}
