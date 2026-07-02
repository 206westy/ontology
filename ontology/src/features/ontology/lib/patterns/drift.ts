import { z } from 'zod';
import {
  patternRoleSchema,
  patternRelationTypeSchema,
  type Pattern,
} from './types';

// PRD-H (H5/M4): 스키마 드리프트 3분기 판정 — 매핑 / 확장 / 분기.
// 순수·DI: 정렬(align)과 도메인 적합(domain-fit)을 주입해 네트워크·LLM 없이 단위 테스트한다.
//  - map:    기존 역할/관계에 정렬(정상, 스키마 변경 없음)
//  - extend: 도메인 내부의 새 요소(같은 구획, 패턴 버전업 제안)
//  - fork:   충실히 정렬 불가(다른 도메인 → 새 패턴/구획, 발견 파이프라인 재호출)
// 자동 확정 없음 — 판정만 돌려주고 반영은 컨펌 시에만.

export type DriftDecision = 'map' | 'extend' | 'fork';

export type DriftElementKind = 'concept' | 'relation';

// 패턴 밖에서 나타난 신규 요소(개념=역할 후보, 관계=관계타입 후보).
export interface DriftElement {
  kind: DriftElementKind;
  name: string;
  description?: string | null;
  // 관계일 때만: 끝점 역할(맥락).
  sourceRole?: string | null;
  targetRole?: string | null;
}

export interface DriftTarget {
  kind: 'role' | 'relation';
  name: string;
}

export interface DriftJudgment {
  element: DriftElement;
  decision: DriftDecision;
  // map 일 때만 정렬 대상. extend/fork 는 null.
  target: DriftTarget | null;
  rationale: string;
  confidence: number;
}

// 판정에 필요한 현재 패턴 맥락(역할·관계·도메인)만 좁혀 받는다.
export type DriftPatternContext = Pick<
  Pattern,
  'domain' | 'roles' | 'relationTypes'
>;

// 정렬 점수가 이 값 이상이면 map(기존 역할/관계에 정렬)로 본다.
export const MAP_ALIGN_THRESHOLD = 0.5;

// 정렬 결과: 어떤 기존 역할/관계에 얼마나 정렬됐는지. 없으면 null.
export interface AlignMatch {
  kind: 'role' | 'relation';
  name: string;
  score: number;
}

// 도메인 적합: 정렬 불가일 때 도메인 내부(확장)인지 외부(분기)인지.
export interface DomainFit {
  inDomain: boolean;
  rationale: string;
  confidence: number;
}

type MaybePromise<T> = T | Promise<T>;

export type AlignFn = (
  element: DriftElement,
  ctx: DriftPatternContext,
) => MaybePromise<AlignMatch | null>;

export type DomainFitFn = (
  element: DriftElement,
  ctx: DriftPatternContext,
) => MaybePromise<DomainFit>;

export interface DriftDeps {
  alignFn: AlignFn;
  domainFitFn: DomainFitFn;
}

function alignRationale(match: AlignMatch): string {
  const kindKo = match.kind === 'role' ? '역할' : '관계';
  return `기존 ${kindKo} "${match.name}"에 정렬됩니다(스키마 변경 없음).`;
}

// 3분기 판정: 정렬 성공(임계값↑)=map, 아니면 도메인 적합에 따라 extend/fork.
export async function judgeDrift(
  element: DriftElement,
  ctx: DriftPatternContext,
  deps: DriftDeps,
): Promise<DriftJudgment> {
  const match = await deps.alignFn(element, ctx);
  if (match && match.score >= MAP_ALIGN_THRESHOLD) {
    return {
      element,
      decision: 'map',
      target: { kind: match.kind, name: match.name },
      rationale: alignRationale(match),
      confidence: match.score,
    };
  }

  const fit = await deps.domainFitFn(element, ctx);
  return {
    element,
    decision: fit.inDomain ? 'extend' : 'fork',
    target: null,
    rationale: fit.rationale,
    confidence: fit.confidence,
  };
}

export async function judgeDriftBatch(
  elements: DriftElement[],
  ctx: DriftPatternContext,
  deps: DriftDeps,
): Promise<DriftJudgment[]> {
  return Promise.all(elements.map((el) => judgeDrift(el, ctx, deps)));
}

// 생성 결과(추출된 엔티티 타입·관계 타입)에서 패턴 밖 신규 요소를 모은다(PURE).
// 개념=패턴 역할에 없는 엔티티 타입, 관계=패턴 관계타입에 없는 관계명. 이름 기준 dedup.
// 이 목록을 judgeDrift(배치)로 넘겨 매핑/확장/분기를 판정한다(자동 반영 없음).
export function collectDriftElements(
  entities: readonly { type: string; description?: string | null }[],
  relations: readonly { type: string }[],
  ctx: {
    roles: readonly { name: string }[];
    relationTypes: readonly { name: string }[];
  },
): DriftElement[] {
  const roleNames = new Set(ctx.roles.map((r) => r.name));
  const relNames = new Set(ctx.relationTypes.map((r) => r.name));
  const out: DriftElement[] = [];
  const seen = new Set<string>();

  for (const e of entities) {
    const type = e.type?.trim();
    if (!type || roleNames.has(type)) continue;
    const key = `concept:${type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: 'concept', name: type, description: e.description ?? null });
  }
  for (const r of relations) {
    const name = r.type?.trim();
    if (!name || relNames.has(name)) continue;
    const key = `relation:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: 'relation', name });
  }
  return out;
}

// ─── API / LLM schemas ──────────────────────────────────────────────────
export const driftElementSchema = z.object({
  kind: z.enum(['concept', 'relation']),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  sourceRole: z.string().nullable().optional(),
  targetRole: z.string().nullable().optional(),
});

export const driftRequestSchema = z.object({
  domain: z.string().min(1),
  roles: z.array(patternRoleSchema),
  relationTypes: z.array(patternRelationTypeSchema),
  elements: z.array(driftElementSchema).min(1),
});

export type DriftRequestInput = z.infer<typeof driftRequestSchema>;

// LLM(primary) 원시 판정. strict 모드: 모든 필드 required + nullable(optional 금지).
export const driftLlmJudgmentSchema = z.object({
  // 정렬되는 기존 역할/관계 이름. 없으면 null.
  alignedName: z.string().nullable(),
  alignedKind: z.enum(['role', 'relation']).nullable(),
  alignScore: z.number().min(0).max(1),
  // 정렬 불가일 때: 도메인 내부(확장)인지.
  inDomain: z.boolean(),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
});

export type DriftLlmJudgment = z.infer<typeof driftLlmJudgmentSchema>;
