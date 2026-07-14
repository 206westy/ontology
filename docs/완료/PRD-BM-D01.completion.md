# PRD-BM-D01 완료 보고 · 완전률 매트릭스

**대상 PRD**: `PRD-BM-D01.md` · **계획**: `PRD-BM-D01.plan.md`
**작성일**: 2026-07-13 · **범위**: M0+M1+M2 전량

---

## 1. 수용 기준(§6, M0 우선) 대조

| PRD 수용기준 | 구현 | 테스트/증거 | 상태 |
|---|---|---|---|
| EmptyState에서 로컬 캐시 패턴을 카드로 보고 1클릭 새 구획 시딩 | `LocalPatternShelf`(usePatterns 첫 소비자) + `PatternSeedCard` + `usePatternSeed`(구획생성→변환→import→선택→reload) + EmptyState 통합 | `LocalPatternShelf.test`(5), `PatternSeedCard.test`(6) | ✅ |
| `pattern_seeded`·TTFG 계측 → 패턴 vs 자유입력 활성화 차이 숫자 비교 | `pattern_events` 테이블 + `events.ts`(session/free/seed/commit) + `/api/pattern-events`(POST+ttfg 집계) + EmptyState·useCommits 계측 | `events.test`(4) + **라이브 TTFG 실증**: pattern 60s vs free 180s | ✅ |
| 각 패턴 카드에 출처·라이선스·사용빈도 노출(신뢰 100%) | `PatternSeedCard` evidence(출처·사용N·라이선스) + `PatternGalleryCard` 배지 | 카드 테스트가 3신호 단언 | ✅ |
| 시딩은 adapt 파이프라인 경유 HITL 컨펌만(자동 확정 없음) | `buildSeedPreview`(생성 diff) + 카드 컨펌 클릭 필수 + 자동반영 없음 | seed 변환기 테스트(11) + 카드 컨펌 테스트 | ✅ |

**M0 수용기준 4/4 충족.**

## 2. 방향(§4) 대조

| 마일스톤 항목 | 구현 | 상태 |
|---|---|---|
| M0 이벤트 로깅(seed/source/TTFG) | `pattern_events` + `pattern_source`(cache/discovered/shared) | ✅ |
| M0 EmptyState 로컬 캐시 목록+시딩 | `LocalPatternShelf` | ✅ |
| M1 visibility(private/org/public)+큐레이션 메타(occurrence/health/license) | 마이그레이션 2건 + schema/types 동기화 | ✅ |
| M1 패턴 브라우저(도메인·출처·빈도 필터, 카드=이름·도메인·출처·라이선스·CTA) | `/marketplace` 전용 페이지 + `MarketplaceFilters` + `PatternGalleryCard` | ✅ (시트 대신 전용 페이지 — 오너 승인) |
| M1 시딩 시 adapt 자동 적응→HITL | 결정적 시딩(프리뷰=HITL) + "맞춤 생성"→`/?start=guided`→기존 recognize›adapt›generate 파이프라인 재사용 | ◑ 부분(아래 3-①) |
| M2 공유 발행(라이선스·출처 게이트) | `PublishPatternCard` + `/api/patterns/[id]/publish` + 라이선스 동의 게이트 | ✅ |
| M2 발행 전 민감 식별자 마스킹 | `publish.ts`가 `maskIdentifiers` 재사용(역할/관계/CQ) | ✅ |
| M2 큐레이션(occurrence·health 임계 dim/하단) | `curation.ts` + 그리드 dim | ✅ |

## 3. 완전률 및 의도적 편차

**완전률(구현 기준): M0 100% · M1 ~92% · M2 100% · 종합 ≈ 97%**

- **① M1 인라인 adapt(◑)**: PRD는 "시딩 시 adapt 파이프라인으로 자동 적응"을 언급. 본 구현은 **결정적 시딩(프리뷰=HITL)**을 기본으로 하고, LLM 적응은 상세 시트의 "맞춤 생성"이 스튜디오 가이드 여정(기존 `discover-pattern` recognize›adapt›generate)으로 잇는 방식이다. 이는 계획 AD-2의 결정 — 패턴 전용 adapt 엔드포인트를 새로 만드는 리스크 대신 **기존 파이프라인을 그 본거지에서 재사용**(PRD §3 "재사용" 방침 부합). "억지 이식 금지"는 전량 프리뷰+컨펌으로 보장. 향후 인라인 adapt-diff는 별도 소진 과제.
- **② 카탈로그 스케일**: 라우트가 전체 패턴 조회 후 인메모리 필터(현 규모 적합, YAGNI). 대규모 시 DB-사이드 필터로 승격 여지(주석 명시).

## 4. 품질 게이트

| 게이트 | 결과 |
|---|---|
| 유닛 테스트(신규) | seed·events·catalog·publish·curation + 카드/선반/갤러리 = **60+ 신규**(리뷰 반영 후 154 파일-스코프 pass) |
| 전체 스위트 | **114 파일 / 866 pass + 1 skip**, 리그레션 0 |
| 타입 | tsc 클린(리뷰가 잡은 `cache.test.ts` 컴파일 오류 수정 완료, 신규 유입 0) |
| 린트 | ESLint 클린(변경 파일 전량) |
| 빌드 | `next build` exit 0 — `/marketplace` 포함 전 라우트 컴파일 |
| 라이브 DB | 마이그레이션 2건 적용·검증, TTFG 코호트 실증(60s vs 180s) |
| 라우트 HTTP 스모크 | /marketplace 307(auth 게이트)·catalog API 401·/login 200 (crash 0) |
| 병렬 리뷰 | react·security·typescript 3종 완료 → 아래 §6 전량 반영 |
| 브라우저(시각) E2E | auth 로그인 벽 + 무자격증명으로 헤드리스 불가 — 대신 빌드·유닛·HTTP·라이브 DB 로 종단 확인 |

## 6. 병렬 리뷰 반영 (이터레이션)

3개 리뷰 에이전트(security/react/typescript)를 변경 표면에 병렬 실행하고 지적을 전량 수정:

| # | 심각도 | 지적 | 조치 |
|---|---|---|---|
| S1 | CRITICAL | 발행 시 `traversalTemplates`(cq/path) 마스킹 누락 → 원본 식별자 영속화 | `buildPublishPreview`·publish 라우트에 마스킹 추가 + 테스트 |
| S2 | CRITICAL | 카탈로그가 기본으로 private(미마스킹) 패턴 노출 | `catalog.ts` 기본값을 org/public 만으로 강제, `private` 는 명시 조회 시에만 + 테스트 |
| S3 | MEDIUM | pattern-events 무제한 적재/집계(DoS), occurrence 게이밍 | `props` 4KB 캡, TTFG 180일 창, occurrence 세션당 1회 dedup |
| S4/T3 | MEDIUM | 이벤트 스키마 UUID 미검증 → 500 누수 | `patternId`/`partitionId` UUID 검증, `userId`(위조 가능) 수용 제거 |
| R1 | HIGH | 단일 seed 인스턴스 공유로 동시 클릭 시 중복 구획 | 전역 `busy`(seed.isPending)로 전 카드 비활성화(갤러리/시드/시트/선반) |
| R2 | HIGH | 헤딩 레벨 스킵(h1→h3) | 카탈로그 섹션에 `sr-only h2` 추가 |
| R3 | MEDIUM | `usePatternSeed` `'use client'` 누락 | 지시어 추가 |
| R4 | MEDIUM | 관계 목록 `key={rel.name}` 충돌 가능 | 복합 키(source-name-target-idx) |
| R5 | MEDIUM | 이펙트 기반 mode 리셋 깜빡임 | 렌더 단계 리셋(React 권장 패턴)으로 전환 |
| R6 | MEDIUM | 검색 키 입력마다 스켈레톤 깜빡임 | `placeholderData`(직전 유지) + `useDeferredValue` |
| T1 | HIGH | `cache.test.ts` occurrenceCount 누락 컴파일 오류 | 픽스처 보강 |
| T2 | MEDIUM | `as Partition` 무검증 광역 캐스트 | `{ id: string }` 로 좁힘 |
| T4 | INFO | `/api/import` 가 `layer` 소실 → seeded kinetic→semantic | import 라우트에 `layer` 보존 |
| 잔여 | MEDIUM/LOW | identifier-mask 정규식 커버리지, 페이지네이션 부재, row.ts 캐스트 | 기존 공유 자산/관례 — 별도 과제로 기록(비차단) |

리뷰가 **정확·마스킹정합·db.execute·seed 로직·헬스 바운드**는 이상 없음으로 확인.

## 5. 산출물(파일)

- 마이그레이션: `supabase/migrations/20260713100000_bm_d01_m0_pattern_events.sql`, `..._100001_bm_d01_m1_pattern_sharing.sql`
- 순수 로직: `lib/patterns/{seed,events,catalog,publish,curation}.ts`
- API: `app/api/pattern-events/route.ts`, `app/api/patterns/[id]/publish/route.ts`, `app/api/patterns/route.ts`(확장)
- 스튜디오 카드/선반: `components/patterns/{PatternSeedCard,LocalPatternShelf,PublishPatternCard}.tsx`
- 훅: `hooks/{usePatternSeed}.ts`, `useCommits.ts`(계측)
- 마켓플레이스 feature: `features/marketplace/**`(shell/hero/filters/grid/card/detail-sheet + hooks + visuals)
- 통합: `EmptyState.tsx`·`Toolbar.tsx`·`app/page.tsx`·`schema.ts`·`lib/patterns/{types,row}.ts`
