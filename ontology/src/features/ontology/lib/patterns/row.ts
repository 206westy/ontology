import type {
  Pattern,
  PatternMethod,
  PatternRelationType,
  PatternRole,
  PatternTraversalTemplate,
} from './types';

// PRD-H (M1): 캐시 DB row → Pattern 매퍼(순수). jsonb 컬럼은 unknown 이라 좁혀 준다.
// drizzle 를 import 하지 않도록 구조적 타입만 받는다(클라이언트 번들 오염 방지).
export interface PatternRow {
  id: string;
  key: string;
  name: string;
  nameKo: string;
  version: number;
  domain: string;
  roles: unknown;
  relationTypes: unknown;
  competencyQuestions: unknown;
  traversalTemplates: unknown;
  method: string;
  sourceRepo: string | null;
  sourceUri: string | null;
  sourceLabel: string | null;
  license: string | null;
  occurrenceCount?: number;
  visibility?: string | null;
  health?: number | null;
  isDraft: boolean;
  previousVersionId: string | null;
  createdAt: Date | string;
}

export function rowToPattern(row: PatternRow): Pattern {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    nameKo: row.nameKo,
    version: row.version,
    domain: row.domain,
    roles: (row.roles ?? []) as PatternRole[],
    relationTypes: (row.relationTypes ?? []) as PatternRelationType[],
    competencyQuestions: (row.competencyQuestions ?? []) as string[],
    traversalTemplates: (row.traversalTemplates ?? []) as PatternTraversalTemplate[],
    method: row.method as PatternMethod,
    sourceRepo: row.sourceRepo,
    sourceUri: row.sourceUri,
    sourceLabel: row.sourceLabel,
    license: row.license,
    occurrenceCount: row.occurrenceCount ?? 1,
    visibility: (row.visibility as Pattern['visibility']) ?? 'private',
    health: row.health ?? null,
    isDraft: row.isDraft,
    previousVersionId: row.previousVersionId,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
  };
}
