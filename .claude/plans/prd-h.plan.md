# Plan: PRD-H-2 — 패턴-시드 스키마-적응형 온톨로지 구축 (+ 런타임 발견·학습형 캐시 델타)

**Source PRD**: `docs/진행중/PRD-H.md` + 델타 "런타임 패턴 발견·학습형 캐시" (H-2 델타 v1, 2026-07-01)
**Selected Milestone**: M1 — 학습형 패턴 캐시(H1) + 패턴 발견 파이프라인(H2) + 출처·라이선스 + 수렴 + HITL 카드 3종(H8-a/발견/승격)
**Complexity**: Large (전체), Medium-Large (M1 — 델타로 외부 발견이 주 경로로 승격되며 증가)

## Summary
PRD-H는 9기능(H1–H9)에 걸친 큰 기획이며, 코드베이스에는 하부구조 대부분(구획·엔티티 해소·임베딩·배치 병합·병합 프리뷰·관계 카테고리·섬 탐지·근거/신뢰도 provenance·attributions)이 이미 존재한다. **델타의 핵심 전환**: "미리 넣은 선반에서 고른다(레지스트리)" → **"런타임에 발견하고 캐시에 굳혀 수렴한다."** 따라서 M1은 (1) 비어서 시작 가능한 **자기충전 패턴 캐시**, (2) **retrieve›adapt›synthesize** 발견 파이프라인, (3) 출처·라이선스 어트리뷰션, (4) 같은 도메인 재사용으로 스키마 파편화를 막는 **수렴**, (5) 발견을 투명하게 보여주는 **HITL 카드 3종(요약·발견·캐시 승격) 게이트**로 재정의된다.

## 전체 마일스톤 분해 (델타 반영)

| MS | 범위(PRD) | 핵심 순증분 | 재사용 |
|---|---|---|---|
| **M1 (본 플랜)** | H1(캐시), H2(발견), H8-a+발견/승격 카드, 어트리뷰션·수렴 | 자기충전 캐시·retrieve/adapt/synthesize·출처·라이선스·수렴·발견 카드 | attributions, parse 파이프라인, cache-middleware, GovernanceProposalCard, models(primary/mini) |
| M2 | H3, H8-b, H8-c | 패턴 주입 추출(역할·인과계층), 무타입 노드 금지, 진행형 렌더 | parse-pipeline, batch merge, CandidatePairCard, IslandList |
| M3 | H4, H8-e | 맥락 주입 용어 해소(용어집 캐시·opt-in 웹·도메인 스코프·재주입) | EnrichmentCard, dedup 후보, embedding |
| M4 | H5, H6, H8-d, H8-f | 드리프트 3분기(매핑/확장/**분기=H2 발견 재호출**), 크로스-구획 브릿지 | partitions, edges.isBridge, 관계 category |
| M5 | H7, 스모크 | 연결성 오탐 교정·인스턴스 고아·CQ 통과율·라이선스 발행 게이트 종단 | graph-health, metrics/health, IslandList |

> **델타 연결**: H5 `분기(fork)` 판정 → **M1이 만든 발견 파이프라인(H2)을 재호출**. M4 설계 시 반영.

---

## M1 상세 플랜 (델타 반영본)

### Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| 마이그레이션 | `supabase/migrations/20260617000001_v5_add_partitions.sql` | 멱등 CREATE + 한국어 주석 + `COMMENT ON` |
| Drizzle 테이블 | `src/lib/drizzle/schema.ts:19-38` | `pgTable`+`check`/`unique`, `schema.ts` export → `getDb({schema})` |
| zod 스키마 | `src/features/ontology/lib/schemas.ts:7-25,497-521` | `looseUuid()`, `relationCategoryEnum` 재사용 |
| LLM 판정 | `src/lib/llm/parse-pipeline.ts:37-83` | `generateText`+`Output.object`+`wrapLanguageModel(parseCacheMiddleware)`, `LLM_MODELS.mini`(인지)/`.primary`(adapt·synthesize) |
| 어트리뷰션 | `src/lib/attribution.ts`, `attributions` 테이블 | 출처(source_type/ref/evidence/confidence) write 일원화 — 라이선스 필드 확장 |
| API 라우트 | `src/app/api/partitions/route.ts` | `getDb()`+Drizzle+`safeParse`+`handleApiError` |
| 카드 UX | `src/features/ontology/components/preview/GovernanceProposalCard.tsx` | 뱃지+근거+`검증 필요`+승인/무시, `'use client'`, CSS 변수, 한국어 |
| 웹 근거/opt-in | `EnrichmentCard`(web 제안 `검증 필요`) | 외부 출처는 검증 필요 배지 + opt-in 원칙 |

### 재정의된 동작 (델타)
- **H1 학습형 캐시**: 패턴은 사전 큐레이션 자산이 아니라 **런타임 발견이 채우는 self-populating 캐시**. **비어서 시작 가능**. seed 5종은 필수가 아닌 **부트스트랩 예시(있어도/없어도 동작)**. 확정 패턴 저장 → 같은 도메인 재입력 시 재사용(재합성 안 함) = **수렴**.
- **H2 발견 파이프라인 `retrieve › adapt › synthesize`**:
  - **retrieve**: 공개 온톨로지 저장소(LOV·BioPortal·ODP 등) 검색 → 검증된 패턴을 seed로.
  - **adapt**: seed를 입력·도메인 맥락에 적응(순수 합성보다 우선).
  - **synthesize**: 저장소에 없을 때만 CQ 기반 합성 + **HITL 강화**.
- **어트리뷰션**: 발견 패턴/노드에 출처(어느 온톨로지) + **라이선스** 기록. 라이선스 미확인은 **발행 전 경고**(warn-only, 법률 검토는 사람 몫).
- **수렴/일관성**: 같은 도메인 → 캐시 패턴 재사용으로 문서마다 다른 스키마 합성 방지(노드 병합 G1의 **한 단계 위 = 스키마 레벨 파편화 방지**).

### Files to Change
| File | Action | Why |
|---|---|---|
| `supabase/migrations/{ts}_h_p1_pattern_cache.sql` | CREATE | `patterns` 캐시 테이블 (domain·roles·relation_types·CQ·traversal + **method**(retrieved/adapted/synthesized)·**source_repo·source_uri·source_label·license**·is_draft·previous_version_id) + RLS lockdown 정합 |
| `src/lib/drizzle/schema.ts` | UPDATE | `patterns` Drizzle 정의 |
| `src/features/ontology/lib/patterns/types.ts` | CREATE | Pattern 번들 + 출처/라이선스/method zod 스키마 |
| `src/features/ontology/lib/patterns/cache.ts` | CREATE | domain 조회(히트=재사용, 미스=발견) · 승격 upsert · 수렴 판정 |
| `src/features/ontology/lib/patterns/discovery/provider.ts` | CREATE | 온톨로지 저장소 **provider 인터페이스**(retrieve 소스 플러그) |
| `src/features/ontology/lib/patterns/discovery/*` | CREATE | 소스 구현 — **스코프는 아래 질문으로 확정** |
| `src/features/ontology/lib/patterns/discover.ts` | CREATE | retrieve›adapt›synthesize 오케스트레이션(반환에 method·출처·라이선스) |
| `src/features/ontology/lib/patterns/{recognize,adapt,synthesize}-prompts.ts` | CREATE | 도메인 인지 + adapt + synthesize 시스템 프롬프트 |
| `src/features/ontology/constants/patterns/*` | CREATE | 부트스트랩 예시 5종(옵션) — 템플릿 승격, 진단/FMEA CQ·traversal 포함 |
| `src/app/api/llm/discover-pattern/route.ts` | CREATE | 발견 파이프라인 실행(mini 인지 + primary adapt/synthesize + cache-middleware) |
| `src/app/api/patterns/route.ts` | CREATE | GET(캐시 목록/`?domain=`) · POST(승격 저장) |
| `src/features/ontology/components/patterns/DomainSummaryCard.tsx` | CREATE | H8-a: 도메인·신뢰도·혼합비·CQ 미리보기 |
| `src/features/ontology/components/patterns/PatternDiscoveryCard.tsx` | CREATE | 발견 카드: **출처 노출** + [이걸로]/[조정]/[직접] + 라이선스 미확인 경고 |
| `src/features/ontology/components/patterns/CachePromotionCard.tsx` | CREATE | 캐시 승격: [저장]/[이번만] |
| `src/features/ontology/api.ts` + `hooks/usePatterns.ts` | UPDATE/CREATE | API 클라이언트 + react-query 훅 |
| 진입 UI (AIAssistantTab 등) | UPDATE | 입력→(요약/발견/승격)카드→컨펌해야 생성 시작(게이트) |
| 각 신규 lib/route `*.test.ts` | CREATE | 단위 테스트 |

### Tasks
1. **캐시 스키마+타입** — `patterns` zod/타입(출처·라이선스·method·domain·is_draft). Mirror: `schemas.ts` looseUuid/enum. Validate: `npm run test -- patterns/types`.
2. **마이그레이션+Drizzle** — 캐시 테이블 + RLS lockdown. Mirror: v5_add_partitions + v6 RLS. Validate: (라이브 적용은 사용자 확인 후) `npm run build`.
3. **발견 파이프라인** — provider 인터페이스 + retrieve(스코프 확정분) + adapt(primary) + synthesize(CQ, fallback). 반환에 method·출처·라이선스. Validate: `npm run test -- discover`(공개 온톨로지 有→retrieve-seed, 無→synthesize).
4. **캐시 로직·수렴** — domain 히트=재사용(재합성 0), 미스=발견, 승격 upsert, 부트스트랩 옵션. Validate: `npm run test -- cache`(빈 캐시 첫 입력 OK, 동일 도메인 2회차 히트).
5. **API** — `/api/llm/discover-pattern`, `/api/patterns`(GET/POST 승격). Mirror: partitions route. Validate: `npm run test` + 수동.
6. **카드 3종 + 게이트** — 요약·발견(출처 노출)·승격 카드, 라이선스 미확인 배지, 컨펌 전 생성 없음. Mirror: GovernanceProposalCard. Validate: `npm run test -- Card` + `npm run lint`.
7. **어트리뷰션·발행 경고** — 발견 패턴/노드에 출처·라이선스 메타 유지, 라이선스 미확인 시 발행(Neo4j push) 전 경고. Mirror: `lib/attribution.ts`. Validate: `npm run test -- attribution`.

### Validation
```bash
# ontology/ontology 에서
npm run test    # vitest 전량(기존 436 + 신규 그린)
npm run lint
npm run build
# 마이그레이션 라이브 적용은 supabase MCP(apply_migration→list_tables) — 사용자 확인 후
```
수용(통과조건 매핑): 빈 캐시 첫 입력 처리 · 동일 도메인 2회차 캐시 히트(재합성 0) · 공개 온톨로지 有→retrieve-seed / 無→synthesize+HITL · 발견물에 출처·라이선스 메타 · 라이선스 미확인 발행 전 경고 · 같은 도메인 A·B 동일/호환 패턴, 분기 시 검증 표면화 · 입력→카드→컨펌해야 생성.

### Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| **외부 온톨로지 저장소 통합**(auth·rate·RDF/OWL/SKOS 파싱) | High | provider 인터페이스 + retrieve 소스 **단계 도입**(스코프 질문). seed는 역할·관계·라벨 수준만 추출(전체 임포트 아님) |
| 회사망 TLS(Somansa)로 외부 fetch 실패 | Medium | 서버측 fetch에 `NODE_EXTRA_CA_CERTS` 적용 확인(기존 run-next.mjs 패턴) |
| 라이선스 다양성·법적 리스크 | Medium | warn-only 게이트 + 메타 보존, 법률 검토는 사람 |
| 수렴 오판(도메인 동일성 오인→잘못된 캐시 재사용) | Medium | 캐시 히트도 **요약 카드에서 컨펌**(사용자 override 가능) |
| 비용(발견 LLM 호출) | Medium | mini(인지)·primary(adapt/synthesize) + cache-middleware + domain 캐시 히트 |
| M1 범위 확대 | Medium | retrieve 소스 최소화(질문) + 카드/캐시/synthesize 우선 |

### Acceptance
- [ ] 모든 Task 완료, 통과조건 매핑 충족
- [ ] `npm run test`/`lint`/`build` 그린
- [ ] 마이그레이션 라이브 적용·검증(사용자 확인 후)
- [ ] 기존 병합·구획·attributions 인프라 재사용(재발명 없음)
- [ ] 진행추적(`docs/진행중/PRD-H-progress.md`)·STATUS 갱신
- [ ] **retrieve 소스 스코프 결정 반영**(아래 질문)

---

## M2 상세 플랜 (H3 패턴-시드 생성 + 진행형 렌더 + M1 게이트 마운트)

**Selected Milestone**: M2 · **Complexity**: Medium-Large · **상태**: 계획 수립(컨펌 대기)

### Summary
M1이 발견·확정한 패턴을 **시드로 주입**해, 엔티티는 패턴 역할 타입으로·관계는 패턴 관계 타입으로 뽑고(진단이면 증상→원인→점검→조치 인과 계층), **근거 기반 정확한 관계**(근거 스팬+신뢰도, 근거 없으면 섬)로 추출한다. 결과를 캔버스에 **순차로 나타나게(진행형)** 그린다. M1의 발견·컨펌 게이트(카드 3종)를 **실제 생성 앞에 마운트**하고, 발행 시 **라이선스 경고**를 노출한다. 병합 프리뷰(H8-c)는 기존 ER 자산 재사용.

### Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| 추출 파이프라인 | `src/lib/llm/parse-pipeline.ts:50-175`, `parse-prompts.ts:21-160` | Stage1/Stage2 + `Output.object`; 여기에 patternContext 주입 |
| 근거 기반 관계 | `parsedRelationSchema`(evidence/confidence/categoryConfidence), `IslandList` | 근거 없으면 섬, 저신뢰 확인 배지 |
| 병합 프리뷰 | `EntityResolutionSheet` + `er/CandidatePairCard` | 생성 직후 후보 제시(자동 병합 금지) |
| 진행형 렌더 | `GraphCanvas.tsx`(Cytoscape) + store apply | 순차 삽입 애니메이션(배치 스케줄) |
| 발행 확인 | `neo4j/NeoConfirmSheet.tsx` | 라이선스 미확인 경고 라인 |
| 게이트 프리미티브(M1) | `components/patterns/*Card.tsx`, `hooks/usePatterns.ts` | 컨테이너로 조합·마운트 |

### Files to Change (요지)
- `parse-prompts.ts`·`parse-pipeline.ts`·`parseRequestSchema` UPDATE — **옵션 `patternContext`**(역할·관계 타입·인과 계층 지시). 없으면 기존 제네릭 경로 그대로(회귀 0).
- 무타입/부모없음 **가드**(추출 후처리 + 검증 경고).
- `components/patterns/PatternDiscoveryPanel.tsx` CREATE — 요약→발견→승격 카드 조합 + `useDiscoverPattern`/`usePromotePattern` 배선.
- 진입 배선(예: `EmptyState`의 "패턴으로 시작") — 입력→게이트→컨펌 후 pattern-injected parse 실행(기존 flow 불변).
- 진행형 렌더 — 순차 삽입 스케줄러(순수 함수) + `GraphCanvas`/store 적용.
- 발행 경고 — 생성에 쓴 `patternId`를 커밋/세션에 기록 → `NeoConfirmSheet`에서 `hasUnverifiedLicense`로 경고.

### Tasks
1. 패턴 컨텍스트 주입 추출(프롬프트+파이프라인). Validate: `npm run test`(patternContext 유/무 분기).
2. 역할 타이핑·인과 계층·무타입 가드. Validate: 진단 노트→증상→원인→점검→조치(평탄 아님).
3. 진행형 렌더(순차 삽입 스케줄러). Validate: 스케줄러 단위테스트 + 시각 확인.
4. 게이트 마운트(PatternDiscoveryPanel + 진입). Validate: 입력→카드→**컨펌해야 생성**.
5. 병합 프리뷰 트리거(ER 재사용, H8-c). Validate: 표면형 다른 동일 대상 병합 제안.
6. 발행 라이선스 경고(T7 완결). Validate: 미확인 라이선스 패턴 사용 시 push 확인에 경고.

### Risks / 결정
| Risk | Mitigation |
|---|---|
| **진행형 렌더 방식**(진짜 스트리밍 vs 애니메이션 삽입) | **애니메이션 삽입 우선 권장** — 전체 결과 후 순차 add 로 "보이는 생성" 달성(스트리밍 인프라 불필요). `streamObject` 진짜 스트리밍은 후속 |
| 패턴 주입이 기존 제네릭 parse 회귀 | `patternContext` 옵션 — 없으면 기존 경로 그대로 |
| 게이트 진입점 침습 | 새 진입 추가, 기존 parse/assist flow 불변 |
| 패턴↔그래프 링크(발행 경고) | 생성 시 patternId 를 커밋/세션에 기록 |

### 확인 필요(계획 확정 전)
- **진행형 렌더**: 애니메이션 삽입(권장) vs 진짜 스트리밍(streamObject) — 전자로 진행 여부.

---

## M3 상세 플랜 (H4 맥락 주입형 용어 해소 + H8-e)
**Complexity**: Medium
### Summary
미정의·모호 용어(약어·은어, 예 `VV`)를 생성 중 감지 → **도메인 + 현재 온톨로지 맥락을 주입한 질의**로 뜻을 좁혀 후보(랭킹+출처+신뢰도)로 제시 → 확정 시 노드 정의 기록 + **세션/도메인 용어집 캐시** + 이후 추출·검색 맥락에 **재주입**. 도메인-스코프(전역 확정 금지). 웹은 opt-in.
### Patterns to Mirror
- 후보 제시 카드: `preview/EnrichmentCard.tsx`(web=검증 필요, adopt/ignore).
- 맥락 구성: `buildSchemaContext`(형제/인접 노드) — parse existingSchema 경로.
- LLM: mini(감지)·primary(해소) + `parseCacheMiddleware`.
### Files
- `supabase/migrations/{ts}_h_p3_term_glossary.sql` + Drizzle — `term_glossary`(id, partition_id/domain, term, meaning, source('internal'|'context'|'web'|'user'), confidence, created_at) UNIQUE(domain, term). 용어집 캐시=재검색 방지.
- `lib/terms/detect.ts`(미정의·모호·저신뢰 타입 트리거, 배치 수집), `lib/terms/resolve.ts`(순서: 내부 용어집→맥락→opt-in 웹→확인; 맥락 주입 질의 빌더), `*-prompts.ts`.
- `app/api/llm/resolve-terms/route.ts`(배치), `api.ts`/`hooks`.
- `components/terms/TermConfirmCard.tsx`(H8-e: 후보·주입 맥락 투명 노출·출처, [이 뜻으로]/[다른 뜻]/[직접]/[건너뛰기]).
### Tasks
1. 용어집 마이그레이션+Drizzle. 2. 감지(배치). 3. 맥락 주입 해소(질의에 도메인·인접·후보타입 포함, 도메인-스코프). 4. 용어집 캐시·재주입(같은 세션 이후 생성에 반영). 5. H8-e 카드. 6. opt-in 웹 게이트.
### 통과조건
`VV`가 맥락 주입 질의로 "밸브" 후보 제시 · 확정 뜻이 노드 정의+재주입 · 웹 질의에 도메인·인접 포함(키워드 단독 아님) · 확인 전 미확정 · 다른 도메인 문서의 같은 약어는 전역 강제 안 함(구획-스코프).
### Risk
대량 용어 검색 폭주 → (a)모호·미정의만 (b)배치 (c)웹 opt-in (d)용어집 캐시로 재검색 방지.

## M4 상세 플랜 (H5 드리프트 3분기 + H6 크로스-구획 브릿지 + H8-d/f)
**Complexity**: Medium-Large
### Summary
패턴 밖 신규 요소를 **매핑/확장/분기** 판정: 매핑=정상, 확장=패턴 역할·관계 추가(같은 구획·**패턴 버전업**), **분기=M1 발견 파이프라인 재호출**(새 패턴/구획). 서로 다른 구획의 동일 대상(예 `펌프447`)을 크로스-구획 동일성으로 찾아 **브릿지 후보**로 제시. 확정은 컨펌.
### Patterns to Mirror
- 버전업: `patterns.previous_version_id`(M1 스키마 이미 존재) — 새 version row + 링크.
- 브릿지: `edges.is_bridge`, 크로스-구획 동일성=dedup 후보 재사용(`combinedMatchScore`).
- 카드: `GovernanceProposalCard`(확장/분기 미리보기), `er/CandidatePairCard`(브릿지 근거).
### Files
- `lib/patterns/drift.ts`(매핑/확장/분기 판정, 분기→`discover()` 재호출), `*-prompts.ts`.
- `lib/bridge/cross-partition.ts`(구획 간 동일성 후보), `app/api/**` + hooks.
- `components/patterns/DriftDecisionCard.tsx`(H8-d: 확장 vs 분기 미리보기), `components/bridge/BridgeSuggestCard.tsx`(H8-f).
### Tasks
1. 드리프트 판정(3분기). 2. 확장=패턴 버전업(previous_version_id). 3. 분기=발견 재호출→새 구획 제안. 4. 크로스-구획 동일성→브릿지 후보(타입·근거). 5. H8-d/f 카드. 6. 컨펌 게이트(확정 전 불변).
### 통과조건
자연스러운 신규 원인→확장(같은 구획) · 행정 흐름 유입→분기(새 구획) · 같은 대상 두 구획→브릿지 후보 · 컨펌 전 패턴·구획 불변 · 브릿지에 근거·타입 기록.

## M5 상세 플랜 (H7 연결성·CQ 검증 + 라이선스 발행 게이트 종단 + 스모크)
**Complexity**: Medium
### Summary
파편화(도달성) 검사로 분리 시 명시 경고(현행 "섬 없음" 오탐 교정), **인스턴스까지 고아 탐지 확장**, 패턴 **CQ 세트로 답 경로 유무 점검**해 통과율 검수 표시. 라이선스 발행 게이트 종단(T7 완결) + 전체 수용 시나리오 스모크.
### Patterns to Mirror
- 연결성: `lib/critic/review.ts`(orphan), `metrics/health.ts`(isolationRate), `preview/IslandList.tsx`.
- CQ 점검: 패턴 `competencyQuestions`+`traversalTemplates` → 그래프 경로 존재 판정(Cypher/traversal or 그래프 내 매칭).
### Files
- `lib/validate/connectivity.ts`(분리 컴포넌트 수·인스턴스 고아), `lib/validate/cq.ts`(CQ 통과율).
- 검수 UI 확장(HealthDashboard/ValidationResults에 분리 경고·CQ 통과율 N/M).
- `NeoConfirmSheet` 라이선스 경고 완결(M2에서 시작분 종단).
### Tasks
1. 연결성(도달성) 검사·분리 경고. 2. 인스턴스 고아 확장. 3. CQ 통과율 점검·표시. 4. 라이선스 발행 게이트 종단. 5. 스모크(전체 수용 시나리오 1~6).
### 통과조건
병합 전→"N개로 분리" 경고 · 병합 후→단일 연결+CQ 통과율(예 4/4) · 답 경로 없는 CQ 실패 표시 · 미확인 라이선스 발행 전 경고 · 스모크 6단계 통과.

---
**전 마일스톤 공통**: 컨펌만으로 진행(자동 확정 0) · 근거·신뢰도·출처 투명 · 다크모드·CSS변수·한국어·이모지 금지 · `'use client'` · 추출=mini/판정=primary+cache · 각 단계 `npm run test`/`lint`/`build` green + 마이그레이션 라이브(확인 후).
