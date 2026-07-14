# Plan: PRD-BM-D01 · 패턴 마켓플레이스 (학습 캐시 → 성장 플라이휠)

**Source PRD**: `ontology/ontology/docs/진행전/PRD-BM-D01.md`
**Selected Scope**: M0 → M1 → M2 전량 (한 번에 개발 가능하도록 전 단계 계획)
**Complexity**: Large (신규 페이지 1 + 신규 테이블 2컬럼셋 + 변환기/발행 게이트/카탈로그 UI)
**작성일**: 2026-07-13

---

## 0. 핵심 방침 (PRD §3 계승)

> **"새로 만드는 것보다 재배치+통합."** 신규 지능 로직은 만들지 않는다. 신규 코드는 대부분 *조회 API + 카탈로그 UI + 발행 액션 + 결정적 변환기 + 계측*이며, 지능(도메인 인지·adapt·synthesize·마스킹·라이선스 경고)은 전부 **기구현 자산 호출**이다.

조사 결과 `patterns` 자산의 실태:
- `patterns` 테이블·`GET/POST /api/patterns`·discover 파이프라인(retrieve›adapt›synthesize)·`patternsApi`/`discoverPatternApi`·`usePatterns()` **모두 이미 존재**.
- 그러나 **`usePatterns()`는 어디서도 소비되지 않음** → 캐시된 패턴을 **브라우즈/시딩하는 표면이 0**. 이 PRD가 그 자산의 첫 소비자.

---

## 1. Summary

이미 코드에 존재하나 표면이 없는 `patterns`(학습형 캐시)를 세 층위로 연다: **① 로컬 캐시 패턴을 EmptyState 카드로 노출 + 새 구획 1클릭 시딩(M0)**, **② 전용 마켓플레이스 페이지에서 공유·큐레이션된 패턴 카탈로그 브라우징(M1)**, **③ 수렴된 패턴을 마스킹·라이선스 게이트를 통과해 발행(M2)**. 모든 그래프 반영은 항상 HITL 컨펌(자동 확정 없음), 신뢰 신호(출처·라이선스·사용빈도·헬스)는 100% 표면화한다.

---

## 2. 아키텍처 결정 (Architecture Decisions)

| # | 결정 | 근거 |
|---|------|------|
| **AD-1** | **전용 페이지 `/marketplace`** 를 M1 카탈로그로 신설(갤러리형). M0 로컬 시딩은 **스튜디오 내 EmptyState**에 인라인. | 사용자가 "추가 페이지 구축 OK, 지금 화면에 다 담지 않아도 됨" 명시. 벤치마크(Notion Gallery·Airtable Universe)가 전용 갤러리. 디자인 우수성을 발휘할 캔버스. 스튜디오 크롬은 `layout.tsx`가 아니라 `page.tsx`에 있어 새 라우트는 빈 뷰포트 → 갤러리 전용 셸을 직접 구성. |
| **AD-2** | **시딩 = 결정적 변환기(무LLM) + HITL 프리뷰.** `Pattern.roles → classes`, `Pattern.relationTypes → relation_types + edges` 순수 매핑 → 새 구획 생성 → `importOntology({partitionId})`. adapt(LLM)는 **공유 패턴(M1) 선택적 "내 맥락에 맞추기"에서만** 호출. | 로컬 캐시 패턴은 이미 사용자 도메인에 맞음(재-adapt 불필요·비용↓). 공유 패턴만 억지 이식 방지 위해 adapt. **핵심 갭**: 패턴 번들→그래프 payload 변환기가 현재 없음 → 유일한 신규 "로직". `insertOntology(partitionId)`는 이미 존재. |
| **AD-3** | **신규 `pattern_events` 테이블**로 계측. `attributions`(provenance 전용)·기존 인프라 모두 부적합(시계열 이벤트 로거 전무). | TTFG·pattern_seeded·source 비교를 숫자로 내려면 이벤트 로그 필수(PRD §2 선결과제). |
| **AD-4** | **컬럼 가산.** `patterns`에 `occurrence_count`(M0)·`visibility`·`health`(M1) 추가. 비파괴 `ADD COLUMN IF NOT EXISTS ... DEFAULT`. | M0 수용기준이 카드에 "사용빈도" 요구 → occurrence는 M0. visibility/health는 공유·큐레이션(M1/M2). |
| **AD-5** | **카드는 전부 `ConfirmCard` 문법 재사용**(4단 고정: 판정/근거/미리보기/액션). 신규 시각 언어 창작 금지(코드 주석 명시). semantic 토큰만. | PRD §3 "기존 `<ConfirmCard>`·EmptyState·`BridgeSuggestCard` 컨벤션 준수". |

---

## 3. 재사용 vs 신규 (Asset Map)

| 역량 | 상태 | 자산 / 신규 위치 |
|------|------|------------------|
| discover(retrieve›adapt›synthesize) | ♻️ 재사용 | [discover-pattern/route.ts](ontology/ontology/src/app/api/llm/discover-pattern/route.ts), `discovery/provider.ts`, `patterns/llm.ts` |
| 패턴 승격/버전업 | ♻️ 재사용 | [patterns/route.ts](ontology/ontology/src/app/api/patterns/route.ts) POST, `patterns/extend.ts` |
| 새 구획 생성 + partition 스코프 삽입 | ♻️ 재사용 | [partitions/route.ts](ontology/ontology/src/app/api/partitions/route.ts), [import/route.ts](ontology/ontology/src/app/api/import/route.ts) `insertOntology`, `EmptyState.handleConfirmLoad` |
| 식별자 마스킹(발행 게이트) | ♻️ 재사용 | [identifier-mask.ts](ontology/ontology/src/features/ontology/lib/identifier-mask.ts) `maskIdentifiers`,`hasMaskableIdentifiers` |
| 라이선스 경고(발행 게이트) | ♻️ 재사용 | [patterns/license.ts](ontology/ontology/src/features/ontology/lib/patterns/license.ts) `buildPublishLicenseWarning` |
| HITL 컨펌 카드 문법 | ♻️ 재사용 | `components/ui/confirm-card/ConfirmCard.tsx` |
| 신뢰 신호 배지 | ♻️ 재사용 패턴 | `HealthScoreBadge.tsx`(Badge outline + semantic 토큰) |
| 우측 시트 + 리스트 골격 | ♻️ 재사용 패턴 | `EntityResolutionSheet.tsx` |
| 데이터 페칭 | ♻️ 재사용 | `usePatterns()`(미소비) + TanStack Query |
| **패턴 번들 → 그래프 payload 변환기** | 🆕 신규 | `lib/patterns/seed.ts` |
| **계측 이벤트 로거·테이블** | 🆕 신규 | `pattern_events` 테이블 + `lib/patterns/events.ts` + `/api/pattern-events` |
| **patterns.occurrence_count/visibility/health** | 🆕 신규 | 마이그레이션 + `schema.ts` 동기화 |
| **마켓플레이스 카탈로그 페이지** | 🆕 신규 | `app/marketplace/` + `features/marketplace/` |
| **발행 프리뷰·게이트** | 🆕 신규 | `lib/patterns/publish.ts` + `/api/patterns/[id]/publish` |
| **큐레이션 랭킹** | 🆕 신규 | `lib/patterns/curation.ts`(순수 함수) |

---

## 4. Patterns to Mirror

| Category | Source | Pattern |
|----------|--------|---------|
| DB 마이그레이션 | `ontology/supabase/migrations/20260701020000_h_p1_pattern_cache.sql` | `CREATE TABLE IF NOT EXISTS` + index + `ENABLE ROW LEVEL SECURITY`(deny-all) + `COMMENT ON`. 타임스탬프 네이밍. Supabase MCP `apply_migration`으로 적용(ref `mcxeejatzzotfskkwvyb`) 후 `schema.ts` 동기화 |
| Drizzle 컬럼 | `src/lib/drizzle/schema.ts:617-653` | `text().notNull().default()` + `check('chk_...', sql\`... IN (...)\`)`, `integer().notNull().default()`, 콜백 배열 index/unique/check |
| API 라우트 | `src/app/api/patterns/route.ts`, `src/app/api/partitions/route.ts` | `getDb()` + `zod.safeParse` → `{error:flatten()}` 400 + `db.insert().returning()` + `handleApiError(err)` |
| 시딩 오케스트레이션 | `EmptyState.tsx:202-248` (`handleConfirmLoad`) | `partitionsApi.create` → `importOntology({...,strategy:'merge',partitionId})` → `selectPartition` → reload |
| 확인 카드 | `patterns/PatternDiscoveryCard.tsx`, `DomainSummaryCard.tsx` | `<ConfirmCard eyebrow/attention/title/evidence/preview/actions>`, 액션 `Button size="sm" className="h-6 gap-0.5 px-2 text-xs"` |
| 시트+리스트 | `EntityResolutionSheet.tsx:87-141` | `Sheet side="right"` + 카운트 헤더 + `ScrollArea` + 카드 map + 빈 상태 |
| 훅(react-query) | `hooks/usePatterns.ts`, `usePartitions.ts` | `useQuery({queryKey})` / `useMutation({onSuccess: invalidateQueries})` |
| 순수 로직 + 테스트 | `patterns/cache.ts` + `__tests__/cache.test.ts`, `identifier-mask.ts` + test | DB-프리 순수 함수 + vitest AAA. **먼저 테스트(RED)** |
| 디자인 토큰 | `src/app/globals.css:11-187` | `--primary:263 70% 50.4%`, `--surface-*`, `--elevation-*`, `--node-*`, `hsl(var(--token))`. 하드코딩 팔레트 금지 |

---

## 5. 데이터 모델 변경

### 5-1. `pattern_events` (신규, M0)

```sql
-- YYYYMMDDHHMMSS_bm_d01_m0_pattern_events.sql
CREATE TABLE IF NOT EXISTS pattern_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     text NOT NULL,
  user_id        uuid,                       -- Supabase auth.uid (nullable)
  event_type     text NOT NULL,              -- session_started|free_input_started|pattern_seeded|first_commit
  pattern_id     uuid REFERENCES patterns(id) ON DELETE SET NULL,
  pattern_source text,                       -- cache|discovered|shared (seed 이벤트만)
  partition_id   uuid,                        -- 시딩된 구획
  props          jsonb NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_pattern_event_type
    CHECK (event_type IN ('session_started','free_input_started','pattern_seeded','first_commit')),
  CONSTRAINT chk_pattern_event_source
    CHECK (pattern_source IS NULL OR pattern_source IN ('cache','discovered','shared'))
);
CREATE INDEX IF NOT EXISTS idx_pattern_events_session ON pattern_events(session_id);
CREATE INDEX IF NOT EXISTS idx_pattern_events_type_time ON pattern_events(event_type, created_at);
ALTER TABLE pattern_events ENABLE ROW LEVEL SECURITY;   -- deny-all (앱은 Drizzle 우회)
```

- **TTFG** = 세션의 `first_commit.created_at − session_started.created_at`, `pattern_seeded` 유무·source별 코호트로 집계. → `GET /api/pattern-events?summary=ttfg`가 코호트별 중앙값 반환.

### 5-2. `patterns` 컬럼 가산

```sql
-- M0
ALTER TABLE patterns ADD COLUMN IF NOT EXISTS occurrence_count integer NOT NULL DEFAULT 1;
-- M1
ALTER TABLE patterns ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private';
ALTER TABLE patterns ADD COLUMN IF NOT EXISTS health real;   -- 0~100, 발행 시 산정(M2)
ALTER TABLE patterns ADD CONSTRAINT chk_pattern_visibility
  CHECK (visibility IN ('private','org','public'));
CREATE INDEX IF NOT EXISTS idx_patterns_visibility ON patterns(visibility);
```

`schema.ts`의 `patterns` 객체에 `occurrenceCount`·`visibility`·`health` 추가 + 콜백 배열에 check/index 추가. `Pattern` 타입·`rowToPattern`·`promotePatternRequestSchema`도 동기화.

---

## 6. Milestone 계획

### ▐ M0 · 계측 & 로컬 시딩 (기반) — **크리티컬 패스, 독립 배포 가능**

| Task | Action | Mirror | Validate |
|------|--------|--------|----------|
| **M0-1** 시딩 변환기 | 🆕 `lib/patterns/seed.ts`: `patternToImportPayload(pattern, partitionId, colorFn)` (roles→classes, relationTypes→relation_types+edges, sourceRole/targetRole→classId 해소) + `buildSeedPreview(pattern)`(N클래스·M관계 요약). **DB-프리 순수 함수** | `sample-ontology.ts` payload 형태, `cache.ts` 순수함수 | `__tests__/patterns/seed.test.ts` (TDD RED 먼저): 역할 3·관계 2 → 클래스 3·관계 2·엣지 2, 미해소 role 링크 제외 |
| **M0-2** 계측 유틸·테이블 | 🆕 마이그레이션 `..._bm_d01_m0_pattern_events.sql` + `schema.ts` `patternEvents` + `patterns.occurrence_count` + 🆕 `lib/patterns/events.ts`(`getSessionId()`, `logPatternEvent()`) | `h_p1_pattern_cache.sql`, `schema.ts` 컨벤션 | `apply_migration` 성공 + `list_tables` 확인 + `events.test.ts`(세션ID 멱등) |
| **M0-3** 이벤트 API | 🆕 `app/api/pattern-events/route.ts`: POST(이벤트 삽입 + `pattern_seeded`면 occurrence_count 증가) / GET `?summary=ttfg`(코호트 집계) | `patterns/route.ts` GET/POST 골격 | 라우트 통합 테스트 or curl로 삽입·집계 |
| **M0-4** 시드 카드 | 🆕 `components/patterns/PatternSeedCard.tsx`: `ConfirmCard`(eyebrow=도메인, title=패턴명, evidence=출처·occurrence, attention=라이선스 미확인, preview=시드 diff, action="새 구획으로 시딩") | `PatternDiscoveryCard.tsx`, `DomainSummaryCard.tsx` | `PatternSeedCard.test.tsx`: 신뢰 3신호 렌더, 라이선스 미확인 시 attention |
| **M0-5** 로컬 선반 | 🆕 `components/patterns/LocalPatternShelf.tsx`: `usePatterns()` **첫 소비자** → 카드 리스트(빈 상태 포함) | `EntityResolutionSheet` 리스트 골격 | `LocalPatternShelf.test.tsx`: 로딩/빈/N카드 |
| **M0-6** 시딩 훅 | 🆕 `hooks/usePatternSeed.ts`: `partitionsApi.create` → `patternToImportPayload` → `importOntology` → `logPatternEvent('pattern_seeded',source:'cache')` → `selectPartition`+reload. TTFG 타임스탬프 | `EmptyState.handleConfirmLoad`, `usePatterns` mutation | 훅 유닛(모킹) + 수동 E2E |
| **M0-7** EmptyState 통합 | ✏️ `EmptyState.tsx`: "패턴으로 시작" 영역 아래 `LocalPatternShelf` 주입 + 첫 진입 시 `session_started` 계측, 자유입력 시작 시 `free_input_started` | `EmptyState.tsx:296-318` CTA 스택 | 수동 확인 + 스냅샷 |
| **M0-8** 커밋 계측 | ✏️ 커밋 액션(스토어/`useCommits`)에 세션 첫 커밋 시 `first_commit` 1회 계측 | `useCommits.ts` | TTFG 집계에 값 등장 확인 |

**M0 완료 = PRD 수용기준 4개 전부 충족** (§9 추적표 참조).

---

### ▐ M1 · 공유 패턴 카탈로그 (소비 측 네트워크 효과)

| Task | Action | Mirror | Validate |
|------|--------|--------|----------|
| **M1-1** 컬럼 가산 | 🆕 마이그레이션 `..._bm_d01_m1_pattern_sharing.sql`(visibility·health·index·check) + `schema.ts`/`types.ts`/`rowToPattern` 동기화 | `l_m2_relation_layer.sql` | `apply_migration` + 타입체크 |
| **M1-2** 카탈로그 조회 API | ✏️ `api/patterns/route.ts` GET에 필터(`visibility`,`domain`,`source`,`q`)·정렬(`occurrence`,`health`,`recent`) 파라미터 추가. **하위호환 유지** | 기존 GET | `patterns-filter.test.ts` |
| **M1-3** 마켓플레이스 페이지 | 🆕 `app/marketplace/page.tsx` + `features/marketplace/components/{MarketplaceShell,MarketplaceHero,MarketplaceFilters,PatternGalleryCard,MarketplaceGrid}.tsx` + `hooks/useMarketplace.ts`. **에디토리얼 갤러리**(hero + 필터바 + 반응형 bento/그리드). 전용 셸(전역 네비 없음 → 상단 바 직접) | `frontend-design` 스킬 방향, `globals.css` 토큰, `web/design-quality.md` | 320/768/1024/1440 시각 회귀 + a11y |
| **M1-4** 패턴 상세 시트 | 🆕 `features/marketplace/components/PatternDetailSheet.tsx`: 카드 클릭 → 역할·CQ·traversal 전량 프리뷰 + "이 패턴으로 시작"·"내 맥락에 맞추기(적응)" | `EntityResolutionSheet`, `PatternDiscoveryCard` | 시트 상호작용 테스트 |
| **M1-5** 적응-후-시딩 | 🆕 `hooks/useAdaptSeed.ts`: 공유 패턴 → `discoverPatternApi`/adapt로 사용자 맥락 조정 → HITL diff → 시딩. `pattern_source:'shared'` 계측 | `discover-pattern` 파이프라인, `usePatternGeneration` | 유닛(adapt 모킹) |
| **M1-6** 진입점 | ✏️ `Toolbar`에 "마켓플레이스" 버튼 + `EmptyState`에 "카탈로그 둘러보기" 링크 → `/marketplace` | `Toolbar` 버튼 그룹 | 수동 네비게이션 |

---

### ▐ M2 · 발행 & 큐레이션 (공급 측 플라이휠)

| Task | Action | Mirror | Validate |
|------|--------|--------|----------|
| **M2-1** 발행 프리뷰 로직 | 🆕 `lib/patterns/publish.ts`: `buildPublishPreview(pattern)` = `maskIdentifiers`(역할/관계 name·description) + `buildPublishLicenseWarning([pattern])` + `computePatternHealth(pattern)`(CQ 커버리지·역할 연결성·라이선스 확인 → 0~100). **순수 함수** | `identifier-mask.ts`, `license.ts`, `metrics/health` 발상 | `publish.test.ts`(TDD): 마스킹·경고·헬스 경계 |
| **M2-2** 발행 API | 🆕 `api/patterns/[id]/publish/route.ts` POST: 게이트(라이선스 확인 or 사용자 승인) → 마스킹 적용 → `visibility` 설정 + `health` 저장 + `published` 계측 | `patterns/route.ts` POST | 라우트 테스트: 미확인 라이선스 미승인 시 거부 |
| **M2-3** 발행 카드 | 🆕 `components/patterns/PublishPatternCard.tsx`: `ConfirmCard`(마스킹 프리뷰 + attention=라이선스 경고 + org/public 선택 + 확인 게이트) | `PatternDiscoveryCard` attention 패턴 | `PublishPatternCard.test.tsx` |
| **M2-4** 발행 진입점 | ✏️ 수렴 패턴 보유 시(`store.activePattern`) RightPanel/`NeoConfirmSheet` 문맥에 "공유 패턴으로 발행" 액션 | `NeoConfirmSheet`(이미 license warning 배선) | 수동 |
| **M2-5** 큐레이션 랭킹 | 🆕 `lib/patterns/curation.ts`: `rankPatterns(patterns, {minOccurrence,minHealth})` → 임계 이하 dim/하단. `MarketplaceGrid`·`LocalPatternShelf` 적용 | `cache.ts` 순수 정렬 | `curation.test.ts`: 임계 정렬·dim 플래그 |

---

## 7. 디자인 시스템 준수 (Design Excellence)

`web/design-quality.md` 안티-템플릿 정책 + `frontend-design` 스킬 적용:

- **스타일 방향**: 에디토리얼/갤러리(Notion·Airtable Universe 벤치마크). 보라 1색 강조(`--primary`) + 순백 + 계층. bento/그리드-브레이킹 허용(마켓플레이스 페이지에서만).
- **필수 품질(4개 이상)**: ① 스케일 대비 위계(hero vs 카드) ② 불균일 리듬(패턴 간 간격) ③ overlap/shadow 깊이(`--elevation-*`) ④ 의미론적 색(신뢰 신호=색, 장식 아님) ⑤ 설계된 hover/focus/active ⑥ 데이터 시각화(occurrence·health를 배지/미터로).
- **금지**: 하드코딩 팔레트, 이모지, 균일 카드 그리드 무위계, shadcn 디폴트 그대로, 자동 다크모드 강제.
- **카드 문법**: 스튜디오 내 카드(SeedCard/PublishCard)는 `ConfirmCard` 4단 문법 **엄격 준수**. 마켓플레이스 갤러리 카드(`PatternGalleryCard`)는 페이지 전용이므로 문법을 **계승·확장**하되 토큰·배지 규칙은 동일.
- **컨테이너 규격**: `rounded-xl border border-border bg-card p-4 shadow-elevation-2`.
- **a11y**: `ecc:accessibility` — 키보드 내비, ARIA(`aria-label` 필터/카드), 대비 AA, `prefers-reduced-motion` 존중.

---

## 8. ECC 스킬 매핑 (단계별)

| 단계 | 스킬/에이전트 |
|------|---------------|
| 순수 로직(seed/publish/curation/events) | `ecc:tdd-workflow` (RED→GREEN→REFACTOR, 80%+) |
| React 컴포넌트 | `ecc:react-test` (RTL, 행동/접근성 우선) → 구현 |
| 마켓플레이스 페이지 디자인 | `frontend-design` + `ecc:design-system` + `make-interfaces-feel-better` |
| DB 마이그레이션 | `supabase-postgres-best-practices` + `ecc:database-reviewer` |
| 데이터 페칭/성능 | `vercel-react-best-practices` |
| 접근성 | `ecc:accessibility` / `a11y-architect` |
| 코드 리뷰(병렬) | `ecc:react-review` + `ecc:typescript-reviewer` + `ecc:security-review` |
| UI 가이드 점검 | `web-design-guidelines` |
| 시각 회귀/E2E | `ecc:e2e-runner` (Playwright, 4 breakpoints) |
| 완료·완전률 | §11 검증 루프 |

---

## 9. 수용 기준 추적표 (PRD Acceptance × Task × Test)

| PRD 수용기준 (M0) | 담당 Task | 검증 |
|-------------------|-----------|------|
| 신규 세션이 EmptyState에서 로컬 캐시 패턴을 카드로 보고, 1클릭으로 새 구획에 시딩 | M0-1,4,5,6,7 | `LocalPatternShelf`·`PatternSeedCard` 테스트 + 라이브 E2E(시딩→새 구획 선택됨) |
| `pattern_seeded`·TTFG 계측 → "패턴 vs 자유입력" 활성화 차이 숫자 비교 | M0-2,3,6,7,8 | `pattern_events` 삽입 + `?summary=ttfg` 코호트 반환 확인 |
| 각 패턴 카드에 출처·라이선스·사용빈도 노출(신뢰 100%) | M0-4 (+M1-3) | 카드 스냅샷: source badge·license·occurrence 3신호 존재 |
| 시딩은 adapt 파이프라인 경유 HITL 컨펌만(자동 확정 없음) | M0-1(프리뷰),4(컨펌),6 | 컨펌 전 그래프 미반영 테스트 + 라이브 확인 |

> **추가 목표(M1/M2)**: visibility 스코프·발행 수·provenance 노출률·큐레이션은 각 마일스톤 Task로 커버(§6). 최종 §11에서 PRD 전문 대비 완전률 재산정.

---

## 10. Validation (프로젝트 명령)

```bash
# Next 앱 루트: ontology/ontology/
pnpm test           # vitest run — 신규 순수함수/컴포넌트 유닛 (80%+)
pnpm lint           # next lint
pnpm build          # ⚠️ dev 서버 구동 중 실행 금지(.next 충돌 — 메모리 주의). dev 종료 후 실행
pnpm test:e2e       # playwright — 시딩·카탈로그 시각/상호작용
```

- 마이그레이션: Supabase MCP `apply_migration`(ref `mcxeejatzzotfskkwvyb`) → `list_tables`/`list_migrations` 확인 → Neo4j 무관(스테이징만).
- 라이브 검증: `mcp__supabase__execute_sql`로 `pattern_events` 삽입·TTFG 집계 실증.

---

## 11. 완전률 검증 & 이터레이션 루프 (개발 완료 후)

사용자 요구 — "PRD·계획문서·코드베이스·테스트 결과를 비교해 완전률 극대화, 이터레이션 고도화":

1. **추적표 재평가**(§9) — 각 수용기준을 코드+테스트 증거로 ✅/⚠️/❌ 판정.
2. **PRD 전문 스캔** — §4~6의 모든 요구를 Task 커버리지와 대조, 누락 항목 표로 산출(완전률 %).
3. **병렬 다관점 리뷰**(rules `agents.md`): 사실검증 / 시니어 엔지니어 / 보안 / 일관성 / 중복 리뷰어. CRITICAL·HIGH 우선 수정.
4. **디자인 QA** — `web-design-guidelines` + 시각 회귀(4 breakpoints) + Lighthouse(CWV 목표).
5. **갭 → 이터레이션** — 미충족 항목을 새 Task로 편입해 재구현 → 재검증. 완전률 정체 시까지 반복.
6. **문서 정리** — 완료 시 PRD를 `docs/진행중/`→`docs/완료/` 이동, `STATUS.md` 갱신, 메모리 기록.

---

## 12. Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| "adapt 파이프라인 경유" 문구 해석(로컬 캐시 재-adapt 여부) | High | **결정(AD-2)**: 로컬=결정적 변환+프리뷰+컨펌, 공유=adapt. HITL 컨펌은 양쪽 필수. 확인 요청 항목. |
| 패턴 번들에 계층(parentId)·색·위치 정보 없음 → 밋밋한 그래프 | Med | 변환기가 role heuristic으로 `--node-*` 색 램프 배정, parentId=null(플랫) 시작. 사용자가 스튜디오에서 조정(HITL 철학). |
| 전용 페이지에 전역 네비 부재 | Med | 마켓플레이스 셸에 자체 상단 바(뒤로/스튜디오) 구성. 시딩 후 `selectPartition`+reload로 스튜디오 복귀. |
| RLS deny-all에서 `pattern_events` 삽입 | Low | 앱은 Drizzle(`DATABASE_URL`)로 우회(기존 14테이블 동일). anon 노출만 차단. |
| `build`를 dev 구동 중 실행 시 `.next` 충돌 | Med | dev 종료 후 build. 메모리 [[dev-server-turbopack-crash]] 준수. |
| 저품질 패턴 범람(M2) | Med | 큐레이션 임계(occurrence/health) + 발행 게이트(자동 발행 없음) — PRD §5 대응 그대로. |
| 스코프 과다(3 마일스톤 한 번에) | High | M0를 독립 배포 가능 크리티컬 패스로 분리. 확인 시 범위 선택 가능(M0만/ M0+M1 / 전량). |

---

## 13. 실행 순서 (One-Go)

```
M0-1(seed)·M0-2(events/DB) 병렬 [TDD]
  → M0-3(events API) → M0-4(SeedCard)·M0-5(Shelf) 병렬 → M0-6(hook) → M0-7(EmptyState)·M0-8(commit 계측)
  → ✅ M0 검증(수용기준 4) + 라이브 계측 실증
M1-1(컬럼) → M1-2(필터 API) → M1-3(갤러리 페이지)[frontend-design] → M1-4(상세 시트)·M1-5(적응시딩) → M1-6(진입점)
  → ✅ M1 시각/a11y 검증
M2-1(publish 로직)[TDD] → M2-2(publish API) → M2-3(발행 카드) → M2-4(진입점) → M2-5(큐레이션)
  → ✅ M2 검증
→ §11 완전률 루프 → 병렬 리뷰 → 문서/메모리 정리
```

---

## Acceptance (플랜 자체)

- [ ] 모든 Task 완료 + `pnpm test`/`lint`/`build` 그린
- [ ] PRD 수용기준(M0 4개) 라이브 실증
- [ ] 신규 코드는 지능 로직 재사용, 변환기/UI/계측만 신규(§0 방침 준수)
- [ ] 디자인 시스템 준수(semantic 토큰·ConfirmCard 문법·안티-템플릿)
- [ ] 완전률 %와 잔여 갭 표 산출 → 이터레이션
