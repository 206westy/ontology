import { z } from 'zod';
import { DEFAULT_PARTITION_ID, toRelationLayer } from '@/features/ontology/lib/types';
import { ATTRIBUTION_KEYS, CONCEPT_LABEL } from '@/lib/neo4j/schema';

// ─── Types ──────────────────────────────────────────────────

export interface CypherStatement {
  query: string;
  params: Record<string, unknown>;
  description: string;
}

const operationEnum = z.enum(['ADD', 'MOD', 'DEL']);
// PRD-L M1 하위호환: 'axioms'/'axiom_classes' 는 과거 커밋 detail 스냅샷을 파싱만
// 허용하기 위해 남긴다(테이블은 DROP됨). Cypher 는 생성되지 않고 조용히 스킵된다 —
// enum 에서 제거하면 과거 커밋이 섞인 push/rollback 전체가 검증 에러로 실패한다.
const targetTableEnum = z.enum([
  'classes',
  'instances',
  'edges',
  'properties',
  'relation_types',
  'axioms',
  'axiom_classes',
  'instance_values',
]);

export const commitDetailSchema = z.object({
  operation: operationEnum,
  targetTable: targetTableEnum,
  targetId: z.string().uuid(),
  beforeSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  afterSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type CommitDetail = z.infer<typeof commitDetailSchema>;

// ─── Push Context (PRD-E P1-3) ──────────────────────────────
// 스냅샷만으로 알 수 없는 정보(프로퍼티 메타, instance_values, 어트리뷰션)를
// push 라우트가 Supabase 에서 조회해 주입한다. context 없이도 동작(기존 호출 호환).

export interface PropertyMeta {
  id: string;
  name: string;
  dataType: string;
  isRequired: boolean;
  enumValues: string[] | null;
}

export interface AttributionMeta {
  sourceType: string;
  confidence: number | null;
  sourceRef: string | null;
}

export interface InstanceValueMeta {
  propertyId: string;
  value: string | null;
}

export interface PushContext {
  // classId → 해당 클래스의 전체 프로퍼티 (propsSchema 재구성용)
  propertiesByClass?: Record<string, PropertyMeta[]>;
  // propertyId → 메타 (instance_values 캐스팅용)
  propertyById?: Record<string, PropertyMeta>;
  // instanceId → 값 목록 (인스턴스 노드 평탄화용)
  instanceValuesByInstance?: Record<string, InstanceValueMeta[]>;
  // `${table}:${id}` → 어트리뷰션
  attributions?: Record<string, AttributionMeta>;
  // PRD-E P2-3: 노드 id → 임베딩 (Supabase 에서 계산한 같은 벡터를 운반, 재계산 금지)
  embeddings?: Record<string, number[]>;
}

// ─── Helpers ────────────────────────────────────────────────

const SRC = ATTRIBUTION_KEYS.src;
const CONF = ATTRIBUTION_KEYS.conf;
const SRC_REF = ATTRIBUTION_KEYS.srcRef;

function attrKey(table: string, id: string): string {
  return `${table}:${id}`;
}

function attrParams(
  table: string,
  id: string,
  context?: PushContext,
): { src: unknown; conf: unknown; srcRef: unknown } {
  const a = context?.attributions?.[attrKey(table, id)];
  return {
    src: a?.sourceType ?? null,
    conf: a?.confidence ?? null,
    srcRef: a?.sourceRef ?? null,
  };
}

// propsSchema JSON 직렬화 — 프로퍼티 1급 보존(평탄화 금지).
function propsSchemaJson(classId: string, context?: PushContext): string | null {
  const props = context?.propertiesByClass?.[classId];
  if (!props) return null;
  return JSON.stringify(
    props.map((p) => ({
      name: p.name,
      dataType: p.dataType,
      required: p.isRequired,
      enumValues: p.enumValues ?? null,
    })),
  );
}

// Neo4j 속성 키로 안전하게(백틱 이스케이프).
function safeKey(name: string): string {
  return name.replace(/`/g, '');
}

// 관계명 → Neo4j 관계 타입 절(clause).
// ASCII 는 UPPER_SNAKE 식별자로 그대로(기존 규약·기존 그래프 데이터 호환).
// 한글 등 비-ASCII 는 문자를 보존하고 백틱으로 감싼다 — 그래야 서로 다른 관계가
// 구분된다. (기존 버그: 비-ASCII 를 전부 '_' 로 치환 → 교체함/변경함/포함함 …이
// 모두 '___' 로 충돌해 관계 종류를 잃었다. Neo4j 는 백틱 타입에 유니코드를 허용.)
function relTypeClause(relName: string): string {
  const hasNonAscii = /[^\x00-\x7F]/.test(relName);
  const hasAlnum = /[a-zA-Z0-9]/.test(relName);
  if (!hasNonAscii && hasAlnum) {
    // 예: 'located-at' → LOCATED_AT (백틱 불필요, 기존 동작 유지)
    return relName.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
  }
  // 유니코드(한글 등): 문자 보존 + 백틱. 내부 백틱은 제거(주입 방지).
  const token = relName.trim().replace(/`/g, '');
  return token ? `\`${token}\`` : 'RELATED_TO';
}

// instance_values 타입 캐스팅 — text 를 dataType 에 맞춰 변환.
function castExpr(dataType: string, paramRef: string): string {
  switch (dataType) {
    case 'integer':
      return `toInteger(${paramRef})`;
    case 'float':
      return `toFloat(${paramRef})`;
    case 'boolean':
      return `(toLower(toString(${paramRef})) = 'true')`;
    default:
      return paramRef; // string, enum, date 는 문자열 보존
  }
}

// 인스턴스 노드에 단일 값 평탄화.
function instanceValueSet(
  instanceId: string,
  propertyId: string,
  value: string | null,
  context: PushContext | undefined,
  label: string,
): CypherStatement | null {
  const meta = context?.propertyById?.[propertyId];
  if (!meta) return null; // 프로퍼티 메타 없으면 평탄화 불가
  const key = safeKey(meta.name);
  return {
    query: `MATCH (i:Instance {id: $instanceId}) SET i.\`${key}\` = ${castExpr(meta.dataType, '$value')}`,
    params: { instanceId, value },
    description: `인스턴스 값 "${meta.name}" ${label}`,
  };
}

// 클래스 propsSchema 갱신 구문.
function setPropsSchemaStatement(
  classId: string,
  context?: PushContext,
): CypherStatement | null {
  const json = propsSchemaJson(classId, context);
  if (json === null) return null;
  return {
    query: `MATCH (c:Class {id: $classId}) SET c.propsSchema = $propsSchema`,
    params: { classId, propsSchema: json },
    description: `클래스 propsSchema 갱신`,
  };
}

// ─── Cypher Generators by Table ─────────────────────────────

// MERGE 기반 upsert (재푸시 중복 0). :Concept 공유 라벨 부여.
function classUpsert(
  detail: CommitDetail,
  context: PushContext | undefined,
  verb: string,
): CypherStatement {
  const snap = detail.afterSnapshot as Record<string, unknown>;
  const attr = attrParams('classes', detail.targetId, context);
  return {
    // 임베딩은 coalesce 로 — 없으면 기존 값 유지(null 덮어쓰기 방지).
    query: `MERGE (n:Class {id: $id}) SET n:${CONCEPT_LABEL}, n.name = $name, n.description = $description, n.color = $color, n.partition = $partition, n.propsSchema = $propsSchema, n.embedding = coalesce($embedding, n.embedding), n.${SRC} = $src, n.${CONF} = $conf, n.${SRC_REF} = $srcRef`,
    params: {
      id: detail.targetId,
      name: snap.name ?? '',
      description: snap.description ?? '',
      color: snap.color ?? '#7c3aed',
      partition: snap.partitionId ?? DEFAULT_PARTITION_ID,
      propsSchema: propsSchemaJson(detail.targetId, context),
      embedding: context?.embeddings?.[detail.targetId] ?? null,
      ...attr,
    },
    description: `클래스 "${snap.name}" ${verb}`,
  };
}

function classDel(detail: CommitDetail): CypherStatement {
  const snap = (detail.beforeSnapshot ?? detail.afterSnapshot) as
    | Record<string, unknown>
    | undefined;
  return {
    query: `MATCH (n:Class {id: $id}) DETACH DELETE n`,
    params: { id: detail.targetId },
    description: `클래스 "${snap?.name ?? detail.targetId}" 삭제`,
  };
}

function classIsARelation(detail: CommitDetail): CypherStatement[] {
  const snap = detail.afterSnapshot as Record<string, unknown>;
  if (!snap.parentId) return [];
  return [
    {
      query: `MATCH (child:Class {id: $childId}), (parent:Class {id: $parentId}) MERGE (child)-[:IS_A]->(parent)`,
      params: { childId: detail.targetId, parentId: snap.parentId },
      description: `클래스 "${snap.name}" → 상위 클래스 IS_A 관계 설정`,
    },
  ];
}

function instanceUpsert(
  detail: CommitDetail,
  context: PushContext | undefined,
  verb: string,
): CypherStatement {
  const snap = detail.afterSnapshot as Record<string, unknown>;
  const attr = attrParams('instances', detail.targetId, context);
  return {
    query: `MERGE (n:Instance {id: $id}) SET n:${CONCEPT_LABEL}, n.name = $name, n.classId = $classId, n.description = $description, n.embedding = coalesce($embedding, n.embedding), n.${SRC} = $src, n.${CONF} = $conf, n.${SRC_REF} = $srcRef`,
    params: {
      id: detail.targetId,
      name: snap.name ?? '',
      classId: snap.classId ?? '',
      description: snap.description ?? '',
      embedding: context?.embeddings?.[detail.targetId] ?? null,
      ...attr,
    },
    description: `인스턴스 "${snap.name}" ${verb}`,
  };
}

function instanceClassEdge(detail: CommitDetail): CypherStatement[] {
  const snap = detail.afterSnapshot as Record<string, unknown>;
  if (!snap.classId) return [];
  return [
    {
      // PRD-B B-1: 인스턴스는 소속 클래스의 partition 을 상속
      query: `MATCH (i:Instance {id: $instanceId}), (c:Class {id: $classId}) MERGE (i)-[:INSTANCE_OF]->(c) SET i.partition = c.partition`,
      params: { instanceId: detail.targetId, classId: snap.classId },
      description: `인스턴스 "${snap.name}" → 클래스 INSTANCE_OF 관계 설정`,
    },
  ];
}

// 인스턴스의 모든 값을 context 에서 평탄화.
function instanceValueFlatten(
  detail: CommitDetail,
  context: PushContext | undefined,
): CypherStatement[] {
  const values = context?.instanceValuesByInstance?.[detail.targetId];
  if (!values) return [];
  return values
    .map((v) =>
      instanceValueSet(detail.targetId, v.propertyId, v.value, context, '적재'),
    )
    .filter((s): s is CypherStatement => s !== null);
}

function instanceDel(detail: CommitDetail): CypherStatement {
  const snap = (detail.beforeSnapshot ?? detail.afterSnapshot) as
    | Record<string, unknown>
    | undefined;
  return {
    query: `MATCH (n:Instance {id: $id}) DETACH DELETE n`,
    params: { id: detail.targetId },
    description: `인스턴스 "${snap?.name ?? detail.targetId}" 삭제`,
  };
}

function edgeUpsert(
  detail: CommitDetail,
  context: PushContext | undefined,
): CypherStatement {
  const snap = detail.afterSnapshot as Record<string, unknown>;
  const relName = (snap.relationTypeName as string) ?? 'RELATED_TO';
  const relClause = relTypeClause(relName);
  const attr = attrParams('edges', detail.targetId, context);
  return {
    // MERGE on id → 재푸시 중복 0. domain/range·cardinality·출처 반영.
    query: `MATCH (a {id: $sourceId}), (b {id: $targetId}) MERGE (a)-[r:${relClause} {id: $id}]->(b) SET r.relationTypeId = $relationTypeId, r.bridge = $bridge, r.min_cardinality = toInteger($minCardinality), r.max_cardinality = toInteger($maxCardinality), r.sourceKind = $sourceKind, r.targetKind = $targetKind, r.${SRC} = $src, r.${CONF} = $conf, r.${SRC_REF} = $srcRef`,
    params: {
      id: detail.targetId,
      sourceId: snap.sourceId ?? '',
      targetId: snap.targetId ?? '',
      relationTypeId: snap.relationTypeId ?? '',
      bridge: snap.isBridge ?? false,
      minCardinality: snap.minCardinality ?? null,
      maxCardinality: snap.maxCardinality ?? null,
      sourceKind: snap.sourceKind ?? null,
      targetKind: snap.targetKind ?? null,
      ...attr,
    },
    description: `관계 "${relName}"${snap.isBridge ? ' (bridge)' : ''} 엣지 생성`,
  };
}

function edgeDel(detail: CommitDetail): CypherStatement {
  return {
    query: `MATCH ()-[r {id: $id}]->() DELETE r`,
    params: { id: detail.targetId },
    description: `엣지 "${detail.targetId}" 삭제`,
  };
}

function relationTypeUpsert(
  detail: CommitDetail,
  context: PushContext | undefined,
): CypherStatement {
  const snap = detail.afterSnapshot as Record<string, unknown>;
  const attr = attrParams('relation_types', detail.targetId, context);
  return {
    // PRD-L M2: layer 운반. 과거 커밋 스냅샷의 category(5분류)는 toRelationLayer 로
    // 하위호환 변환(diagnostic/procedural→kinetic, 그 외→semantic). 누락은 semantic.
    query: `MERGE (rt:RelationType {id: $id}) SET rt.name = $name, rt.description = $description, rt.layer = $layer, rt.domainClassId = $domainClassId, rt.rangeClassId = $rangeClassId, rt.${SRC} = $src, rt.${CONF} = $conf, rt.${SRC_REF} = $srcRef`,
    params: {
      id: detail.targetId,
      name: snap.name ?? '',
      description: snap.description ?? '',
      layer: toRelationLayer(snap.layer ?? snap.category),
      domainClassId: snap.sourceClassId ?? null,
      rangeClassId: snap.targetClassId ?? null,
      ...attr,
    },
    description: `관계 타입 "${snap.name}" 생성`,
  };
}

function relationTypeDel(detail: CommitDetail): CypherStatement {
  const snap = (detail.beforeSnapshot ?? detail.afterSnapshot) as
    | Record<string, unknown>
    | undefined;
  return {
    query: `MATCH (rt:RelationType {id: $id}) DETACH DELETE rt`,
    params: { id: detail.targetId },
    description: `관계 타입 "${snap?.name ?? detail.targetId}" 삭제`,
  };
}

// ─── Main Builder ───────────────────────────────────────────

export function buildCypherStatements(
  details: CommitDetail[],
  context?: PushContext,
): CypherStatement[] {
  const statements: CypherStatement[] = [];

  // Within ADD, process classes before instances before edges
  const tableOrder: Record<string, number> = {
    classes: 0,
    relation_types: 1,
    properties: 2,
    instances: 3,
    instance_values: 4,
    edges: 5,
  };
  const sorted = [...details].sort((a, b) => {
    const opOrder = { ADD: 0, MOD: 1, DEL: 2 };
    const opDiff = opOrder[a.operation] - opOrder[b.operation];
    if (opDiff !== 0) return opDiff;
    return (tableOrder[a.targetTable] ?? 99) - (tableOrder[b.targetTable] ?? 99);
  });

  // 방어적 스킵: ADD/MOD 인데 afterSnapshot 이 없는 손상 레코드는 upsert 생성 시
  // null 역참조로 전체 push 를 500 시킨다. 이런 레코드는 조용히 크래시시키지 말고
  // 건너뛴다(유효한 나머지 변경은 정상 반영). afterSnapshot 을 역참조하는 테이블만 대상.
  const NEEDS_AFTER = new Set([
    'classes',
    'instances',
    'edges',
    'relation_types',
    'instance_values',
  ]);

  for (const detail of sorted) {
    const { operation, targetTable } = detail;

    if (
      operation !== 'DEL' &&
      detail.afterSnapshot == null &&
      NEEDS_AFTER.has(targetTable)
    ) {
      // 손상/불완전 레코드 — 반영할 데이터가 없어 스킵.
      continue;
    }

    if (targetTable === 'classes') {
      if (operation === 'ADD') {
        statements.push(classUpsert(detail, context, '생성'));
        statements.push(...classIsARelation(detail));
      } else if (operation === 'MOD') {
        statements.push(classUpsert(detail, context, '수정'));
        const before = detail.beforeSnapshot as Record<string, unknown> | undefined;
        const after = detail.afterSnapshot as Record<string, unknown>;
        if (before?.parentId !== after.parentId) {
          if (before?.parentId) {
            statements.push({
              query: `MATCH (child:Class {id: $childId})-[r:IS_A]->(old:Class {id: $oldParentId}) DELETE r`,
              params: { childId: detail.targetId, oldParentId: before.parentId },
              description: `기존 IS_A 관계 제거`,
            });
          }
          statements.push(...classIsARelation(detail));
        }
      } else {
        statements.push(classDel(detail));
      }
    } else if (targetTable === 'instances') {
      if (operation === 'ADD') {
        statements.push(instanceUpsert(detail, context, '생성'));
        statements.push(...instanceClassEdge(detail));
        statements.push(...instanceValueFlatten(detail, context));
      } else if (operation === 'MOD') {
        statements.push(instanceUpsert(detail, context, '수정'));
        const before = detail.beforeSnapshot as Record<string, unknown> | undefined;
        const after = detail.afterSnapshot as Record<string, unknown>;
        if (before?.classId !== after.classId) {
          if (before?.classId) {
            statements.push({
              query: `MATCH (i:Instance {id: $instanceId})-[r:INSTANCE_OF]->() DELETE r`,
              params: { instanceId: detail.targetId },
              description: `기존 INSTANCE_OF 관계 제거`,
            });
          }
          statements.push(...instanceClassEdge(detail));
        }
        statements.push(...instanceValueFlatten(detail, context));
      } else {
        statements.push(instanceDel(detail));
      }
    } else if (targetTable === 'instance_values') {
      // PRD-E P1-3: 인스턴스 값 적재 (개별 값 변경 경로). 타입 캐스팅.
      if (operation === 'ADD' || operation === 'MOD') {
        const snap = detail.afterSnapshot as Record<string, unknown>;
        const stmt = instanceValueSet(
          String(snap.instanceId ?? ''),
          String(snap.propertyId ?? ''),
          (snap.value as string | null) ?? null,
          context,
          operation === 'ADD' ? '적재' : '수정',
        );
        if (stmt) statements.push(stmt);
      } else {
        const snap = (detail.beforeSnapshot ?? detail.afterSnapshot) as
          | Record<string, unknown>
          | undefined;
        const meta = context?.propertyById?.[String(snap?.propertyId ?? '')];
        if (snap && meta) {
          statements.push({
            query: `MATCH (i:Instance {id: $instanceId}) REMOVE i.\`${safeKey(meta.name)}\``,
            params: { instanceId: snap.instanceId },
            description: `인스턴스 값 "${meta.name}" 제거`,
          });
        }
      }
    } else if (targetTable === 'edges') {
      if (operation === 'ADD') {
        statements.push(edgeUpsert(detail, context));
      } else if (operation === 'DEL') {
        statements.push(edgeDel(detail));
      }
      // MOD for edges: delete + re-add handled by frontend
    } else if (targetTable === 'properties') {
      // PRD-E P1-3: 프로퍼티 변경 → 클래스 propsSchema 재구성 (불투명 문자열 폐기).
      const snap = (detail.afterSnapshot ?? detail.beforeSnapshot) as
        | Record<string, unknown>
        | undefined;
      const classId = snap?.classId ? String(snap.classId) : undefined;
      if (classId) {
        const stmt = setPropsSchemaStatement(classId, context);
        if (stmt) statements.push(stmt);
      }
    } else if (targetTable === 'relation_types') {
      if (operation === 'ADD' || operation === 'MOD') {
        statements.push(relationTypeUpsert(detail, context));
      } else if (operation === 'DEL') {
        statements.push(relationTypeDel(detail));
      }
    }
    // 과거 커밋의 axioms/axiom_classes detail: PRD-L M1 이후 스킵(Neo4j 미운반).
    // 현행 규칙(constraints)도 거버넌스 — Supabase 전용(설계대로).
  }

  return statements;
}

// ─── Rollback: Generate reverse Cypher from before_snapshot ──

export function buildRollbackStatements(
  details: CommitDetail[],
  context?: PushContext,
): CypherStatement[] {
  const reversed = [...details].reverse();
  const statements: CypherStatement[] = [];

  for (const detail of reversed) {
    const { operation, targetTable } = detail;

    if (operation === 'ADD') {
      // Reverse of ADD = DEL
      const delDetail: CommitDetail = {
        ...detail,
        operation: 'DEL',
        beforeSnapshot: detail.afterSnapshot,
      };
      if (targetTable === 'classes') statements.push(classDel(delDetail));
      else if (targetTable === 'instances') statements.push(instanceDel(delDetail));
      else if (targetTable === 'edges') statements.push(edgeDel(delDetail));
      else if (targetTable === 'relation_types')
        statements.push(relationTypeDel(delDetail));
    } else if (operation === 'DEL' && detail.beforeSnapshot) {
      // Reverse of DEL = ADD using before_snapshot
      const addDetail: CommitDetail = {
        ...detail,
        operation: 'ADD',
        afterSnapshot: detail.beforeSnapshot,
      };
      if (targetTable === 'classes') {
        statements.push(classUpsert(addDetail, context, '복원'));
        statements.push(...classIsARelation(addDetail));
      } else if (targetTable === 'instances') {
        statements.push(instanceUpsert(addDetail, context, '복원'));
        statements.push(...instanceClassEdge(addDetail));
        statements.push(...instanceValueFlatten(addDetail, context));
      } else if (targetTable === 'edges') {
        statements.push(edgeUpsert(addDetail, context));
      } else if (targetTable === 'relation_types') {
        statements.push(relationTypeUpsert(addDetail, context));
      }
    } else if (operation === 'MOD' && detail.beforeSnapshot) {
      // Reverse of MOD = MOD back to before_snapshot
      const revertDetail: CommitDetail = {
        ...detail,
        afterSnapshot: detail.beforeSnapshot,
      };
      if (targetTable === 'classes')
        statements.push(classUpsert(revertDetail, context, '복원'));
      else if (targetTable === 'instances')
        statements.push(instanceUpsert(revertDetail, context, '복원'));
    }
  }

  return statements;
}

// ─── Preview: Format Cypher for display ─────────────────────

export function formatCypherPreview(statements: CypherStatement[]): string {
  return statements
    .map((s) => {
      let query = s.query;
      for (const [key, value] of Object.entries(s.params)) {
        query = query.replace(`$${key}`, JSON.stringify(value));
      }
      return `// ${s.description}\n${query};`;
    })
    .join('\n\n');
}
