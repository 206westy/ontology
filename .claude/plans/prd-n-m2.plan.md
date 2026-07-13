# Plan: PRD-N M2 — 추론 격리: 구획 스코프 질의

**Source PRD**: `docs/진행중/PRD-N.md` (§M2, B-6 승계)
**Selected Milestone**: M2 — Text2Cypher/RAG 구획 스코프 (M1 완료 후 다음 착수분)
**Complexity**: Medium (라우트 2 + UI 1 + 스키마/클라이언트, 신규 파일 최소·기존 수정 위주)
**앱 루트(명령 실행 위치)**: `ontology/ontology/ontology/` · 이하 경로는 그 아래 `src/` 기준
**선행 환경**: Neo4j 질의는 PRD-M M0(Docker `neo4j-onto`) 가동 기준(PRD-N 비고)

---

## Summary

질의/탐색이 기본적으로 **현재 구획 내에서만** 동작하게 한다. Neo4j 노드는 이미 `partition` 속성(+ `class_partition`/`instance_partition` 인덱스)을 갖고 있으므로, Text2Cypher는 생성 Cypher에 `WHERE n.partition = $partition`을 **서버 바인딩 파라미터**로 강제하고, RAG entrypoint는 벡터 후보를 partition으로 필터한다. "전체 구획 질의" 토글(기본 OFF)일 때만 무스코프. 스코프 미지정 시 기존 동작을 보존해 회귀 0.

## 핵심 설계 결정 (분석 근거)

1. **`$partition` 서버 바인딩으로 결정론 스코프.** `executeCypherQuery`가 `tx.run(query, { partition })`로 값을 항상 주입([text2cypher/route.ts:105](../../ontology/src/app/api/llm/text2cypher/route.ts#L105)). LLM은 리터럴 대신 `$partition`만 참조하면 되고, 값은 서버가 통제 → 프롬프트 유출·오타 무관. 노드 속성명은 확인된 `partition`([cypher-builder.ts:191](../../ontology/src/lib/neo4j/cypher-builder.ts#L191), [schema.ts:58](../../ontology/src/lib/neo4j/schema.ts#L58) 인덱스).
2. **하드블록 대신 프롬프트 강제 + 사후 오염 측정.** 메타모델(라벨=Class/Instance/Concept, 도메인명=`name` 속성) 쿼리는 형태가 다양해 "WHERE 누락 시 실행 거부"는 정상 쿼리를 깬다. 대신 (a) 시스템 프롬프트에 "모든 개념 매치는 `n.partition = $partition` 필수" 강제 + (b) 실행 결과에서 `partition ≠ 현재`인 행을 세어 **교차 구획 오염률**(M2 지표)로 응답에 실어 가시화. 위험 대비 균형(PRD 리스크: 회귀 Low).
3. **스코프 미지정 = 기존 동작.** `partitionId` 없거나 `allPartitions`면 파라미터·프롬프트 주입 생략 → 기존 text2cypher/RAG 테스트 회귀 0.
4. **RAG는 over-fetch 후 필터.** Neo4j 5 벡터 인덱스는 `queryNodes` 내부 WHERE 미지원 → `queryNodes($index, $k*OVERSAMPLE, $vector) YIELD node,score WHERE node.partition=$partition RETURN ... LIMIT $k` 패턴.
5. **전환 시 컨텍스트 리셋.** `currentPartitionId` 변경 시 Text2CypherTab의 결과/생성 Cypher를 비워 triple 섞임 방지(PRD "전환 시 질의 컨텍스트 리셋").

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Cypher 파라미터 바인딩 | `src/app/api/llm/text2cypher/route.ts:105` (`tx.run(query)`) | `tx.run(query, params)`로 `$partition` 주입 |
| 벡터 스코프 | `src/app/api/rag/entrypoint/route.ts:34-40` | `queryNodes` + `WHERE node.partition` + LIMIT |
| 읽기 전용 가드 | `route.ts:6,92` (`findWriteClauseViolation`) | 스코프도 read 트랜잭션 안에서 |
| zod 스키마 | `src/features/ontology/lib/schemas.ts:662` (`text2CypherRequestSchema`) | optional 필드 추가(back-compat default) |
| API 클라이언트 | `src/features/ontology/api.ts:729` (`text2CypherApi`) | req 타입 확장 |
| store 구독(UI) | `src/features/ontology/components/Text2CypherTab.tsx:421-422` | `currentPartitionId`/`partitions` 추가 구독 |
| 구획 배지 | `PartitionSwitcher.tsx` · `Text2CypherTab.tsx:866` (Badge) | 현재 구획/전체 배지 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `src/features/ontology/lib/schemas.ts` | UPDATE | `text2CypherRequestSchema`에 `partitionId?`·`allPartitions?` |
| `src/app/api/llm/text2cypher/route.ts` | UPDATE | 스코프 프롬프트 + `$partition` 바인딩 + 오염률 측정 |
| `src/lib/neo4j/scope.ts` | CREATE | 스코프 프롬프트 블록·오염 계산 순수 헬퍼(테스트 대상) |
| `src/lib/neo4j/scope.test.ts` | CREATE | 헬퍼 단위 테스트(TDD) |
| `src/app/api/rag/entrypoint/route.ts` | UPDATE | `partitionId` 파라미터 + 벡터 후보 partition 필터 |
| `src/features/ontology/api.ts` | UPDATE | `Text2CypherRequestInput`/`text2CypherApi` 확장 + RAG 클라이언트(있으면) |
| `src/features/ontology/components/Text2CypherTab.tsx` | UPDATE | 전체 질의 토글·구획 배지·출처 구획·전환 리셋 |
| `src/app/api/llm/text2cypher/route.test.ts` | CREATE | 스코프 주입/back-compat 라우트 테스트 |

## Tasks

### Task 0: 준비
- **Action**: Neo4j(Docker `neo4j-onto`) 가동 확인. PRD-N은 이미 `진행중/`이라 칸반 이동 불필요.
- **Validate**: `npm run neo4j:verify` 또는 `/api/neo4j/status` 200 connected

### Task 1: 스코프 순수 헬퍼 (TDD)
- **Action**: `src/lib/neo4j/scope.ts` — `buildScopeSystemBlock(partitionId | null): string`(스코프 지시문, 무스코프면 ''), `countCrossPartition(rows, partitionId): { total, foreign }`(결과 행에서 `partition ≠ pid` 노드 계수 — 재귀적으로 node.partition 수집). 순수.
- **Mirror**: `Text2CypherTab.tsx:41` `extractNodeIds`(재귀 수집 패턴)
- **Validate**: `npm test -- neo4j/scope`

### Task 2: 스키마 + 클라이언트
- **Action**: `text2CypherRequestSchema`에 `partitionId: looseUuid().nullable().optional()`, `allPartitions: z.boolean().optional().default(false)`. `Text2CypherRequestInput`/`text2CypherApi.generate` 타입 반영.
- **Mirror**: `schemas.ts:662`, `api.ts:729`
- **Validate**: `npx tsc --noEmit`

### Task 3: Text2Cypher 라우트 스코프
- **Action**: `partitionId`·`allPartitions` 수신. `scoped = partitionId && !allPartitions`. scoped면 (a) system 프롬프트에 `buildScopeSystemBlock(partitionId)` 추가("그래프는 단일 구획 스코프 — 모든 개념 매치에 `WHERE n.partition = $partition` 필수, 값 하드코딩 금지"), (b) `executeCypherQuery(query, scoped ? { partition: partitionId } : {})`로 바인딩, (c) 실행 결과에 `countCrossPartition` → 응답에 `crossPartition` 필드(오염 가시화). 무스코프면 전부 생략(기존 경로). read 전용 가드 유지.
- **Mirror**: `route.ts:89-126,151-217`
- **Validate**: `npm test -- text2cypher`, 수동: 스코프 질의가 타 구획 노드 미포함

### Task 4: RAG entrypoint 스코프
- **Action**: `requestSchema`에 `partitionId?`. 있으면 `queryNodes($index, $k*OVERSAMPLE, $vector) YIELD node, score WHERE node.partition = $partition RETURN ... LIMIT $k`(OVERSAMPLE 상수, 예 5). `RagEntryNode`에 `partition` 추가.
- **Mirror**: `rag/entrypoint/route.ts:34-47`
- **Validate**: 수동/통합: 진입 노드가 스코프 준수

### Task 5: Text2CypherTab UI
- **Action**: store에서 `currentPartitionId`·`showAllPartitions`·`partitions` 구독. 로컬 `allPartitionsQuery`(기본 false) 토글 UI(모드 토글 옆). `generate`에 `partitionId`(scoped 시)·`allPartitions` 전달. 현재 구획명 배지(scoped)/"전체 구획" 배지. 결과가 `partition` 컬럼 보유 시 id→이름 매핑 표기(전체 질의 출처). `useEffect`로 `currentPartitionId` 변경 시 결과·Cypher 리셋.
- **Mirror**: `Text2CypherTab.tsx:405-539,802-872`, 배지 `:866`
- **Validate**: `npm test`(있으면 Tab 테스트), 수동: 토글·배지·전환 리셋

### Task 6: 통합 검증
- **Action**: 빌드·린트·전체 테스트 그린 + 수동 라이브(스코프 격리·전체 질의 출처·RAG 스코프).
- **Validate**: 아래 Validation

## Validation

```bash
cd ontology/ontology/ontology
npm test            # 회귀 0 + 신규
npm run lint
npx tsc --noEmit    # dev 서버 구동 중이면 next build 대신(.next 충돌 회피)
```

수동(라이브, Neo4j 필요): 반도체 구획에서 "모든 장비 보여줘" → 반도체 노드만 / 전체 질의 토글 → 타 구획 포함 + 출처 구획 표기 / RAG 진입 노드 스코프 준수 / 구획 전환 시 이전 결과 사라짐.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| LLM이 `$partition` WHERE 누락 → 교차 오염 | Med | `$partition` 서버 바인딩 + 강한 프롬프트 + 사후 오염률 응답 노출(가시화). 하드블록은 메타모델 다양성 때문에 회피 |
| 기존 text2cypher/RAG 테스트 회귀 | Low | 스코프 미지정(또는 allPartitions) 시 파라미터·프롬프트 주입 생략 = 기존 경로 보존 |
| Neo4j 미가동 시 검증 불가 | Med | Task 0에서 status 확인, PRD-M M0 환경 전제 |
| 직접 Cypher 입력 모드는 사용자 원저작 | Low | direct 모드는 스코프 강제 안 함(원저작 존중), 현재 구획 배지만 표기 |
| 전체 질의 출처 표기가 결과에 partition 컬럼 필요 | Low | scoped=off 시 프롬프트가 `n.partition` RETURN 포함 유도 + UI는 있을 때만 표기(없으면 생략) |

## Acceptance (PRD-N §M2 수용 기준)

- [ ] 기본 질의가 현재 구획만 대상(다른 구획 노드가 결과에 안 섞임)
- [ ] 전체 질의 토글 시에만 교차, 결과에 출처 구획 표시
- [ ] RAG 진입 노드가 구획 스코프를 따름
- [ ] 기존 text2cypher 테스트 회귀 0(스코프 미지정 시 기존 동작 보존)
- [ ] `npm test`·lint·타입 그린

## 지표 (PRD 성능표)

- 교차 구획 오염률(스코프 질의 결과 내 타 구획 비율) → **0** — `countCrossPartition`로 측정·응답 노출.
