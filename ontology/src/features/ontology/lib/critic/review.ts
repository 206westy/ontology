// S2 — Critic 검수 엔진 (결정론 코어).
//
// AI의 역할 전환(그림쟁이 → 모델 수호자)의 핵심. 새 추출분(proposed)을 "현재
// 모델(existing)"과 대조해, 확정 전에 잡아야 할 문제를 리포트로 만든다.
// 전부 순수 함수이고 LLM 불필요 — 빠르고 결정론적. 정성 판단(모순 관계 등)은
// API 라우트의 LLM 패스가 보강한다.
//
// 재사용 자산: similarity(normalizeName/levenshtein/findSimilarPairs), metrics(starIndex).

import { normalizeName, levenshtein, findSimilarPairs, type NamedEntity } from '../similarity';
import { starIndex } from '../metrics/health';

export type CriticIssueKind =
  | 'duplicate_existing' // 기존 모델 노드와 동일/유사 → 재사용해야
  | 'duplicate_within' // 새 추출분 안에서 서로 중복
  | 'star_hub' // 한 노드가 관계를 과도하게 흡수(별모양)
  | 'orphan' // 관계 0개 고립 노드
  | 'undefined_concept' // 관계 대상으로 참조되나 정의 없음
  | 'class_instance_confusion' // 클래스/인스턴스 종류 혼동(이름 충돌)
  | 'contradictory_relation' // 모순되는 관계 (LLM 정성)
  | 'weak_modeling'; // 정량 근거 없는 정성 서술 등 (LLM 정성)

export type CriticSeverity = 'high' | 'med' | 'low';

export interface CriticIssue {
  kind: CriticIssueKind;
  severity: CriticSeverity;
  // 문제의 1차 대상 이름.
  targetName: string;
  // 관련 노드(예: 중복 대상 기존 노드).
  relatedName?: string;
  reason: string;
  suggestion?: string;
  // S3 규칙 레지스트리 연결용 id.
  ruleId: string;
}

export interface CriticSummary {
  high: number;
  med: number;
  low: number;
  total: number;
}

export interface CriticReport {
  issues: CriticIssue[];
  summary: CriticSummary;
}

export interface CriticNode {
  name: string;
  // 부모/카테고리(클래스의 type) — 있으면 계층으로 연결된 것으로 본다.
  type?: string | null;
  description?: string;
  evidence?: string;
}

export interface CriticInstance {
  name: string;
  className?: string | null;
}

export interface CriticRelation {
  source: string;
  target: string;
  type: string;
}

export interface CriticProposal {
  classes: CriticNode[];
  instances: CriticInstance[];
  relations: CriticRelation[];
}

export interface CriticExisting {
  classNames: string[];
  instanceNames: string[];
}

export interface ReviewInput {
  proposed: CriticProposal;
  existing?: CriticExisting;
}

// 두 이름의 근접도(0..1). 정규화 후 동일=1, 아니면 levenshtein 기반.
function nameScore(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na.length === 0 || nb.length === 0) return 0;
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  return 1 - levenshtein(na, nb) / maxLen;
}

// proposed 이름이 기존 이름들과 얼마나 가까운지 — 최고 후보 반환.
function closestExisting(name: string, candidates: string[]): { name: string; score: number } | null {
  let best: { name: string; score: number } | null = null;
  for (const c of candidates) {
    const score = nameScore(name, c);
    if (!best || score > best.score) best = { name: c, score };
  }
  return best;
}

const DUP_EXACT = 1;
const DUP_NEAR = 0.8; // 오타 수준의 근접 (findSimilarPairs 기본 minScore와 정렬)
const STAR_MIN_RELATIONS = 4;
const STAR_THRESHOLD = 0.6; // 체인(0.5)은 정상 — 한 노드가 과반 흡수할 때만 별모양

// ── 개별 검수기 (각각 순수) ────────────────────────────────────

// 새 노드가 기존 모델 노드와 동일/유사 → 신규 생성 대신 재사용.
export function checkDuplicateExisting(input: ReviewInput): CriticIssue[] {
  const existing = input.existing;
  if (!existing) return [];
  const issues: CriticIssue[] = [];

  const scan = (names: string[], candidates: string[], kindLabel: string) => {
    for (const name of names) {
      const best = closestExisting(name, candidates);
      if (!best) continue;
      if (best.score >= DUP_EXACT) {
        issues.push({
          kind: 'duplicate_existing',
          severity: 'high',
          targetName: name,
          relatedName: best.name,
          reason: `이미 모델에 존재하는 ${kindLabel} "${best.name}"와 동일합니다.`,
          suggestion: '신규 생성 대신 기존 노드를 재사용하세요.',
          ruleId: 'duplicate-existing-exact',
        });
      } else if (best.score >= DUP_NEAR) {
        issues.push({
          kind: 'duplicate_existing',
          severity: 'med',
          targetName: name,
          relatedName: best.name,
          reason: `기존 ${kindLabel} "${best.name}"와 매우 유사합니다(오타 가능).`,
          suggestion: '동일 개념이면 재사용, 아니면 이름을 구분하세요.',
          ruleId: 'duplicate-existing-near',
        });
      }
    }
  };

  scan(input.proposed.classes.map((c) => c.name), existing.classNames, '클래스');
  scan(input.proposed.instances.map((i) => i.name), existing.instanceNames, '인스턴스');
  return issues;
}

// 새 추출분 안에서 서로 중복되는 이름.
export function checkDuplicateWithin(input: ReviewInput): CriticIssue[] {
  const issues: CriticIssue[] = [];
  const asNamed = (names: string[]): NamedEntity[] => names.map((name, i) => ({ id: String(i), name }));

  const pushPairs = (names: string[], kindLabel: string) => {
    for (const p of findSimilarPairs(asNamed(names))) {
      issues.push({
        kind: 'duplicate_within',
        severity: 'med',
        targetName: p.a.name,
        relatedName: p.b.name,
        reason: `새 ${kindLabel} "${p.a.name}"와 "${p.b.name}"가 서로 중복으로 보입니다.`,
        suggestion: '하나로 합치거나 구분하세요.',
        ruleId: 'duplicate-within',
      });
    }
  };

  pushPairs(input.proposed.classes.map((c) => c.name), '클래스');
  pushPairs(input.proposed.instances.map((i) => i.name), '인스턴스');
  return issues;
}

// 한 노드가 관계를 과도하게 흡수(문서 제목 허브 강제 = 별모양).
export function checkStarHub(input: ReviewInput): CriticIssue[] {
  const rels = input.proposed.relations;
  if (rels.length < STAR_MIN_RELATIONS) return [];
  const star = starIndex(rels.map((r) => ({ sourceId: r.source, targetId: r.target })));
  if (star.value < STAR_THRESHOLD || !star.hubNodeId) return [];
  return [
    {
      kind: 'star_hub',
      severity: star.value >= 0.7 ? 'high' : 'med',
      targetName: star.hubNodeId,
      reason: `"${star.hubNodeId}" 한 노드에 관계가 ${star.hubDegree}개 집중됩니다(별모양 ${Math.round(
        star.value * 100,
      )}%).`,
      suggestion: '의미 근거 없는 허브 연결을 제거하고 섬으로 두세요.',
      ruleId: 'star-hub',
    },
  ];
}

// 관계가 하나도 없는 고립 노드(정직한 섬은 허용 — 정보성 low).
// 계층으로 연결된 노드는 고립이 아니다: 자식(자기 type 있음)도, 부모(다른 노드의
// type/className로 참조됨)도 제외한다.
export function checkOrphans(input: ReviewInput): CriticIssue[] {
  const referenced = new Set<string>();
  for (const r of input.proposed.relations) {
    referenced.add(r.source);
    referenced.add(r.target);
  }
  const parents = new Set<string>();
  for (const c of input.proposed.classes) if (c.type) parents.add(c.type);
  for (const i of input.proposed.instances) if (i.className) parents.add(i.className);

  const issues: CriticIssue[] = [];
  for (const c of input.proposed.classes) {
    if (referenced.has(c.name)) continue;
    if (c.type) continue; // 자식 — 부모로 연결됨
    if (parents.has(c.name)) continue; // 부모 — 자식으로 연결됨
    issues.push({
      kind: 'orphan',
      severity: 'low',
      targetName: c.name,
      reason: '연결된 관계가 없는 고립 노드입니다.',
      suggestion: '근거가 있으면 연결, 없으면 섬으로 둬도 됩니다.',
      ruleId: 'orphan',
    });
  }
  for (const i of input.proposed.instances) {
    if (referenced.has(i.name)) continue;
    if (i.className) continue;
    issues.push({
      kind: 'orphan',
      severity: 'low',
      targetName: i.name,
      reason: '연결된 관계가 없는 고립 인스턴스입니다.',
      suggestion: '부모 클래스나 관계를 지정하세요.',
      ruleId: 'orphan',
    });
  }
  return issues;
}

// 관계 대상으로 참조되지만 어디에도 정의되지 않은 개념.
export function checkUndefinedConcepts(input: ReviewInput): CriticIssue[] {
  const defined = new Set<string>();
  input.proposed.classes.forEach((c) => defined.add(normalizeName(c.name)));
  input.proposed.instances.forEach((i) => defined.add(normalizeName(i.name)));
  if (input.existing) {
    input.existing.classNames.forEach((n) => defined.add(normalizeName(n)));
    input.existing.instanceNames.forEach((n) => defined.add(normalizeName(n)));
  }
  const issues: CriticIssue[] = [];
  const seen = new Set<string>();
  for (const r of input.proposed.relations) {
    for (const endpoint of [r.source, r.target]) {
      const key = normalizeName(endpoint);
      if (defined.has(key) || seen.has(key)) continue;
      seen.add(key);
      issues.push({
        kind: 'undefined_concept',
        severity: 'high',
        targetName: endpoint,
        reason: '관계 대상으로 참조되지만 정의가 없습니다.',
        suggestion: '노드로 정의하거나 보강 단계에서 채우세요.',
        ruleId: 'undefined-concept',
      });
    }
  }
  return issues;
}

// 클래스/인스턴스 종류 혼동(같은 이름이 종류만 다르게 충돌).
export function checkClassInstanceConfusion(input: ReviewInput): CriticIssue[] {
  if (!input.existing) return [];
  const existingInstances = new Set(input.existing.instanceNames.map(normalizeName));
  const existingClasses = new Set(input.existing.classNames.map(normalizeName));
  const issues: CriticIssue[] = [];

  for (const c of input.proposed.classes) {
    if (existingInstances.has(normalizeName(c.name))) {
      issues.push({
        kind: 'class_instance_confusion',
        severity: 'med',
        targetName: c.name,
        reason: `"${c.name}"가 클래스로 제안되었으나 같은 이름의 인스턴스가 이미 있습니다.`,
        suggestion: '클래스/인스턴스 종류를 확인하세요.',
        ruleId: 'class-instance-confusion',
      });
    }
  }
  for (const i of input.proposed.instances) {
    if (existingClasses.has(normalizeName(i.name))) {
      issues.push({
        kind: 'class_instance_confusion',
        severity: 'med',
        targetName: i.name,
        reason: `"${i.name}"가 인스턴스로 제안되었으나 같은 이름의 클래스가 이미 있습니다.`,
        suggestion: '클래스/인스턴스 종류를 확인하세요.',
        ruleId: 'class-instance-confusion',
      });
    }
  }
  return issues;
}

const SEVERITY_RANK: Record<CriticSeverity, number> = { high: 0, med: 1, low: 2 };

// 임의의 이슈 목록 → 리포트. 같은 (kind, target, related) 중복 제거 후 심각도 정렬.
// 결정론 이슈 + LLM 정성 이슈를 한데 합칠 때 라우트에서도 재사용한다.
export function buildReport(issues: CriticIssue[]): CriticReport {
  const byKey = new Map<string, CriticIssue>();
  for (const issue of issues) {
    const key = `${issue.kind}::${issue.targetName}::${issue.relatedName ?? ''}`;
    if (!byKey.has(key)) byKey.set(key, issue);
  }
  const deduped = [...byKey.values()].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );

  const summary: CriticSummary = {
    high: deduped.filter((i) => i.severity === 'high').length,
    med: deduped.filter((i) => i.severity === 'med').length,
    low: deduped.filter((i) => i.severity === 'low').length,
    total: deduped.length,
  };

  return { issues: deduped, summary };
}

// 모든 결정론 검수기를 합쳐 리포트 생성.
export function reviewProposal(input: ReviewInput): CriticReport {
  return buildReport([
    ...checkDuplicateExisting(input),
    ...checkDuplicateWithin(input),
    ...checkStarHub(input),
    ...checkOrphans(input),
    ...checkUndefinedConcepts(input),
    ...checkClassInstanceConfusion(input),
  ]);
}
