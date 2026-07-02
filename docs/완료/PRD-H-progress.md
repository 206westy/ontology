# PRD-H 구현 진행 추적 (Living Tracker)

> 목적: PRD-H(패턴-시드 스키마-적응형 온톨로지)를 마일스톤 단위로 구현하며, **M1 완료 직후 이어서 나머지 마일스톤(M2~M5) 플랜을 바로 수립**할 수 있도록 진행상황·결정·다음 액션을 한 곳에 남긴다.
>
> - **기획 원본**: `docs/진행중/PRD-H.md`
> - **상세 플랜**: `.claude/plans/prd-h.plan.md` (M1 상세 + 전체 마일스톤 맵)
> - **착수일**: 2026-07-01
> - **작업자**: 혼자·main 직접 (PR/브랜치 생략)

---

## 마일스톤 맵 (전체 진행률)

> **델타 반영(2026-07-01)**: 레지스트리→**학습형 캐시**, 라우터→**발견 파이프라인(retrieve›adapt›synthesize)**, +출처/라이선스, +수렴. 상세 `.claude/plans/prd-h.plan.md`.

| MS | 범위(PRD) | 상태 | 플랜 | 비고 |
|---|---|---|---|---|
| **M1** | H1 학습형 캐시 + H2 발견 파이프라인 + 어트리뷰션·수렴 + 카드 3종 | ✅ 완료(2026-07-02) | `.claude/plans/prd-h.plan.md` | LOV retrieve + provider. 게이트 마운트/발행경고는 M2 이관 |
| M2 | H3 패턴-시드 생성 + 진행형 렌더 + 게이트 마운트 + H8-b/c | ✅ 완료(2026-07-02) | plan `M2 상세` | patternContext 주입·역할 가드·순차 삽입·PatternDiscoveryPanel(EmptyState "패턴으로 시작")·ER 재사용·발행 라이선스 경고. +38테스트, build green |
| M3 | H4 맥락 주입 용어 해소 + H8-e | ✅ 완료(2026-07-02) | plan `M3 상세` | 감지(배치)·맥락 주입 질의·resolve 오케스트레이터(DI)·용어집 캐시+재주입·TermConfirmCard·opt-in 웹 게이트. +31테스트 green. **`term_glossary` 라이브 적용** |
| M4 | H5 드리프트 3분기 + H6 브릿지 + H8-d/f | ✅ 완료(2026-07-02) | plan `M4 상세` | partitions·isBridge·previous_version_id 재사용(신규 마이그레이션 없음) |
| M5 | H7 연결성·CQ 검증 + 스모크 | ✅ 완료(2026-07-02) | plan `M5 상세` | 오탐 교정·인스턴스 고아·CQ 통과율·발행 게이트 종단·스모크. +31테스트(574 passed/1 skipped·77파일), lint 무오류(경고만·무관), build ✓ |

**M2 노트**: 진행형 렌더=애니메이션 삽입(순수 `scheduleInsertion` 테스트). 게이트는 EmptyState 신규 진입으로 기존 flow 불변. 발행 경고는 `activePattern`(store)→NeoConfirmSheet. 테스트 부채(무관·기존): `NewNodePopover-iter2` 풀스위트 타임아웃 flaky(격리 시 통과).

**M5 노트**: **연결성(H7)** `lib/validate/connectivity.ts`—Union-Find 도달성으로 분리 컴포넌트 수 계산, `componentCount>1`이면 "N개로 분리" 경고(현행 "섬 없음" 오탐 교정). 노드를 종류 구분 없이 취급해 **인스턴스까지 고아 탐지 확장**. 엣지 끝점이 노드목록에 없어도 컴포넌트 포함. **CQ(H7)** `lib/validate/cq.ts`—`evaluateCompetencyQuestions(cqs, templates, pathExists)` 순수/DI, CQ↔traversal 매칭 후 답 경로 유무로 N/M 통과율. `buildGraphPathChecker(edges)`=경로의 관계타입 시퀀스를 그래프에 머리-꼬리 체인으로 매칭(다중 홉 실제 도달성, 관계타입 이름에 키잉). **검수 표시(additive)** `components/health/ConnectivityCqSection.tsx`를 `HealthDashboardSheet`에 마운트—연결성 경고 + "CQ 4/4"·per-CQ pass/fail. store에 `activePatternCq` 필드+세터 추가(생성 시 CQ 번들 기록), `usePatternGeneration`이 `setActivePatternCq` 호출. **발행 게이트 종단(T7)**: `NeoConfirmSheet`가 이미 `buildPublishLicenseWarning([activePattern])` 배선·`data-testid=publish-license-warning` 렌더—미확인 라이선스 경고 커버 테스트 추가(store activePattern 모양 검증). **HITL 오케스트레이션** `lib/patterns/hitl.ts`(순수)—`buildHitlPlan`이 미정의 용어(detect 재사용)·패턴 밖 개념(드리프트)·패턴 밖 관계·크로스-구획 브릿지를 컨펌 대상으로 결정. **라이브 배선 vs 유예(정직)**: 라이브=(1)연결성·CQ 검수 표시 (2)생성 흐름에 용어 감지 in-flight(`detectTermsNeedingResolution`→경고 토스트+반환) (3)`activePatternCq` 기록. 유예=TermConfirmCard/DriftDecisionCard/BridgeSuggestCard의 **캔버스 중간 마운트**(카드·hook·API·`buildHitlPlan`은 준비됨, 생성 캔버스 내 카드 렌더링은 후속). **스모크** `lib/__tests__/prd-h-m5-smoke.test.ts`(hermetic)—인지→캐시미스→발견→역할타이핑→용어(VV=밸브)→단일연결+CQ 4/4 / 캐시히트(재합성 없음)·fork·브릿지. +31테스트(총 574 passed/1 skipped·77파일), lint 무오류(경고만), build ✓. **신규 마이그레이션 없음**.

**M4 노트**: `lib/patterns/{drift,drift-prompts,drift-llm,extend}.ts`+`lib/bridge/cross-partition.ts`+라우트 2종(`/api/llm/drift` 판정, `/api/bridges` GET 후보·POST 브릿지)+`driftApi`/`bridgesApi`+`useJudgeDrift`/`useBridge*`+카드 2종(`DriftDecisionCard` H8-d·`BridgeSuggestCard` H8-f). 드리프트 판정은 순수/DI(alignFn+domainFitFn)로 hermetic 테스트—3분기(map/extend/fork) 전 분기 커버. **분기(fork) 발견 재호출 seam**: drift 라우트는 판정만; 카드 `onFork`→기존 `useDiscoverPattern`(M1 discover 파이프라인) 호출. **확장(extend)=버전업**: `extendPattern`(version+1·previousVersionId=base.id·isDraft, 불변)→`extendedPatternToPromote`→기존 POST `/api/patterns`(nextPatternVersion 정합). **브릿지=dedup 재사용**: `combinedMatchScore`+`MATCH_CANDIDATE_THRESHOLD`로 같은-구획·임계값미만 제외·대칭쌍 제거; GET 라우트는 classes/instances 크로스-구획 pgvector+trigram 자기조인. 컨펌 게이트: 판정/후보만—확정 전 패턴·구획 불변(카드 테스트로 encode). 브릿지에 타입(`same_as` 기본)·근거 기록. **신규 마이그레이션 없음**(기존 컬럼 재사용). +30테스트(총 543 passed/1 skipped·72파일), lint clean, build ✓. 미배선: 카드 마운트(생성 흐름 통합은 후속)·bridge relationTypeId는 클라이언트가 해소(라우트는 FK만 받음).

**M3 노트**: `lib/terms/`(detect·context-query·resolve·glossary·row·llm·prompts)+`components/terms/TermConfirmCard`+라우트 2종(`/api/llm/resolve-terms`, `/api/term-glossary`)+`termsApi`/`useTerms`. resolve 오케스트레이터는 DI(glossaryLookup·contextResolveFn·webResolveFn)로 hermetic 테스트. 재주입 경로=`buildGlossaryInjectionBlock(domain, entries)` → parse `existingSchema`/`patternContext`에 덧붙이면 됨(배선은 M2 생성 흐름에 후속). 웹 opt-in(기본 off), 도메인-스코프. 마이그레이션 `20260702010000_h_p3_term_glossary.sql` 작성만(라이브 미적용).

**런타임 종단 완결(2026-07-02)**: 미배선 2건 닫음. ① **용어 재주입** — `usePatternGeneration`가 추출 전 `termsApi.glossary(domain)`→`buildGlossaryInjectionBlock`을 parse `existingSchema`에 주입(확정 `VV=밸브`가 이후 생성에 재적용). ② **드리프트 라이브 피드** — 생성 결과에서 `collectDriftElements`(패턴 밖 개념·관계)→`driftApi.judge`→`DriftDecisionCard` 표면화(onExtend=확장 승격 `extendedPatternToPromote`, onFork=발견 게이트를 분기 개념으로 재오픈=H2 재호출). +4테스트(drift-collect), 빌드 그린·lint 0 error·live caller 확인.

상태 범례: ⬜ 대기 · 🟡 진행중 · ✅ 완료 · ⏸ 보류

---

## M1 태스크 체크리스트

| # | 태스크 | 상태 | 산출물 |
|---|---|---|---|
| T1 | 캐시 스키마+타입(출처·라이선스·method·domain) | ✅ | `lib/patterns/types.ts` (+ types.test.ts) |
| T2 | `patterns` 캐시 마이그레이션 + Drizzle(RLS 정합) | ✅ | `supabase/migrations/20260701020000_h_p1_pattern_cache.sql`, `lib/drizzle/schema.ts:562` · **라이브 적용·검증 완료**(patterns 테이블, RLS on, 0행) |
| T3 | 발견 파이프라인 retrieve›adapt›synthesize + provider(LOV) | ✅ | `lib/patterns/discovery/{provider,lov}.ts`, `discover.ts`, `llm.ts` (+ discover/lov 테스트) |
| T4 | 캐시 로직·수렴(도메인 히트=재사용, 부트스트랩 옵션) | ✅ | `lib/patterns/cache.ts`, `constants/patterns/bootstrap.ts` (+ cache.test.ts) |
| T5 | API(`/api/llm/discover-pattern`, `/api/patterns` GET/POST 승격) | ✅ | `app/api/{patterns,llm/discover-pattern}/route.ts`, `api.ts`, `hooks/usePatterns.ts` |
| T6 | 카드 3종(요약·발견·승격) | ✅ 카드 / ⏸ 마운트 | `components/patterns/{DomainSummaryCard,PatternDiscoveryCard,CachePromotionCard}.tsx` (+ 카드 테스트). **게이트 마운트·실생성 배선은 M2**(진행형 생성 흐름이 게이트의 자연스러운 집) |
| T7 | 라이선스 발행 게이트(순수 술어) | ✅ 술어 / ⏸ 발행 UI | `lib/patterns/license.ts` (+ license.test.ts). **발행 경고 노출은 패턴↔그래프 링크가 생기는 M2+에서** |
| V | 검증: `npm run test` / `lint` / `build` + 라이브 마이그레이션 | ✅ | **test 462 passed/1 skipped(59파일)** · **build ✓ Compiled successfully(50/50)** · lint 경고만(패턴 파일 무관, 기존 것) · 마이그레이션 라이브 |

**M1 결론(2026-07-02)**: 백엔드·API·카드·캐시·발견(LOV)·마이그레이션 완비, 전량 그린. 게이트 UI 마운트/실생성 배선(T6)·발행 라이선스 경고 노출(T7)은 **M2로 이관**(진행형 생성 흐름이 게이트·발행의 자연스러운 집). M1 = "발견·캐시·카드·API + 생성 전 컨펌 게이트 프리미티브"까지 완료.

---

## 근거로 삼은 기존 패턴 (mirror 대상)

| 카테고리 | 소스 | 패턴 |
|---|---|---|
| 마이그레이션 | `supabase/migrations/20260617000001_v5_add_partitions.sql` | 멱등 CREATE + 한국어 주석 + `COMMENT ON` |
| Drizzle 테이블 | `src/lib/drizzle/schema.ts:19-38` (partitions) | `pgTable` + `check`/`unique`, `schema.ts` export → `getDb({schema})` |
| zod 스키마 | `src/features/ontology/lib/schemas.ts:7-25,497-521` | `looseUuid()`, `relationCategoryEnum` 재사용 |
| LLM 판정 | `src/lib/llm/parse-pipeline.ts:37-83` | `generateText`+`Output.object`+`wrapLanguageModel(parseCacheMiddleware)`, `LLM_MODELS.mini/primary` |
| API 라우트 | `src/app/api/partitions/route.ts` | `getDb()`+Drizzle+`safeParse`+`handleApiError` |
| 카드 UX | `src/features/ontology/components/preview/GovernanceProposalCard.tsx` | 뱃지+근거+`검증 필요`+승인/무시, `'use client'`, CSS 변수 |
| 관계 카테고리 | `src/features/ontology/lib/types.ts:92-97` | 5분류 enum(structural/causal/diagnostic/procedural/descriptive) |

**경로 주의**: repo 루트 `ontology/ontology`, 앱 `ontology/ontology/ontology`, 마이그레이션 `ontology/ontology/supabase/migrations`.

---

## 결정 로그 (Decisions)

- **D1**: PRD-H에 Delivery Milestones 표가 없어 5개 마일스톤으로 자체 분해. M1을 흐름 최전단(입력→도메인 인지→요약 카드→컨펌)으로 잡음 — 후속 전부의 게이트.
- **D2**: 기존 템플릿 5종은 **불변**으로 두고 패턴은 상위 슈퍼셋(별도 파일)으로 신규 추가 → `buildImportPayload`(예시 불러오기) 회귀 방지.
- **D3**: 도메인 인지는 `LLM_MODELS.mini` + `parseCacheMiddleware`(비용/재현). 추출은 컨펌 전 미착수.
- **D4(델타)**: H1 레지스트리→학습형 캐시(비어서 시작 가능·수렴), H2 라우터→발견 파이프라인 retrieve›adapt›synthesize. 발견물에 출처·라이선스, 발행 전 라이선스 경고(warn-only).
- **D5(retrieve 스코프)**: **LOV(무키 REST) 먼저 + provider 인터페이스**. BioPortal(키 필요)·ODP는 후속. 회사망 TLS는 서버 fetch에 `NODE_EXTRA_CA_CERTS` 적용으로 대응.
- **D6(진행형 렌더)**: **애니메이션 삽입 방식**(전체 결과 후 노드 순차 add). 진짜 스트리밍(streamObject)은 후속. 사용자 "끝까지 진행" 지시로 권장안 채택.
- **D7(실행 범위)**: M2~M5 전량 구현 진행(사용자 "계획 끝까지 세우고 끝까지 진행"). 마일스톤별 TDD green + 마이그레이션 라이브 + 트래커 갱신.

---

## 다음 액션 (M1 종료 시)

1. 이 파일의 M1 체크리스트를 ✅로 갱신, `docs/STATUS.md` 진행중 표 갱신.
2. `.claude/plans/prd-h.plan.md`에 **M2 상세 플랜** 추가(진행형 렌더/패턴 주입 추출). Cytoscape 증분 렌더 방식 조사 먼저.
3. 마일스톤 맵의 M2 상태를 🟡로 전환.

---

## 변경 이력

- 2026-07-01: 트래커 생성, M1 착수. PRD-H를 `진행전/`→`진행중/` 이동.

---

## M5+ 배선 노트 (2026-07-02) — HITL 검수 시퀀스 마운트

**목표**: 생성 완료 후, 아직 마운트되지 않았던 3종 HITL 컨펌 카드(용어/드리프트/브릿지)를 패턴 패널 안의 **순차 검수 시퀀스**로 배선. Cytoscape 캔버스 내부는 건드리지 않음.

**추가/변경 파일**
- `components/patterns/PatternReviewSequence.tsx` (신규) — 순수 step-runner. buildHitlPlan 스텝(용어→드리프트→브릿지)을 하나씩 렌더, 빈 스텝 스킵, 진행률("N/M 단계"), 완료 시 "검수 완료" 요약. 데이터·콜백 주입식(hermetic). 렌더만으로는 아무 변이 없음(confirm-gate).
- `components/patterns/PatternReviewSequence.test.tsx` (신규) — 6 테스트(첫 스텝=용어, 스텝별 콜백, 빈 스텝 스킵, 다중 용어 순회, 완료 요약, confirm-gate).
- `components/patterns/PatternDiscoveryPanel.tsx` — `review`(+ 6 콜백) 옵셔널 prop 추가. `review`가 있으면 발견/컨펌 게이트 대신 `PatternReviewSequence`를 렌더(생성 이후에만). 없으면 기존 게이트 동작 그대로.
- `components/patterns/__tests__/PatternDiscoveryPanel.test.tsx` — 게이트 테스트 3종 유지 + 검수 모드 테스트 2종 추가.
- `components/EmptyState.tsx` — 실제 배선. 생성 후 `usePatternGeneration` 결과의 `detectedTerms`를 `useResolveTerms`로 해소(맥락 주입, 웹 off), `bridgesApi.candidates()`로 브릿지 후보 수집 → `review` 채움(패널 유지). 카드 컨펌: 용어→`useConfirmTerm`(용어집 upsert), 브릿지 연결→`useCreateBridge`(relationType 이름→store에서 find-or-create id). 검수할 게 없으면 패널 닫음.

**지금 인터랙티브(엔드투엔드)**
- **용어**: 감지→해소(랭킹 후보)→확정(용어집 저장) / 직접입력 / 건너뛰기 — 라이브.
- **브릿지**: 크로스-구획 후보 조회→표시→연결(`is_bridge` 엣지 생성) / 별개 — 라이브.
- **드리프트**: 카드+시퀀스+패널은 prop으로 완전 지원(단위 테스트 green). **EmptyState 라이브 피드는 보류** — 생성 결과가 드리프트 요소/전체 Pattern을 표면화하지 않아 `DriftJudgment[]` 산출에 별도 라운드트립(useJudgeDrift + 전체 Pattern) 필요. `driftPattern:null`이라 스텝은 안전 스킵.

**가정/결정**
- 검수 데이터는 "생성 콜백이 세팅하는 props/state"로 패널에 주입(가드레일 허용안). 패널은 순수 렌더러 유지, 오케스트레이션은 마운트 부모(EmptyState).
- 브릿지 `relationTypeId`는 store `relationTypes`에서 이름 매칭, 없으면 `addRelationType`로 생성(usePatternGeneration과 동일 패턴). 서버 영속은 해당 relationType 존재에 의존.
- 웹 용어 후보 기본 off(opt-in) 유지. 자동 반영 없음(모든 변이는 카드 컨펌 뒤).

**검증**: `npm run test` 74 파일/563 통과·1 skip(풀-스위트 4 worker-startup timeout=기존 플레이크, 해당 파일 격리 시 통과). `npm run lint` exit 0(신규/변경 파일 0 경고). `npm run build` 성공.
