import type {
  Pattern,
  PatternMethod,
  PatternRole,
  PatternRelationType,
  PatternTraversalTemplate,
  PromotePatternRequestInput,
} from './types';
import type { DriftElement } from './drift';

// PRD-H (H5/M4): 확장 = 패턴 버전업. 베이스 패턴 + 수용된 확장(역할·관계)을 받아
// 다음 버전 번들을 만든다(version+1, previousVersionId=base.id, isDraft). 순수·불변 —
// 베이스를 변형하지 않고 새 객체를 반환한다. 실제 영속화는 POST /api/patterns(promote).

export interface PatternExtension {
  roles: PatternRole[];
  relationTypes: PatternRelationType[];
  competencyQuestions: string[];
  traversalTemplates: PatternTraversalTemplate[];
}

// 버전업 미리보기 + 승격 입력의 원천. version/previousVersionId 는 카드 미리보기용
// (실제 저장 시 서버가 nextPatternVersion 으로 재계산·정합화).
export interface ExtendedPatternDraft {
  key: string;
  name: string;
  nameKo: string;
  domain: string;
  version: number;
  previousVersionId: string;
  roles: PatternRole[];
  relationTypes: PatternRelationType[];
  competencyQuestions: string[];
  traversalTemplates: PatternTraversalTemplate[];
  method: PatternMethod;
  isDraft: true;
}

function appendUniqueByName<T extends { name: string }>(
  base: readonly T[],
  add: readonly T[],
): T[] {
  const seen = new Set(base.map((x) => x.name));
  const extra = add.filter((x) => !seen.has(x.name));
  return [...base, ...extra];
}

export function extendPattern(
  base: Pattern,
  ext: Partial<PatternExtension>,
): ExtendedPatternDraft {
  return {
    key: base.key,
    name: base.name,
    nameKo: base.nameKo,
    domain: base.domain,
    version: base.version + 1,
    previousVersionId: base.id,
    roles: appendUniqueByName(base.roles, ext.roles ?? []),
    relationTypes: appendUniqueByName(base.relationTypes, ext.relationTypes ?? []),
    competencyQuestions: [
      ...base.competencyQuestions,
      ...(ext.competencyQuestions ?? []),
    ],
    traversalTemplates: [
      ...base.traversalTemplates,
      ...(ext.traversalTemplates ?? []),
    ],
    method: base.method,
    isDraft: true,
  };
}

// 드리프트 요소(개념/관계) → 패턴 확장(역할/관계타입)으로 변환. 개념=역할, 관계=관계타입.
export function driftElementsToExtension(
  elements: DriftElement[],
): PatternExtension {
  const roles: PatternRole[] = [];
  const relationTypes: PatternRelationType[] = [];
  for (const el of elements) {
    if (el.kind === 'concept') {
      roles.push({ name: el.name, nodeKind: 'class', description: el.description ?? '' });
    } else {
      relationTypes.push({
        name: el.name,
        category: 'descriptive',
        sourceRole: el.sourceRole ?? '',
        targetRole: el.targetRole ?? '',
      });
    }
  }
  return { roles, relationTypes, competencyQuestions: [], traversalTemplates: [] };
}

// 확장 초안 → 승격(POST /api/patterns) 입력. 버전·이전버전은 서버가 정합화한다.
export function extendedPatternToPromote(
  draft: ExtendedPatternDraft,
): PromotePatternRequestInput {
  return {
    key: draft.key,
    name: draft.name,
    nameKo: draft.nameKo,
    domain: draft.domain,
    roles: draft.roles,
    relationTypes: draft.relationTypes,
    competencyQuestions: draft.competencyQuestions,
    traversalTemplates: draft.traversalTemplates,
    method: draft.method,
  };
}
