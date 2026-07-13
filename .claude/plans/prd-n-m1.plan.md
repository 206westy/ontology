# Plan: PRD-N M1 — AI 자동 구획 제안 + bridge 연결

**Source PRD**: `docs/진행전/PRD-N.md` (§M1, B-5 승계)
**Selected Milestone**: M1 — AI 자동 구획 제안(HITL) + bridge 연결 (권장 순서상 첫 착수분)
**Complexity**: Large (신규 API 1 + 순수 결정 코어 + 2,485줄 파일 통합 + 구획 생성 배선 + import 시딩 변경)
**앱 루트(명령 실행 위치)**: `ontology/ontology/ontology/` · 이하 경로는 그 아래 `src/` 기준

---

## Summary

parse 파이프라인 위에 **구획 판정**을 얹어, 추출분이 현재 구획과 연결성이 낮으면 "새 구획 분리"를, 일부만 겹치면 bridge를 제안한다(전부 HITL, 자동 확정 없음). 1차 판정은 **결정론**(추출↔현재 구획 이름겹침 + `analyzeConnectivity`)이고, LLM은 새 구획 **이름 + 정성 근거**에만 1회 호출된다(비용 절제). 연결성이 높으면 **무소음 attach**. 기구현 자산(`analyzeConnectivity`·`buildBridgeSuggestions`·`BridgeSuggestCard`·`ConfirmCard`·`useCreatePartition`)을 재사용하고, 신규 표면은 판정 코어·API·프리뷰 밴드·템플릿 시딩 귀속으로 한정한다.

## 핵심 설계 결정 (분석 근거)

1. **결정론 우선 / LLM 최소.** 판정(attach·new·bridge)은 순수 함수. 추출 엔티티 이름과 현재 구획 노드 이름의 겹침률로 분기하고, `analyzeConnectivity`로 내부 섬 구조를 기술한다. LLM(`generateText` + `Output.object`)은 decision≠attach일 때만 새 구획 이름·근거 1회 생성 — `enrich/detect/route.ts:75-83` 패턴 그대로.
2. **이름 매칭은 trigram 단독.** 프리뷰 시점의 추출분은 아직 미영속 → 임베딩 없음. `combinedMatchScore(null, trigramScore)`가 vectorScore=null을 이미 처리(`cross-partition.ts:69`). 임계 `MATCH_CANDIDATE_THRESHOLD=0.5` 재사용.
3. **partition_id는 기존 경로로 스레딩 — store `addPartition` 불필요.** `addClass`가 `data.partitionId ?? currentPartitionId ?? DEFAULT`로 귀속(`entity-slice.ts:74`). 새 구획은 `useCreatePartition`(서버 생성) 후 그 id를 `handleConfirm`의 `addClass({ partitionId })`와 `stableEntityId(name,'class',newId)`에 주입. PartitionSwitcher가 쓰는 검증된 패턴(`PartitionSwitcher.tsx:30-42`)을 미러링.
4. **무소음 attach.** 겹침률이 높으면 제안 카드 없음(수용 기준). 밴드는 new·bridge에서만 렌더.
5. **임계값은 튜닝 가능 상수.** 과잉 분리 오탐(High 리스크) 대응 — 판정 임계를 named const로 노출.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 순수 판정 코어 | `src/features/ontology/lib/gap-detector.ts` (detectDeterministicGaps) · `lib/validate/connectivity.ts:61` | 결정론 스캔을 순수 함수로 분리, 라우트/테스트 공유 |
| LLM 정성 호출 | `src/app/api/llm/enrich/detect/route.ts:75-85` | `generateText` + `Output.object({schema})` + `LLM_MODELS.primary` + `reasoningEffort:'low'`, try/catch로 실패해도 결정론 결과 보존 |
| API 라우트 | `src/app/api/llm/parse/route.ts:14-49` | `zod safeParse`→400 `flatten()`, catch→500 `{error}` |
| API 클라이언트 | `src/features/ontology/api.ts:358-365` (`llmApi.parse`) | `fetch`+`handleResponse<T>`, req/res 타입 명시 |
| 프리뷰 컨펌 카드 | `src/features/ontology/components/preview/EnrichmentCard.tsx` · `bridge/BridgeSuggestCard.tsx` | `ConfirmCard` 4단 문법(판정→근거→미리보기→액션) |
| 구획 서버 생성 | `src/features/ontology/components/PartitionSwitcher.tsx:30-42` | `useCreatePartition().mutateAsync({name,color})`→`selectPartition(id)`; PALETTE 색 |
| zod 스키마 | `src/features/ontology/lib/schemas.ts:16-37` (createPartitionSchema, parseRequestSchema) | `looseUuid()`·`z.object`·`z.infer` export |
| 테스트 | `lib/bridge/cross-partition.test.ts` · `lib/__tests__/confirm-triage.test.ts` · `__tests__/components/NewNodePopover-triage.test.tsx` | vitest, 콜로케이션 `*.test.ts(x)`, AAA |

## Files to Change

| File | Action | Why |
|---|---|---|
| `src/features/ontology/lib/partition/suggest.ts` | CREATE | 순수 판정 코어 `decidePartitionScope()` — 겹침률+`analyzeConnectivity`→attach/new/bridge |
| `src/features/ontology/lib/partition/suggest.test.ts` | CREATE | 판정 코어 단위 테스트(TDD, 임계 경계 포함) |
| `src/features/ontology/lib/schemas.ts` | UPDATE | `partitionSuggestRequestSchema`/`partitionSuggestResponseSchema` + `z.infer` 타입 |
| `src/app/api/llm/partition/suggest/route.ts` | CREATE | 결정론 판정 + (new/bridge 시) LLM 명명 1회 |
| `src/app/api/llm/partition/suggest/route.test.ts` | CREATE | 라우트 검증(스키마 오류 400, attach 무LLM, new 명명) |
| `src/features/ontology/api.ts` | UPDATE | `partitionSuggestApi` + req/res 타입 |
| `src/features/ontology/components/preview/PartitionSuggestCard.tsx` | CREATE | new/bridge 제안 밴드(ConfirmCard 재사용, bridge는 BridgeSuggestCard) |
| `src/features/ontology/components/preview/PartitionSuggestCard.test.tsx` | CREATE | 카드 렌더/액션 테스트 |
| `src/features/ontology/components/NewNodePopover.tsx` | UPDATE | parse 후 판정 호출·밴드 렌더(트리아지 상단)·confirm 시 partitionId/bridge 스레딩 |
| `src/app/api/import/route.ts` | UPDATE | `insertOntology`가 optional `partitionId`를 classes에 스탬프 |
| `src/features/ontology/lib/schemas.ts` (import) | UPDATE | `importRequestSchema`에 optional `partitionId` |
| `src/features/ontology/components/EmptyState.tsx` | UPDATE | 템플릿 확정 다이얼로그에 "새 구획으로 시딩"(기본 on)→구획 생성+merge import |

## Tasks

### Task 0: 칸반 이동 (확정 직후 최초 실행)
- **Action**: `docs/진행전/PRD-N.md`→`docs/진행중/`로 이동, `docs/STATUS.md` 상태표 갱신(CLAUDE.md 칸반 규칙). 사용자에게 "진행중으로 옮기고 M1 착수" 고지.
- **Mirror**: CLAUDE.md "기획 문서 칸반 규칙"
- **Validate**: `docs/진행중/PRD-N.md` 존재, STATUS.md 반영

### Task 1: 판정 코어 순수 함수 (TDD)
- **Action**: `decidePartitionScope({ entities, relations, currentPartitionNodeNames, options })` 구현. (1) 각 추출 엔티티 이름을 현재 구획 노드 이름과 `combinedMatchScore(null, trigram)`로 매칭→matched/unmatched 분리. (2) `analyzeConnectivity(추출노드, 추출관계)`로 내부 섬 기술. (3) 겹침률 `matched/total`로 분기: `≥ATTACH_MIN`→`attach`, `≈0`→`new`, 그 사이→`bridge`. 반환 `{decision, matched, unmatched, connectivity, bridgeCandidates}`. 임계는 named const(`ATTACH_MIN`, `NEW_MAX`).
- **Mirror**: `gap-detector.ts` 결정론 분리 + `connectivity.ts:61` 재사용 + `cross-partition.ts:58` `buildBridgeSuggestions`로 bridgeCandidates 구성(sourcePartition=신규placeholder, targetPartition=현재, trigramScore 세팅, vectorScore=null)
- **Validate**: `npm test -- suggest` — 반도체+행정 혼합→bridge, 순수 이질→new, 동일 도메인→attach, 빈 입력 경계

### Task 2: zod 스키마
- **Action**: `partitionSuggestRequestSchema = { entities: [{name,nodeKind}], relations: [{source,target}], currentPartitionId: looseUuid, partitionsSummary: [{id,name}] , currentPartitionNodeNames: string[] }`, `partitionSuggestResponseSchema = { decision: enum, suggestedPartitionName?, bridges?: BridgeSuggestion[], rationale }`. `z.infer` export.
- **Mirror**: `schemas.ts:16` createPartitionSchema, `:545` parseRequestSchema, `cross-partition.ts:31` BridgeSuggestion 형태
- **Validate**: 타입 컴파일(`npm run build` 또는 `tsc`), 스키마 파싱 단위 테스트

### Task 3: API 라우트 (TDD)
- **Action**: `POST /api/llm/partition/suggest` — `safeParse`→400, `decidePartitionScope` 호출, `decision!=='attach'`일 때만 `generateText`+`Output.object({suggestedPartitionName, rationale})`(기존 구획명 충돌 회피 프롬프트), 실패해도 결정론 결과+fallback 이름 반환, catch→500.
- **Mirror**: `enrich/detect/route.ts:20-52,75-85`, `parse/route.ts:14-49`
- **Validate**: `npm test -- partition/suggest` (attach는 LLM 미호출 검증 위해 모델 모킹), 스키마 오류 400

### Task 4: API 클라이언트
- **Action**: `partitionSuggestApi.suggest(input): Promise<PartitionSuggestResult>` + req/res 인터페이스. `handleResponse<T>` 사용.
- **Mirror**: `api.ts:358-365` llmApi.parse
- **Validate**: `npm run build`

### Task 5: PartitionSuggestCard 프리뷰 컴포넌트 (TDD)
- **Action**: `decision==='new'`→`ConfirmCard`(eyebrow="구획 제안", verdict/attention, title="다른 도메인으로 보입니다 — 새 구획 '○○'로 분리?", evidence=rationale, actions=[분리·현재 구획 유지]). `decision==='bridge'`→새 구획 카드 + `bridges.map(BridgeSuggestCard)`. `attach`→null.
- **Mirror**: `preview/EnrichmentCard.tsx`, `bridge/BridgeSuggestCard.tsx:48-88`
- **Validate**: `npm test -- PartitionSuggestCard` (new/bridge/attach 렌더 분기, onAccept/onDismiss 콜백)

### Task 6: NewNodePopover 통합
- **Action**: (a) `handleGenerate`의 `mapParseResult` 직후 `partitionSuggestApi.suggest` 호출→`partitionDecision` state. (b) 트리아지 요약(`data-testid="triage-summary"`, `:2102`) **위**에 `<PartitionSuggestCard>` 렌더. (c) 사용자가 "분리/bridge 연결" 수락 시 `useCreatePartition`으로 서버 구획 생성→`chosenPartitionId` state. (d) `handleConfirm`(`:1022`)에서 `const partition = chosenPartitionId ?? currentPartitionId ?? DEFAULT`로 교체(`:1045`), `addClass({...cls, partitionId: partition})` 주입, bridge 수락분은 `bridgesApi.create` 또는 확정 후 `addEdge(isBridge)`. attach는 기존 경로 무변.
- **Mirror**: `NewNodePopover.tsx:800-856,1022-1107`, `PartitionSwitcher.tsx:30-42`
- **Validate**: `npm test -- NewNodePopover` 회귀 0, 수동: 반도체 구획에서 행정 문서 붙여넣기→분리 카드

### Task 7: 템플릿 시딩 → 새 구획 귀속
- **Action**: (a) `importRequestSchema`에 optional `partitionId`; `import/route.ts` `insertOntology`가 값 있으면 `classes.values({..., partitionId})` 스탬프. (b) `EmptyState` 확정 다이얼로그에 체크박스 "새 구획으로 시딩"(기본 on): on→`useCreatePartition`으로 `template.nameKo` 구획 생성→`importOntology({...payload, partitionId, strategy:'merge'})`→reload; off→현행(replace). (c) 동일 템플릿 반복 시딩 PK 충돌 방지(merge 경로에서 id 재생성 또는 충돌 스킵).
- **Mirror**: `import/route.ts:106-118`, `EmptyState.tsx:196-220`, `PartitionSwitcher.tsx:34-37`
- **Validate**: `npm test`, 수동: 템플릿 선택→새 구획 생성·귀속 확인, off 시 현재 구획

### Task 8: 통합 검증
- **Action**: 전체 빌드·린트·테스트 그린, 수동 라이브 4수용기준 확인.
- **Validate**: 아래 Validation 블록

## Validation

```bash
# 앱 디렉터리에서 실행
cd ontology/ontology/ontology

npm test            # vitest run — 기존 회귀 0 + 신규 단위/통합
npm run lint        # next lint
npm run build       # next build (타입 체크 포함)
```

수동(라이브, dev 서버): 반도체 구획에서 행정 문서 붙여넣기→"새 구획 분리"+AI 이름 / 일부 교차→bridge / 동일 도메인→무소음 attach / 템플릿→새 구획 귀속.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 과잉 분리 제안(오탐) 피로 | High | 결정론 임계 우선·attach 무소음·제안만(HITL)·`ATTACH_MIN`/`NEW_MAX` named const로 튜닝 |
| NewNodePopover(2,485줄) 통합 회귀 | Med | 밴드/카드를 `preview/PartitionSuggestCard`로 분리(최소 diff), 기존 트리아지·confirm 테스트 유지 |
| 새 구획이 store.partitions에 즉시 미반영(loadOntology 경유) | Med | partitionId를 `addClass`에 **직접 주입**(currentPartitionId 의존 X); 템플릿은 reload로 갱신 |
| 동일 템플릿 재시딩 시 고정 id PK 충돌(merge) | Med | Task 7c: merge 경로 id 재생성 또는 onConflict 스킵 |
| 프리뷰 시점 임베딩 부재로 매칭 정확도 저하 | Low | trigram 단독 매칭 명시(`combinedMatchScore(null,·)`), 임계 하향 검토 |
| LLM 명명 실패 | Low | try/catch→결정론 결과+fallback 이름 유지(`enrich/detect` 패턴) |

## Acceptance (PRD-N §M1 수용 기준)

- [ ] 반도체 구획에 행정 문서 투입 → "새 구획 분리" 제안 + AI 이름 제안
- [ ] 일부 교차 개념 → bridge 제안(전체를 한 구획에 욱여넣지 않음)
- [ ] 연결성 높은 입력 → 무소음 attach(제안 카드 없음)
- [ ] 제안은 항상 HITL, 자동 확정 없음
- [ ] 템플릿 시딩이 새 구획에 귀속(옵션 off 시 현재 구획)
- [ ] `npm run build`·lint·기존 테스트 회귀 0, 신규 80%+ 커버리지

---

## 부록: M2–M5 로드맵 (착수 시 개별 플랜으로 상세 분해 — PRD-N 지침)

- **M2 추론 격리**: `text2cypher`/`rag/entrypoint`에 `currentPartitionId` 스코프 주입(기본), "전체 질의" opt-in, 출처 구획 표기. M1과 독립(순서 교환 가능). 스코프 미지정 시 기존 동작 보존으로 회귀 0.
- **M3 Grounder**: `lib/metrics/grounding.ts`(바인딩률·신선도 순수 산출) + Health 표면 축 추가 + 미접지 배지 + CSV 재바인딩 diff. 현 자산(instances/CSV) 한정.
- **M4 Operator**: `rag/answer` 진단형 파이프라인(M2 스코프+M3 바인딩 위) + 근거경로/가드레일. 읽기 전용(행동 실행 Out). M2·M3 완료 후.
- **M5 Steward 잔여**: 계보 리포트(Evidence 탭 확장) + 발행 버전 태그. 후순위, M1~M4 검증 후.

> M2·M4의 Neo4j 질의는 PRD-M M0(Docker 복귀) 완료 환경 기준(PRD-N 비고).
