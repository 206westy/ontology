# Neo4j 스키마 계약 (PRD-E Phase 1)

> Neo4j(발행본)의 라벨·속성·관계·인덱스 계약. 코드(`src/lib/neo4j/schema.ts`, `src/lib/neo4j/cypher-builder.ts`)가 이 문서를 따른다. 부트스트랩은 `POST /api/neo4j/init` (idempotent).

## 라벨 & 속성

### `:Class:Concept`
| 속성 | 타입 | 설명 |
|---|---|---|
| `id` | string (UNIQUE) | Supabase classes.id |
| `name` | string | 클래스 이름 |
| `description` | string | 설명 |
| `color` | string | UI 색상 |
| `partition` | string | 소속 구획 id (PRD-B B-1) |
| `propsSchema` | string(JSON) | `[{name,dataType,required,enumValues}]` 직렬화 — **프로퍼티 1급, 평탄화 금지** |
| `embedding` | float[] | text-embedding-3-small (1536) — 생성은 P2 |
| `_src` / `_conf` / `_srcRef` | string / float / string | 어트리뷰션 운반 (source_type / confidence / source_ref) |

### `:Instance:Concept`
| 속성 | 타입 | 설명 |
|---|---|---|
| `id` | string (UNIQUE) | Supabase instances.id |
| `name` | string | 인스턴스 이름 |
| `classId` | string | 소속 클래스 id |
| `partition` | string | 소속 클래스의 구획 상속 |
| `description` | string | RAG 문맥 (P1-1 신설) |
| `<값들…>` | 캐스팅된 원시값 | instance_values 평탄화 (예: `processTemp=250` 정수) |
| `embedding` | float[] | text-embedding-3-small (1536) — 생성은 P2 |
| `_src` / `_conf` / `_srcRef` | string / float / string | 어트리뷰션 운반 |

### `:RelationType`
| 속성 | 타입 | 설명 |
|---|---|---|
| `id` | string (UNIQUE) | Supabase relation_types.id |
| `name` | string | 관계 타입 이름 |
| `description` | string | 설명 |
| `domainClassId` | string | 도메인(source) 클래스 id |
| `rangeClassId` | string | 치역(target) 클래스 id |

## 관계

| 관계 | 방향 | 속성 |
|---|---|---|
| `:IS_A` | (child:Class)→(parent:Class) | — |
| `:INSTANCE_OF` | (i:Instance)→(c:Class) | — |
| `:<동적 관계명>` | (a)→(b) | `id`, `relationTypeId`, `bridge`, `min_cardinality`, `max_cardinality`, `sourceKind`, `targetKind`, `_src`, `_conf`, `_srcRef` |

동적 관계명은 relation_types.name 을 대문자/언더스코어로 정규화(`located at` → `LOCATED_AT`).

## 제약 & 인덱스 (`src/lib/neo4j/schema.ts`)

- 고유 제약: `Class.id`, `Instance.id`, `RelationType.id`
- 인덱스: `Class(partition)`, `Class(name)`, `Instance(partition)`, `Instance(classId)`, `Instance(name)`, `RelationType(name)`
- 벡터 인덱스: `concept_embedding` — `:Concept(embedding)`, dimensions 1536, similarity `cosine`

## 멱등성 원칙

- 노드/관계 적재는 `MERGE (n {id})` 기반 → 재푸시 중복 0.
- 스키마 부트스트랩은 모두 `IF NOT EXISTS` → 반복 실행 안전.
