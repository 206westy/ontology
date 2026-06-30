# Ontology Studio — 통합 PRD v3: 스키마 정합 · 무손실 적재 · 임베딩 · 자연어 추가 · AI 추출 커버리지

> **목표**: 벤치마킹 확정 **6요소 정답 모델**을 (1) Supabase 정의, (2) Neo4j 무손실 적재, (3) 정합 자동 검증, (4) 단일 임베딩으로 dedup·RAG 지원, (5) 자연어 추가가 중복대조 거쳐 안전 반영, (6) **AI 추출이 6요소를 모두(근거+HITL) 채우도록** 유도.
> **버전**: 3.0 (v2 + Claude Code 코드베이스 검증 반영, 임베딩 차원 확정)
> **대상**: Claude Code (페이즈/태스크 단위 순차 구현)

---

## 확정 결정 (Resolved)

| 항목 | 결정 | 비고 |
|---|---|---|
| **임베딩 모델** | OpenAI `text-embedding-3-small` | dedup·RAG 동일 모델 |
| **임베딩 차원/타입** | **`vector(1536)`** (halfvec 불필요) | 1536 < pgvector HNSW 상한 2000 → 네이티브 인덱싱. 저장·속도 이점 |
| **프로퍼티 표현** | **구조 보존(`propsSchema`)** | 벤치마킹 확정 1급 요소. 문자열 평탄화 폐기 |
| **어트리뷰션(출처)** | **1급 요소로 신설** | 공리·제약과 달리 Neo4j로도 운반(RAG 출처 추적) |
| **모델 업그레이드 여지** | `text-embedding-3-large`를 MRL로 1536 출력 시 **차원 호환**(스키마 변경 불필요, 단 전수 재임베딩 필요) | recall 부족 시 |

---

## 정답 모델 — 벤치마킹 확정 6요소 (Palantir / Saltlux)

| # | 요소 | 성격 | 내용 |
|---|------|------|------|
| 1 | 클래스(Class) | TBox | 이름, description, 계층(parent) |
| 2 | 프로퍼티(Property) | TBox | 타입·필수·enum·constraint_rule — **1급, 뭉개기 금지** |
| 3 | 공리(Axiom) | TBox | rule_logic + severity |
| 4 | 제약조건(Constraint) | TBox | cardinality·disjoint·domain_range·property_value |
| 5 | 인스턴스(Instance) | ABox | 이름, 소속 클래스, **instance_values(실제 값)** |
| 6 | 어트리뷰션(Attribution) | 횡단 | **출처** — source_type·evidence·confidence·시점 |
| + | 관계(Relation) | 연결 | relation_type(domain/range) + edge(방향, min/max cardinality) |

---

## 현재 상태 — Claude Code 코드베이스 검증 결과 (3층 대조)

> DB·코드베이스 직접 조사. Supabase/Neo4j/AI프롬프트 3층을 6요소·2층분리 설계에 대조.

### 1) Supabase (스테이징/거버넌스) — ✅ 충족
5요소 + 관계 + 검증결과 + 커밋이력이 모두 테이블/컬럼으로 존재(`schema.ts`). **단, 어트리뷰션은 검증 목록에 없었음 → 본 PRD에서 신설(P1-1).**

### 2) Neo4j (프로덕션 본체) — ⚠️ 거버넌스 분리는 정확, 본체 2건 누락
- 거버넌스(axiom·constraint·cardinality·검증·커밋) 미적재 = 설계대로 ✅
- **property**: `c.속성명 = "[string] required"` 불투명 문자열, **enum·구조 소실** ⚠️ (`cypher-builder.ts:162-172`)
- **instance_values**: **buildCypherStatements에 핸들러 없음 → 전혀 미적재** ❌ (`:305`). Neo4j Instance는 `{id,name,classId}`뿐 → AI가 "Chuck.partNumber=KC0330655"를 못 읽음.
- 추가: 인스턴스에 description 필드 자체가 스키마에 없음.

### 3) AI 자연어→온톨로지 프롬프트 — ❌ 6요소를 모두 채우도록 추천하지 않음 (신규 발견)

| 구성요소 | parse(추출) | assist(수동) | enrich(사후) | 종합 |
|---|---|---|---|---|
| 클래스 이름·계층 | ✅ | ✅ | — | ✅ |
| 클래스 description | ❌ | ✅ | ✅ | ⚠️ parse 누락 |
| 프로퍼티 타입 | ✅(값 있는것) | ✅ | ✅ | ⚠️ |
| 프로퍼티 필수/enum | ❌ | ✅ | ❌ | ⚠️ 수동만 |
| 인스턴스 이름/클래스/값 | ✅ | 부분 | — | ✅ |
| 관계 타입·방향 | ✅(2단계) | ✅ | — | ✅ |
| axiom | ❌ | ❌ | ✅ | ⚠️ 사후만 |
| **constraint 4종** | ❌ | ❌ | ❌ | **❌ AI 경로 0개** |
| edge cardinality | ❌ | ❌ | ❌ | ❌ |
| **어트리뷰션** | (evidence/confidence는 추출되나 미저장) | — | — | **❌ 미연결** |

**핵심 불일치**: parse는 "점(엔티티)+선(관계)"에 집중하도록 설계됨. **constraint는 어떤 AI 흐름에서도 생성 안 됨**(테이블만 있고 채우는 AI 경로 0). axiom은 enrich 사후만. description·필수·enum·cardinality·출처도 AI가 자동 제안하지 않음 → **"자연어 설명 → 6요소 자동 충족"이 현재 미성립.**

### 본 PRD가 메우는 구멍
- **Phase 1**: instance_values 적재(❌→✅), property 구조 보존(⚠️→✅), 인스턴스 description 신설, 어트리뷰션 신설·운반.
- **Phase 2**: 단일 임베딩·dedup·자연어 apply + **AI 추출 커버리지**(parse에 description/출처 자동, enrich에 constraint/필수/enum/cardinality/axiom 제안 — 근거+HITL).
- **Phase 3**: 무손실 E2E·트랜잭션 복구·RAG 스모크(값+출처 포함).

## 아키텍처 원칙 (공통)
1. Supabase = 최신 source of truth / Neo4j = 발행본. add·dedup은 Supabase, RAG 진입점만 Neo4j read.
2. 단일 임베딩: 한 번 계산 → Supabase(dedup) + push 시 Neo4j(RAG) 운반. 재계산 금지.
3. 자동 병합 금지 / HITL. 신규 노드만 사용자 확정.
4. **AI는 근거 있을 때만 제안, 자동 확정 없음**(거버넌스 요소 특히). evidence·confidence 필수.
5. 무손실 라운드트립이 합격선.
- 그래프 변경은 store 액션 경유(pendingChanges/Undo). 인터랙티브 `/api/batch` 금지. shadcn/ui·Lucide·Tailwind v4·CSS 변수, 이모지 금지, 한국어. 마이그레이션 무손실. 푸시 단일 트랜잭션.

---

# PHASE 1 — 6요소 스키마 정합 + 무손실 라운드트립

## P1-1: Supabase 스키마 재정의 (어트리뷰션 신설 + 임베딩 컬럼)
**In**
1. 기존 5요소 보강: `instances.description` 신설(RAG 문맥), property enum/required/constraint/sort 보존 확인, relation domain/range·edge cardinality 보존 확인.
2. **`attributions` 테이블 신설**(다형성): `id, target_table, target_id, source_type('document'|'sap'|'user'|'web'|'inferred'), source_ref, evidence, confidence, created_at`.
3. **임베딩 컬럼**: `classes.embedding`·`instances.embedding` = **`vector(1536)`**(NULL 허용, 생성은 P2).

**파일**: `lib/drizzle/schema.ts`(수정), `lib/drizzle/migrations/*`(신규, 무손실 백필: 기존 노드 출처 'inferred'), `types.ts`·`schemas.ts`(수정).

**수용**: 6요소+관계 전부 존재(어트리뷰션 포함) · 마이그레이션 무손실 · 회귀 없음.

## P1-2: Neo4j 스키마 공식 정의
**In**
1. 라벨/속성 계약:
   - `:Class {id,name,description,color,partition,propsSchema,embedding,_src,_conf,_srcRef}`
   - `:Instance {id,name,classId,partition,description?,embedding,<값들…>,_src,_conf,_srcRef}` — instance_values 평탄화(타입 캐스팅).
   - `:RelationType {id,name,description,domainClassId,rangeClassId}`
   - `propsSchema` = `[{name,dataType,required,enumValues}]`(프로퍼티 1급, 평탄화 금지).
2. 관계: `IS_A`·`INSTANCE_OF`·동적 관계명 + 속성 `min/max_cardinality`,`_src/_conf`.
3. 제약/인덱스: `REQUIRE n.id IS UNIQUE`(Class/Instance/RelationType), id·partition·name 인덱스.
4. 벡터: Class/Instance에 공유 라벨 `:Concept` → `:Concept(embedding)` vector index(1536).
5. idempotent 부트스트랩.

**파일**: `lib/neo4j/schema.ts`(신규), `app/api/neo4j/init/route.ts`(신규), `docs/neo4j-schema.md`(신규).

**수용**: init idempotent · `:Concept` 부여 · 계약 문서↔코드 일치.

## P1-3: cypher-builder 충실도 개선 (손실 제거 — 핵심)
**In**
1. **instance_values 푸시(최우선)**: 인스턴스 ADD/MOD 시 값 조회→노드 속성 평탄화(타입 캐스팅).
2. **propsSchema**로 프로퍼티 구조 보존(기존 `"[string] required"` 폐기).
3. relation domain/range + edge min/max cardinality 반영.
4. **어트리뷰션 운반**: `_src/_conf/_srcRef`.
5. **MERGE 전환**(재푸시·재사용 중복 방지). 롤백 동기화.

**파일**: `lib/neo4j/cypher-builder.ts`(수정), `app/api/neo4j/push/route.ts`(수정: instance_values·attribution 조인), `__tests__/lib/cypher-builder.test.ts`(수정).

**수용**: Neo4j 인스턴스에 실제 값 존재(`processTemp=250`) · propsSchema 구조 보존 · domain/range·cardinality 반영 · 노드/관계에 `_src/_conf` · 재푸시 중복 0.

## P1-4: 라운드트립 검증 하니스
**In**
1. 대조: 노드/관계 수 + 핵심 속성 체크섬(instance_values·attribution 포함).
2. `POST /api/neo4j/reconcile` → `{ok, diffs}`.
3. 6요소 전부 포함 시드 픽스처.
4. 시드→push→reconcile 무차이 자동 테스트(CI).

**파일**: `app/api/neo4j/reconcile/route.ts`(신규), `__tests__/integration/roundtrip.test.ts`(신규), `features/ontology/constants/fixtures/full-model.ts`(신규).

**수용**: 6요소 시드 push 후 무차이 · 의도적 손실(값/출처) 시 diff 탐지.

---

# PHASE 2 — 단일 임베딩 + 중복대조 + 자연어 추가 + AI 추출 커버리지

## P2-1: 임베딩 정책 (확정 반영)
- 모델 `text-embedding-3-small`, 차원 **1536**, 타입 **`vector(1536)`**(halfvec 불필요).
- 대상 텍스트: `name + " — " + description`(+인스턴스 핵심 값 일부). 타입·구획은 임베딩 미포함, 필터로.
- 갱신: name/description(핵심 값) 변경 시에만 재임베딩.
- 성장 경로(문서): pgvector HNSW → pgvectorscale DiskANN(버퍼 초과 시) → Qdrant(고QPS 병목 시). **현 규모(수천 노드)는 pgvector로 충분.**
- 산출물 `docs/embedding-policy.md`.

## P2-2: Supabase 임베딩 생성 + 인덱스 (dedup 기반)
**In**
1. `vector` 확장 활성화.
2. 노드 write 후 **백그라운드** 임베딩 계산·업서트(실패 재시도). store write 논블로킹.
3. `vector(1536)` HNSW(cosine) + 필터 컬럼(partition/type) + full-text/trigram(오타). 0.8+ `iterative_scan` 필터 recall 보완.

**파일**: `lib/drizzle/migrations/*`(신규: HNSW+full-text), `features/ontology/lib/embedding.ts`(신규), `features/ontology/store/*`(수정: 비동기 트리거).

**수용**: write 시 임베딩 채움(지연 허용) · vector(1536) HNSW 정상 · 필터+벡터 동작 · 오타 텍스트 매칭.

## P2-3: 임베딩 Neo4j 운반 + 벡터 인덱스 (RAG 진입점)
**In**
1. push 시 **같은 벡터**를 `:Concept.embedding`으로 운반(재계산 금지).
2. `:Concept(embedding)` vector index 채움. 질의는 2026.01 권장 Cypher `SEARCH` 절.
3. `POST /api/rag/entrypoint`: 질문 임베딩→`:Concept` top-k→진입 노드 id.

**파일**: `lib/neo4j/cypher-builder.ts`(수정), `lib/neo4j/schema.ts`(수정), `app/api/rag/entrypoint/route.ts`(신규).

**수용**: push 후 Neo4j embedding = Supabase 벡터 · 진입점 검색 동작.

## P2-4: 편집 시점 중복대조 API (후보→LLM 판정, 자동병합 금지)
**In**
1. `POST /api/dedup/candidates`: 입력 임베딩→pgvector top-k + full-text 합집합.
2. `POST /api/llm/resolve`: `{decision:'reuse'|'relate'|'possible_duplicate'|'new', targetId?, relationType?, confidence, reason}`. 제약: "이름 비슷해도 종류 다르면 동일 아님(부품 Chuck vs 파라미터 Chuck 온도)."
3. 임계치 가드(미만 시 `new`).
4. `possible_duplicate`→기존 `EntityResolutionSheet`/`ontology:duplicate-check`로 라우팅(자동 병합 금지).

**파일**: `app/api/dedup/candidates/route.ts`(신규), `app/api/llm/resolve/route.ts`(신규), `schema-context-builder.ts`(확장), `api.ts`(수정).

**수용**: 기존 Chuck→새 Chuck=reuse(생성0) · Chuck vs Chuck온도=relate/new · 동의어=possible_duplicate→ER · 후보 top-k만 LLM.

## P2-5: AIAssistantTab "apply" (자연어→dedup 프리뷰→store write)
**In**
1. 입력→`llmApi.parse()`(2단계)→엔티티/관계.
2. dedup 판정→항목 배지: reuse/relate/possible_duplicate/new.
3. 확정 시 **store 액션만**(addClass/addInstance/addEdge/addRelationType). reuse=스킵, relate=기존 id 엣지만. 신규 노드에 어트리뷰션(source_type='user') 기록. `/api/batch` 금지.
4. write 후 `focusNode`, pendingChanges→CommitBar.

**파일**: `AIAssistantTab.tsx`(수정), `NewNodePopover.tsx`(재사용).

**수용**: 배지 구분 표시 · 확정 시 즉시 렌더+pendingChanges 누적 · reuse 중복0 · 신규 노드 출처 기록.

## P2-6: parse 추출 커버리지 보강 (description + 어트리뷰션 자동) — 신규
### 배경
검증 결과: parse가 클래스 description을 추출하지 않고, evidence/confidence는 뽑지만 `attributions`에 저장되지 않음.
### In
1. parse Stage가 **근거 있을 때 클래스/인스턴스 description 추출**(원문에 정의가 있을 때만, 없으면 비움 — 환각 금지).
2. **어트리뷰션 자동 연결**: parse가 만든 모든 신규 노드/관계에 `source_type`(입력 출처에서 결정: 문서/사용자/SAP/웹) + `evidence`(원문 스팬) + `confidence`를 `attributions`에 자동 기록. **LLM 추측이 아니라 입력 출처 기반.**
3. parse를 거버넌스로 과적재하지 않음 — description·출처만 추가, 제약/공리는 P2-7로 분리.
### 파일
`features/ontology/lib/parse-prompts.ts`(수정: description 추출 규칙), `app/api/llm/parse/route.ts`(수정), apply 경로(수정: attributions 기록).
### 수용
- [ ] 원문에 정의 있는 노드는 description 채움, 없으면 빈 채로(억지 생성 안 함).
- [ ] parse로 생성된 노드/관계에 출처·evidence·confidence가 attributions에 남음.

## P2-7: 거버넌스 제안 레이어 (constraint·axiom·필수·enum·cardinality — HITL) — 신규
### 배경
검증 결과: **constraint 4종은 AI 경로 0개**(순수 수동), axiom은 enrich 사후만, property 필수/enum·edge cardinality도 AI 미채움. v3 기획이 의도한 "자연어→제약 변환"이 미연결.
### 목표
**enrich 흐름을 확장**해, 텍스트 근거가 있을 때 거버넌스 요소를 **제안**(자동 적용 금지·HITL·evidence 필수). parse는 그대로 가볍게 유지.
### In
1. **constraint 제안**: "장비는 반드시 1개 이상 Site"→cardinality, "DryAsher·WetStation 배타"→disjoint, 관계 소스/타겟 제한→domain_range, 값 범위/패턴→property_value. 각 제안에 evidence+confidence+"검증 필요" 배지.
2. **property 필수/enum 제안**: 값 패턴에서 enum 후보, 누락 빈도에서 필수 후보.
3. **edge cardinality 제안**: 관계 다중성 추정.
4. **axiom 제안 유지·강화**(기존 enrich `missing_axiom`).
5. **모두 HITL**: 제안 카드 → 사용자 승인 시에만 store 액션으로 반영(자동 확정 0). 반영 시 어트리뷰션(source_type='inferred'/'user') 기록.
### API/파일
`app/api/llm/enrich/suggest-governance/route.ts`(신규: constraint·필수·enum·cardinality 제안), `features/ontology/lib/gap-detector.ts`(확장), enrich 제안 UI(수정: 거버넌스 카드 + 승인).
### 수용
- [ ] "장비는 Site에 반드시 위치" 류 문장 → cardinality constraint **제안**(자동 적용 X).
- [ ] enum 패턴 → enum 후보 제안. 관계 다중성 → cardinality 제안.
- [ ] 모든 거버넌스 제안에 evidence+confidence, 승인 전 미반영.
- [ ] 승인 시 store 액션 경유로 constraints/axioms 테이블에 기록 + 출처 남김.

---

# PHASE 3 — E2E 검증 + 정합성 보증 + RAG 스모크

## P3-1: 트랜잭션 푸시 + reconciliation 복구
**In**: 단일 트랜잭션 푸시(부분 실패 전체 롤백) · AIAssistantTab apply→기존 commit→`/api/neo4j/push` 연결(새 경로 금지) · `commits.pushed_to_neo4j`+Neo4j `:_SyncState{commit_id,hash}` · diff 시 **Supabase 기준 재푸시**.
**수용**: 강제 실패 시 부분 반영0 · apply→커밋→푸시 시 재사용 중복0(MERGE) · add 단계 Neo4j read 0 · diff→재푸시 복원.

## P3-2: 대규모 라운드트립 + 임베딩 성능
**In**: 수천 노드(6요소) 시드→push→reconcile 무차이 · 임베딩 생성/인덱스/검색 지연 측정, HNSW 메모리 관찰.
**수용**: 대규모 무손실 · 벡터검색 지연 예산 내(측정치 문서화).

## P3-3: RAG 스모크 (진입점→다중홉→문맥, 값·출처 포함)
**In**: 질문→`:Concept` 진입점→Cypher 다중홉(증상→원인→조치→작업방법)→문맥 수집. **손실 제거 최종 검증**: 문맥에 (a) 인스턴스 실제 값, (b) 어트리뷰션(출처·confidence) 포함.
**수용**: N홉 확장 수집 · 문맥에 값+출처 함께(myATHENA 출처 추적 가능).

## P3-4: 회귀 게이트 (CI)
**In**: roundtrip·reconcile·cypher-builder·임베딩·dedup·**거버넌스 제안** 테스트를 CI 필수 게이트로. 스키마 계약↔코드 드리프트 감지.
**수용**: CI 자동 차단 · 계약 위반 시 빌드 실패.

---

## 페이즈 요약

| 페이즈 | 한 줄 | 합격선 |
|---|---|---|
| **Phase 1** | 6요소(어트리뷰션 포함) Supabase 정의 + Neo4j 무손실 적재 + 정합 | reconcile 무차이, instance_values·출처 살아있음 |
| **Phase 2** | 단일 임베딩(small/1536) + 자연어 추가(dedup) + **AI가 6요소를 근거·HITL로 제안** | 동일 벡터 양쪽, reuse 중복0, constraint/axiom AI 제안 경로 존재 |
| **Phase 3** | 대규모 E2E + 트랜잭션 복구 + RAG 스모크(값·출처) | 무손실·롤백·CI 차단, 문맥에 값+출처 |

## 변경 이력
- **v3**: Claude Code 코드베이스 검증 반영 — AI 추출 커버리지 구멍 발견(constraint AI 경로 0, axiom 사후만, description/필수/enum/cardinality/출처 미연결) → **P2-6(parse description+출처 자동)·P2-7(거버넌스 HITL 제안)** 신설. **임베딩 `text-embedding-3-small`/`vector(1536)` 확정**(halfvec 제거).
- v2: 6요소 명문화(어트리뷰션 1급 추가, 프로퍼티 구조 보존), `PRD-AI-Apply-with-Dedup` 통합.