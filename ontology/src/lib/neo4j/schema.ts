import type { Session } from 'neo4j-driver';

// ─── Neo4j 스키마 계약 (PRD-E P1-2) ────────────────────────────
// 라벨/속성 계약. 코드(cypher-builder)와 docs/neo4j-schema.md 가 이 상수를 따른다.
//
// Class:        (:Class:Concept {id,name,description,color,partition,propsSchema,embedding,_src,_conf,_srcRef})
// Instance:     (:Instance:Concept {id,name,classId,partition,description,<값들…>,embedding,_src,_conf,_srcRef})
// RelationType: (:RelationType {id,name,description,domainClassId,rangeClassId})
//
// propsSchema = JSON 문자열로 [{name,dataType,required,enumValues}] 직렬화 (프로퍼티 1급, 평탄화 금지).
// _src/_conf/_srcRef = 어트리뷰션 운반 (source_type / confidence / source_ref).

export const CONCEPT_LABEL = 'Concept';

export const NODE_LABELS = {
  class: 'Class',
  instance: 'Instance',
  relationType: 'RelationType',
} as const;

export const ATTRIBUTION_KEYS = {
  src: '_src',
  conf: '_conf',
  srcRef: '_srcRef',
} as const;

export const VECTOR_DIMENSIONS = 1536;
export const VECTOR_INDEX_NAME = 'concept_embedding';

export interface SchemaStatement {
  query: string;
  description: string;
}

// ─── 부트스트랩 구문 (모두 IF NOT EXISTS → idempotent) ──────────
export const SCHEMA_STATEMENTS: SchemaStatement[] = [
  // 0) 레거시 plain 인덱스 제거 — 고유성 제약이 자체 backing 인덱스를 만들므로 중복.
  //    (구버전이 만든 class_id RANGE 인덱스가 제약 생성을 막는 문제 해소)
  {
    query: `DROP INDEX class_id IF EXISTS`,
    description: '레거시 class_id 인덱스 제거 (고유성 제약으로 대체)',
  },
  // 1) 고유성 제약 (id)
  {
    query: `CREATE CONSTRAINT class_id_unique IF NOT EXISTS FOR (n:Class) REQUIRE n.id IS UNIQUE`,
    description: 'Class.id 고유 제약',
  },
  {
    query: `CREATE CONSTRAINT instance_id_unique IF NOT EXISTS FOR (n:Instance) REQUIRE n.id IS UNIQUE`,
    description: 'Instance.id 고유 제약',
  },
  {
    query: `CREATE CONSTRAINT relationtype_id_unique IF NOT EXISTS FOR (n:RelationType) REQUIRE n.id IS UNIQUE`,
    description: 'RelationType.id 고유 제약',
  },
  // 2) 조회 인덱스 (partition / name / classId)
  {
    query: `CREATE INDEX class_partition IF NOT EXISTS FOR (n:Class) ON (n.partition)`,
    description: 'Class.partition 인덱스',
  },
  {
    query: `CREATE INDEX class_name IF NOT EXISTS FOR (n:Class) ON (n.name)`,
    description: 'Class.name 인덱스',
  },
  {
    query: `CREATE INDEX instance_partition IF NOT EXISTS FOR (n:Instance) ON (n.partition)`,
    description: 'Instance.partition 인덱스',
  },
  {
    query: `CREATE INDEX instance_class IF NOT EXISTS FOR (n:Instance) ON (n.classId)`,
    description: 'Instance.classId 인덱스',
  },
  {
    query: `CREATE INDEX instance_name IF NOT EXISTS FOR (n:Instance) ON (n.name)`,
    description: 'Instance.name 인덱스',
  },
  {
    query: `CREATE INDEX relationtype_name IF NOT EXISTS FOR (n:RelationType) ON (n.name)`,
    description: 'RelationType.name 인덱스',
  },
  // 3) 벡터 인덱스 — Class/Instance 공유 라벨 :Concept (RAG 진입점, 생성은 P2)
  {
    query: `CREATE VECTOR INDEX ${VECTOR_INDEX_NAME} IF NOT EXISTS
      FOR (n:${CONCEPT_LABEL}) ON (n.embedding)
      OPTIONS { indexConfig: {
        \`vector.dimensions\`: ${VECTOR_DIMENSIONS},
        \`vector.similarity_function\`: 'cosine'
      } }`,
    description: ':Concept(embedding) 벡터 인덱스 (1536, cosine)',
  },
];

// 스키마 부트스트랩을 idempotent 하게 실행한다.
// 스키마 명령(제약/인덱스)은 각각 auto-commit 으로 분리 실행하며, 한 구문의
// 실패(예: 기존 스키마 충돌)가 나머지를 막지 않도록 개별 try/catch 로 격리한다.
export async function bootstrapNeo4jSchema(
  session: Session,
): Promise<{ applied: string[]; skipped: { description: string; reason: string }[] }> {
  const applied: string[] = [];
  const skipped: { description: string; reason: string }[] = [];
  for (const stmt of SCHEMA_STATEMENTS) {
    try {
      await session.run(stmt.query);
      applied.push(stmt.description);
    } catch (err) {
      skipped.push({
        description: stmt.description,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { applied, skipped };
}
