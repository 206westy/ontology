import { NODE_COLORS } from '../constants/colors';
import { levenshtein, normalizeName } from './similarity';
import type { LlmParseResult } from '../api';
import type { RelationCategory } from './types';

// H1: 파싱 파이프라인이 조용히 흘려보내던 누락을 구조화 경고로 노출한다.
// 비즈니스 로직(무엇을 만들지)은 그대로 두고 "무엇이 빠졌는지"만 검토 UI에 전달한다.
export type ParseWarningKind =
  | 'placeholder_endpoint' // 관계 끝점이 추출 안 된 엔티티 → 임시 노드 생성
  | 'empty_relations' // 관계 추출 단계가 실패/빈 결과
  | 'invalid_action_dropped'; // 스키마 검증 실패 액션 드롭

export interface ParseWarning {
  kind: ParseWarningKind;
  message: string;
  name?: string;
}

// Shape the preview/confirm pipeline understands. Carries optional evidence and
// confidence so later stages (A-3/A-5) can display and persist provenance.
export interface ParsedExtraction {
  classes: {
    name: string;
    description: string;
    color: string | null;
    parentName: string | null;
    evidence?: string;
  }[];
  properties: {
    className: string;
    name: string;
    dataType: string;
    isRequired: boolean;
    enumValues: string[] | null;
  }[];
  relations: {
    sourceName: string;
    targetName: string;
    relationName: string;
    // PR1 (목표①): 액션 지향 분류. 구버전 payload 호환 위해 optional.
    category?: RelationCategory;
    evidence?: string;
    confidence?: number;
    // PRD-F P4-1: category 판정 확신도(저신뢰 라우팅용).
    categoryConfidence?: number;
  }[];
  instances: {
    className: string;
    name: string;
    description?: string;
    evidence?: string;
    values?: { propertyName: string; value: string; dataType: string }[];
  }[];
  // H1: 조용한 누락을 사용자에게 알리는 구조화 경고(검토 UI 표시용).
  warnings: ParseWarning[];
}

// Map the multi-stage parse output (entities + relations) onto the class/instance
// pipeline the preview/confirm flow understands (A-1 / A-1.1):
// - class-kind entities become classes (parented by their type category)
// - instance-kind entities become instances of their parentType class, carrying
//   property values; the class gains the corresponding property definitions
// - relation endpoints not extracted as entities become flat classes so the edge
//   can resolve (these surface later as undefined-concept gaps in A-3)
export function mapParseResult(
  res: LlmParseResult,
  existingClassNames: Set<string>,
  existingInstanceNames: Set<string> = new Set(),
): ParsedExtraction {
  const classes: ParsedExtraction['classes'] = [];
  const instances: ParsedExtraction['instances'] = [];
  const properties: ParsedExtraction['properties'] = [];
  const warnings: ParseWarning[] = [];
  const seenClass = new Set<string>();
  const seenInstance = new Set<string>();
  const propDefSeen = new Set<string>();
  const entities = res.entities ?? [];
  const rawRelations = res.relations ?? [];

  // Returns true only when a brand-new class node was actually created.
  const addClass = (
    name: string,
    parentName: string | null,
    color: string,
    evidence?: string,
    description = '',
  ): boolean => {
    const trimmed = name.trim();
    if (!trimmed || seenClass.has(trimmed) || existingClassNames.has(trimmed)) return false;
    classes.push({ name: trimmed, description, color, parentName, evidence });
    seenClass.add(trimmed);
    return true;
  };

  const kindOf = (e: LlmParseResult['entities'][number]) => e.nodeKind ?? 'class';
  const classNameFor = (e: LlmParseResult['entities'][number]) =>
    (e.parentType?.trim() || e.type?.trim() || '').trim();

  // 1) Class-kind entities first — each with its stated superclass (type) as parent.
  //    Creating named classes BEFORE bare category refs is what enables multi-level
  //    taxonomy (예: 동물 → 코끼리 → 코카서스): a mid-hierarchy class (코끼리) keeps its
  //    own parent (동물) instead of being pinned top-level when a child (코카서스) later
  //    references it as a type. seenClass dedupe makes first-writer-wins.
  for (const e of entities) {
    if (kindOf(e) !== 'class') continue;
    addClass(
      e.name,
      e.type?.trim() ? e.type.trim() : null,
      NODE_COLORS.mid,
      e.evidence,
      e.description?.trim() ?? '',
    );
  }

  // 2) Referenced parent/category names not yet created → top-level roots.
  //    A name already created as a child in step 1 is skipped (keeps its parent);
  //    only genuinely-new roots (a type with no entity of its own) are added here.
  for (const e of entities) {
    if (kindOf(e) === 'class') {
      if (e.type?.trim()) addClass(e.type, null, NODE_COLORS.root);
    } else {
      const cn = classNameFor(e);
      if (cn) addClass(cn, null, NODE_COLORS.root);
    }
  }

  // 3) Instance-kind entities.
  for (const e of entities) {
    if (kindOf(e) !== 'instance') continue;
    const className = classNameFor(e);
    const name = e.name.trim();
    if (!name) continue;

    if (!className) {
      // Instance with no category — fall back to a class so it isn't lost.
      addClass(name, null, NODE_COLORS.mid, e.evidence);
      continue;
    }
    addClass(className, null, NODE_COLORS.root);

    if (seenInstance.has(name) || existingInstanceNames.has(name)) continue;
    const values = (e.properties ?? []).map((p) => ({
      propertyName: p.name,
      value: p.value,
      dataType: p.dataType,
    }));
    instances.push({
      className,
      name,
      description: e.description?.trim() ?? '',
      evidence: e.evidence,
      values,
    });
    seenInstance.add(name);

    // Derive class property definitions from instance property names.
    // PR1 (목표②): 동작 모드 등 enum 속성의 허용값(enumValues)을 정의에 보존.
    for (const p of e.properties ?? []) {
      const key = `${className}::${p.name}`;
      if (propDefSeen.has(key)) continue;
      properties.push({
        className,
        name: p.name,
        dataType: p.dataType,
        isRequired: false,
        enumValues: p.enumValues ?? null,
      });
      propDefSeen.add(key);
    }
  }

  const relations = rawRelations.map((r) => ({
    sourceName: r.source,
    targetName: r.target,
    relationName: r.type,
    category: r.category,
    evidence: r.evidence,
    confidence: r.confidence,
    categoryConfidence: r.categoryConfidence,
  }));

  // Ensure relation endpoints exist as nodes (class fallback if neither a class
  // nor an instance was extracted for that name).
  // H1: a fabricated endpoint (created here, not extracted) is a hallucination
  // suspect / orphan — surface it as a warning instead of dropping it silently.
  const warnedPlaceholder = new Set<string>();
  for (const r of relations) {
    for (const endpoint of [r.sourceName, r.targetName]) {
      const t = endpoint.trim();
      if (!t) continue;
      if (seenInstance.has(t) || existingInstanceNames.has(t)) continue;
      const created = addClass(t, null, NODE_COLORS.leaf);
      if (created && !warnedPlaceholder.has(t)) {
        warnedPlaceholder.add(t);
        warnings.push({
          kind: 'placeholder_endpoint',
          name: t,
          message: `관계 끝점 "${t}"이(가) 추출 결과에 없어 임시 노드로 추가했습니다. 확인이 필요합니다.`,
        });
      }
    }
  }

  return { classes, properties, relations, instances, warnings };
}

// PR1 (목표①): 액션 지향 관계와 서술(descriptive) 관계를 분리. descriptive 는 프리뷰에서
// 강등(접힘) 표시한다. 원본 인덱스를 보존해 편집/삭제가 parsed.relations 를 그대로 가리킨다.
export function partitionRelationsByCategory<T extends { category?: RelationCategory }>(
  relations: T[],
): { actionable: { rel: T; index: number }[]; descriptive: { rel: T; index: number }[] } {
  const actionable: { rel: T; index: number }[] = [];
  const descriptive: { rel: T; index: number }[] = [];
  relations.forEach((rel, index) => {
    if (rel.category === 'descriptive') descriptive.push({ rel, index });
    else actionable.push({ rel, index });
  });
  return { actionable, descriptive };
}

// Islands (A-5): newly-extracted nodes with no grounded relation AND no place in
// the is-a hierarchy (neither a parent nor a child). These are honest islands —
// the preview offers an optional connection suggestion but never forces one.
export function computeIslands(parsed: ParsedExtraction): string[] {
  const connected = new Set<string>();
  for (const r of parsed.relations) {
    connected.add(r.sourceName);
    connected.add(r.targetName);
  }
  const isParent = new Set<string>();
  const hasParent = new Set<string>();
  for (const c of parsed.classes) {
    if (c.parentName) {
      isParent.add(c.parentName);
      hasParent.add(c.name);
    }
  }
  return parsed.classes
    .filter(
      (c) =>
        !connected.has(c.name) && !isParent.has(c.name) && !hasParent.has(c.name),
    )
    .map((c) => c.name);
}

// Flag newly-extracted class names that look like an existing class but aren't an
// exact reuse (A-2). These are synonym suspects — we do NOT auto-merge; the UI
// shows a "중복 가능" badge and routes the user to the P0-2 ER queue.
// Returns Map<newName, closestExistingName>.
export function findPossibleDuplicates(
  newNames: string[],
  existingNames: string[],
  opts: { minScore?: number; maxDistance?: number } = {},
): Map<string, string> {
  const minScore = opts.minScore ?? 0.8;
  const maxDistance = opts.maxDistance ?? 2;
  const result = new Map<string, string>();

  const existing = existingNames
    .map((name) => ({ name, norm: normalizeName(name) }))
    .filter((e) => e.norm.length > 0);

  for (const newName of newNames) {
    const na = normalizeName(newName);
    if (!na) continue;

    let best: { name: string; score: number } | null = null;
    for (const ex of existing) {
      const distance = levenshtein(na, ex.norm);
      const score = 1 - distance / Math.max(na.length, ex.norm.length);
      if (score >= minScore && distance <= maxDistance && (!best || score > best.score)) {
        best = { name: ex.name, score };
      }
    }
    if (best) result.set(newName, best.name);
  }

  return result;
}
