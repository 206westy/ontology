# PRD-PF-A — 기초공사: 멀티 온톨로지 · 워크스페이스 · 테넌시 · RLS (Phase 0, 전 기능의 토대)

> **스코프:** 신규 컨테이너 테이블(`workspaces`/`ontologies`/`memberships`) 신설 + 기존 전 테이블에 `ontology_id` 소급 백필 + RLS를 deny-all에서 워크스페이스 멤버십 스코프로 전환 + git-for-data(branches/commits/merge_requests)를 전역 스코프에서 온톨로지 스코프로 승격.
> **의존 PRD:** 없음(최선행). 이후 모든 PRD(PRD-PF-B 문제정의 진입점, PRD-PF-C 결정 함수 엔진, PRD-PF-D 액션보드, D01 패턴 마켓플레이스, D02 time-travel/blame 등)는 본 PRD가 만드는 `ontology_id` 스코프 위에 얹힌다.
> **작성일:** 2026-07-12
> **원칙:** 비판적 옹호(critically supportive) · 기존 자산 재배치 우선 · shadcn/ui · 한국어 UI · HITL · 시각 언어(클래스=원·인스턴스=점·is-a=파선·관계=실선) 보존 · 과대약속 금지

---

## 0. 한 줄 요지

지금 우리 제품은 **"단일 사용자·단일 전역 그래프"** 다 — 21개 테이블 중 `user_id`/`workspace_id`/`ontology_id`를 가진 테이블이 **0개**이고, RLS는 14개 테이블에서 **deny-all**(사실상 서비스롤 우회로만 동작)이다. SaaS도, "문제마다 온톨로지를 재사용·확장(commit)·분기(branch)한다"는 우리 비전도, 이 기초 없이는 성립하지 않는다. 이 PRD는 신규 인프라(새 DB·새 인증 시스템)를 도입하지 않고, **이미 있는 조각들 — Supabase Auth, `partitions`의 백필 선례, git-for-data(`commits`/`branches`/`merge_requests`), service-role Drizzle 접근 패턴 — 을 재배치**해 워크스페이스·온톨로지 컨테이너를 세우고, 21개 테이블에 스코프 키를 소급하며, RLS를 실효성 있게 만든다. 온톨로지 1개를 선택했을 때의 편집 경험(캔버스·HITL 컨펌·Critic·시각 언어)은 **오늘과 완전히 동일하게 보존**된다 — 바뀌는 건 "어떤 온톨로지를 보고 있는가"라는 스코프 한 겹이 새로 생긴다는 것뿐이다.

---

## 1. 목적 (Purpose)

### 왜 지금, 이게 최우선인가

`strategy/2026-07-12-platform-expansion-plan.md`(2026-07-12 작성) 코드베이스 실사 결과는 명확하다:

- **`classes`/`instances`/`edges`/`properties`/`relation_types`/`constraints`/`partitions`/`patterns`/`term_glossary`/`relation_glossary`/`commits`/`commit_details`/`branches`/`merge_requests`/`attributions`/`axioms`/`validation_results` 등 전 테이블에 워크스페이스·온톨로지·사용자 스코프 컬럼이 0건.**
- RLS는 14개 테이블에서 **deny-all**로 설정되어 있으나, 실제 서버 데이터 경로(`src/lib/supabase/server.ts`)는 **`SUPABASE_SERVICE_ROLE_KEY`로 RLS를 완전히 우회**한다(`auth-server.ts` 주석: *"server.ts(createClient/createPureClient)는 SERVICE_ROLE_KEY로 RLS를 우회하는 데이터 API 전용"*). 즉 **현재 RLS 정책은 실질적으로 애플리케이션 동작에 아무 영향이 없다** — 이건 이번 PRD가 반드시 정직하게 짚어야 할 사실이다(§5.2).
- `partitions`(구획)는 이미 "단일 전역 그래프 내부의 논리적 서브그래프" 개념으로 존재하지만, 그 자체가 전역(`UNIQUE(name)` 전역 유니크)이라 워크스페이스/온톨로지 경계 역할을 못 한다.
- `branches`는 전역 `UNIQUE(name)`이다 — 지금 "main"이라는 브랜치는 전체 시스템에 딱 하나만 존재할 수 있다. 온톨로지가 여러 개가 되는 순간 이 제약은 즉시 깨진다.

**우리 북극성 3축("온톨로지의 Git" · "스케치북→운영 온톨로지" · "AI=Critic") 중 어느 것도 온톨로지가 하나뿐인 세계에서는 SaaS로 확장되지 않는다.** `strategy/2026-07-12-platform-expansion-plan.md` Part 6이 결론 낸 "우리가 이길 수 있는 자리" — *"문제마다 온톨로지가 재사용·확장·분기되며 복리로 자라는 구조"* — 의 기술적 전제조건이 정확히 이 PRD다. 이걸 미루면 나머지 5개 축(문제정의·결정함수·액션보드·데이터셋 재사용·패턴 마켓플레이스)이 전부 단일 그래프에 갇혀 의미가 없어진다.

### 비판적 옹호 포인트 — 우리가 이미 가진 선례

이 마이그레이션이 처음이 아니다. `classes.partition_id`는 이미 **정확히 같은 패턴**으로 소급됐다: `NOT NULL` + `DEFAULT '00000000-0000-0000-0000-000000000001'`(기본 구획 UUID)로 추가되고 기존 행이 자동 백필됐다(`schema.ts` 주석: *"PRD-B B-1: 소속 구획 (NOT NULL, 기본 구획 default + 백필됨)"*). `relation_types.category`도 같은 원칙(`ADD COLUMN ... DEFAULT 'descriptive'`, 마이그레이션 `0001_relation_types_category.sql`)으로 소급됐다. **우리는 이미 이 수술을 두 번 해봤고, 두 번 다 성공했다.** 이번엔 규모가 21개 테이블로 크지만, 검증된 방법론(가산적 컬럼 + DEFAULT 백필 + 이후 제약 강화)을 그대로 확장하는 것이지 새로운 리스크 유형이 아니다.

---

## 2. 목표 & 지표 (Goals & Metrics)

| 목표 | 지표 | 현재 | 목표 |
|---|---|---|---|
| 컨테이너 신설 | `workspaces`/`ontologies`/`memberships` 테이블 존재 | 0개 | 3개 신설, FK·RLS 배선 완료 |
| 스코프 소급 커버리지 | `ontology_id` NOT NULL을 확보한 대상 테이블 비율 | 0/21 | 21/21 (100%) |
| RLS 실효성 | deny-all 정책 → 멤버십 스코프 정책으로 교체된 테이블 수 | 14개 deny-all | 21개 스코프 정책(신규 3테이블 포함 24개) |
| 앱 계층 가드 | 스코프 테이블 대상 Drizzle 쿼리 중 `ontology_id`/멤버십 필터 누락 건수(계약 테스트) | 미측정(사실상 0% 강제) | 0건(정적 검사·계약 테스트로 100% 강제) |
| git-for-data 승격 | 전역 `UNIQUE` 제약 잔존 개수(`branches.name` 등) | 1건 이상(전역) | 0건(전부 `UNIQUE(ontology_id, ...)`로 전환) |
| 편집 경험 회귀 0 | 온톨로지 1개 선택 시 기존 캔버스/커밋/브랜치/HITL/Critic 회귀 테스트 통과율 | — | 100%(기존 테스트 스위트 전량 통과) |
| 데이터 무결성 | 백필 후 "고아 행"(스코프 키 NULL 또는 상위 구획과 온톨로지 불일치) 건수 | — | 0건(계약 테스트) |

> **북극성 정합:** 이 PRD 자체는 사용자 체감 신기능이 아니다. 지표는 **"SaaS로 팔 수 있는 최소 조건"**(테넌시 격리·감사 가능한 RLS)과 **"문제마다 온톨로지가 자라는 구조"**의 존재 여부를 측정한다. D02(git-for-data 나머지 절반)의 감사추적·blame도 이 스코프 위에서만 의미를 가진다.

---

## 3. 기술 스택 (기존 자산 재배치 우선)

새로 도입하는 인프라는 **컨테이너 테이블 3개뿐**이다. 인증·서버 접근 방식·git-for-data·구획 개념은 전부 있는 것을 승격·재배치한다.

| 카테고리 | 있는 것(재사용) | 보강 | 신규 |
|---|---|---|---|
| 인증·세션 | Supabase Auth(`auth.users`), `auth-server.ts`(ANON 키+쿠키, `getCurrentUser()`), `server.ts`(SERVICE_ROLE_KEY Drizzle) | API 라우트마다 멤버십 검증 헬퍼(`requireOntologyAccess(ontologyId, user)`) 신설·강제 적용 | 없음 — 사용자 인증 자체는 이미 있음 |
| 컨테이너 계층 | `partitions`(구획, 단일그래프 내부 서브그래프 개념) — 온톨로지 하위 개념으로 재배치 | `partitions.ontology_id` 추가, `uq_partition_name`(전역) → `uq_partition_name_per_ontology(ontology_id, name)` | **`workspaces`**(회사/팀 경계) · **`ontologies`**(재사용 가능한 지식자산 컨테이너) · **`memberships`**(user×workspace role) |
| git-for-data | `commits`/`commit_details`/`branches`/`merge_requests`(`base_snapshot` jsonb) — PRD-J GitFlow 자산 | `branches` `UNIQUE(name)` 전역 → `UNIQUE(ontology_id, name)`, `commits`/`merge_requests`에 `ontology_id` 소급(+ `branches` FK 배선 확인) | 없음 — 테이블 신설 없이 스코프 컬럼만 추가 |
| 스키마 자산(21테이블) | `classes`/`properties`/`instances`/`instance_values`/`relation_types`/`edges`/`constraints`/`validation_results`/`attributions`/`axioms`/`axiom_classes`/`patterns`/`term_glossary`/`relation_glossary` | 전 테이블 `ontology_id` 소급 백필(`classes.partition_id` 백필과 **동일 패턴**: `NOT NULL` + `DEFAULT <기본 온톨로지 UUID>`) | 없음 |
| RLS | Supabase RLS 활성(14테이블 deny-all, `.cursor/rules/supabase.mdc` 가이드라인 준수) | deny-all → 워크스페이스 멤버십 스코프 정책(`memberships` 서브쿼리 기반)으로 전면 교체 | 없음 — 정책 교체만 |
| Drizzle ORM | `src/lib/drizzle/schema.ts` 단일 스키마 파일 | 신규 테이블 3종 정의·`relations` 배선, 기존 테이블 컬럼 추가 | 스코프 강제 헬퍼(쿼리 빌더 래퍼 또는 린트 규칙) |
| UI | 단일 캔버스 진입(`app/page.tsx`), shadcn/ui 컴포넌트 taxonomy | 캔버스 진입 앞단에 온톨로지 선택/전환 스크린 추가 | `WorkspaceSwitcher`/`OntologySwitcher`(shadcn `Command`/`Popover` 기반, 기존 톤 유지) |

**핵심 통찰:** 우리는 이미 "가산적 컬럼 + DEFAULT 백필 + 이후 제약 강화"라는 무중단 마이그레이션 방법론을 `partitions`·`relation_types.category`에서 두 번 증명했다. 이번 PRD는 같은 방법론을 21개 테이블로 **기계적으로 확장**하는 것이지, 새로운 마이그레이션 전략을 발명하는 게 아니다.

---

## 4. 방향 (마일스톤 로드맵)

> 순서 근거: **컨테이너 신설(파괴 없음) → 백필(가산적) → 제약 강화(가장 위험, 마지막) → RLS 전환 → git-for-data 승격 → UI 전환**. 각 단계는 이전 단계가 계약 테스트를 통과해야 다음으로 진행한다.

### M1 — 컨테이너 테이블 신설 (파괴 없음)
- `workspaces`(회사/팀 경계) · `ontologies`(워크스페이스 소속, 재사용 가능한 지식자산) · `memberships`(user × workspace role) 3개 테이블 신설.
- 부트스트랩: 기존 유일 사용자를 위한 기본 워크스페이스 1개 + 기본 온톨로지 1개를 고정 UUID로 시드(`partitions`의 `'00000000-0000-0000-0000-000000000001'` 관례를 그대로 계승), 해당 사용자를 `role='owner'`로 `memberships`에 등록.
- 이 단계는 기존 테이블을 전혀 건드리지 않는다 — 회귀 위험 0.

### M2 — 스코프 컬럼 소급 (가산적 백필)
- 21개 테이블에 `ontology_id uuid REFERENCES ontologies(id)` 컬럼을 `DEFAULT <기본 온톨로지 UUID>`로 추가(단, 아래 §5.2 표에서 정한 예외·특수 케이스 제외). `classes.partition_id` 백필과 동일한 3단계: (1) nullable로 추가 → (2) 기존 행 UPDATE로 기본값 채움 → (3) `NOT NULL` 제약.
- 폴리모픽 테이블(`attributions`, `validation_results`)은 `target_table`/`target_id`로는 온톨로지를 직접 조인할 수 없으므로 `ontology_id`를 **직접 컬럼으로 중복 저장**(denormalize)한다 — RLS 정책이 다단 조인 없이 동작해야 하기 때문.
- **미리 짚는 리스크:** `classes.ontology_id`와 `classes.partition_id → partitions.ontology_id`가 서로 다른 값을 가질 수 있는 이중 스코프 키 드리프트 — §5.3 R1에서 트리거로 방지.

### M3 — 제약 강화 · git-for-data 승격 (가장 위험한 단계)
- `partitions.uq_partition_name`(전역) → `uq_partition_name_per_ontology(ontology_id, name)`.
- `branches.UNIQUE(name)`(전역) → `UNIQUE(ontology_id, name)`.
- **사전 확인 필수(구현 착수 전 재조사 항목):** 현재 `commits` 테이블 정의에서 `branch_id` 컬럼이 확인되지 않았다(schema.ts 리뷰 결과 `commits`는 `id`/`message`/`pushedToNeo4j`/`pushedAt`/`isAutoSave`/`createdAt`만 보유). `branches`↔`commits`의 실제 연결 방식(별도 조인 테이블인지, `branches.head_commit_id`인지)을 구현 착수 전 코드베이스에서 재확인하고, 필요 시 `commits.branch_id`를 이 마일스톤에서 함께 추가한다. **이 PRD는 이 연결 방식을 단정하지 않는다** — §8 열린결정 참조.
- `ontologies.default_branch_id`(nullable FK → `branches.id`)를 추가하고, 기본 온톨로지에 기존 전역 브랜치를 연결.

### M4 — RLS 전환 (deny-all → 멤버십 스코프)
- `workspaces`/`ontologies`/`memberships` 및 21개 기존 테이블 전체에 `USING (ontology_id IN (SELECT o.id FROM ontologies o JOIN memberships m ON m.workspace_id = o.workspace_id WHERE m.user_id = auth.uid()))` 형태의 SELECT/INSERT/UPDATE/DELETE 정책 배선(신규 3테이블은 `workspace_id` 직접 스코프).
- **정직하게 명시:** 서버 데이터 경로(`server.ts`, SERVICE_ROLE_KEY)는 RLS를 완전히 우회한다. 이번 RLS 전환은 (a) 향후 클라이언트가 anon/authenticated 키로 Supabase에 직접 접근하는 경로(실시간 구독 등)에 대한 방어선, (b) 규제·감사 관점에서 "DB 레벨 접근 제어가 존재한다"는 근거로서 의미가 있다 — **애플리케이션의 실제 1차 방어선은 §5.2에서 정의하는 API 라우트 계층의 멤버십 검증**이다.

### M5 — UI 전환 (온톨로지 선택/전환)
- 캔버스 진입(`app/page.tsx`) 앞단에 **워크스페이스/온톨로지 선택 화면** 추가(shadcn `Command`/`Popover`, 기존 톤 유지). 온톨로지 1개를 선택하면 그 안에서의 편집 경험(캔버스·커밋·브랜치·HITL 컨펌·Critic·시각 언어)은 **오늘과 100% 동일**하게 유지된다.
- 기존 사용자는 첫 로그인 시 자동으로 기본 워크스페이스·기본 온톨로지로 랜딩(마이그레이션 이전과 동일한 경험, 선택 화면은 온톨로지가 2개 이상일 때만 노출).

---

## 5. 방법론 (설계 · 데이터모델 · 리스크와 완화)

### 5.1 데이터모델 스케치

```
workspaces
 └─ memberships (user × workspace, role)
 └─ ontologies (워크스페이스 소속, git-for-data로 버전·분기)
     ├─ partitions (온톨로지 내부 서브그래프 — 기존 "구획" 개념 그대로, 승격만)
     │   └─ classes / instances / edges / properties / relation_types / constraints / axioms ...
     ├─ branches (UNIQUE(ontology_id, name)) ── commits ── commit_details
     └─ merge_requests (source/target branch, 둘 다 같은 ontology_id)
```

#### 신규 테이블 컬럼 스케치

**`workspaces`**
| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | uuid | PK, default random |
| name | text | not null |
| slug | text | not null, unique |
| created_by | uuid | references auth.users(id) |
| created_at / updated_at | timestamptz | not null, default now() |

**`ontologies`**
| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | uuid | PK, default random |
| workspace_id | uuid | not null, references workspaces(id) on delete cascade |
| name | text | not null |
| slug | text | not null |
| description | text | default '' |
| default_branch_id | uuid | nullable, references branches(id) — M3에서 배선 |
| forked_from_ontology_id | uuid | nullable, self-FK — "확장/재사용" 계보(§8 열린결정, 이번 PRD는 컬럼만 준비하고 의미론은 후속 PRD에 위임) |
| created_by | uuid | references auth.users(id) |
| created_at / updated_at | timestamptz | not null, default now() |
| — | — | UNIQUE(workspace_id, slug) |

**`memberships`**
| 컬럼 | 타입 | 제약 |
|---|---|---|
| workspace_id | uuid | not null, references workspaces(id) on delete cascade |
| user_id | uuid | not null, references auth.users(id) on delete cascade |
| role | text | not null, default 'editor', CHECK IN ('owner','admin','editor','viewer') |
| created_at | timestamptz | not null, default now() |
| — | — | PRIMARY KEY(workspace_id, user_id) |

> role별 정확한 CRUD 권한 매트릭스(예: viewer는 커밋 불가, editor는 커밋 가능하나 브랜치 삭제 불가 등)는 이번 PRD에서 4단계 라벨만 정의하고 세부 매트릭스는 후속 PRD(정책 파일)로 넘긴다 — §8 열린결정.

#### 기존 테이블 소급 정리

| 테이블 | 스코프 처리 |
|---|---|
| `classes`/`properties`/`instances`/`instance_values`/`relation_types`/`edges`/`constraints`/`axioms`/`axiom_classes` | `ontology_id` 직접 추가(자식 테이블도 RLS 정책 단순화를 위해 조인 대신 직접 컬럼 — `classes.partition_id`처럼 부모를 통해서도 유추 가능하지만 정책 성능 위해 중복 저장) |
| `validation_results`/`attributions` | 폴리모픽(`target_table`+`target_id`) — `ontology_id` 직접 컬럼 필수, 백필 시 `target_table` 기준 CASE 조인으로 채움 |
| `partitions` | `ontology_id` 추가, `uq_partition_name` → `uq_partition_name_per_ontology(ontology_id, name)` |
| `patterns`/`term_glossary`/`relation_glossary` | **특수 케이스 — §8 열린결정.** 패턴/어휘집은 D01 마켓플레이스에서 "재사용 가능한 공유 자산"으로 설계되는 중이라 온톨로지 1:1 스코프가 맞지 않을 수 있음. 이번 PRD에서는 `workspace_id`(nullable, NULL=공용 라이브러리 시드) + `is_public boolean default false`만 추가하고, 온톨로지 단위 스코프는 강제하지 않는다 |
| `commits`/`commit_details`/`branches`/`merge_requests` | §4 M3 참조 — `ontology_id` 직접 추가 + `branches` UNIQUE 재정의. `commit_details`는 부모 `commits`를 통해 스코프 유추 가능하나 RLS 정책 단순화를 위해 `ontology_id` 중복 저장 권장 |

### 5.2 정직한 아키텍처 진단 — RLS는 오늘 아무것도 안 지킨다

`src/lib/supabase/server.ts`는 `SUPABASE_SERVICE_ROLE_KEY`로 Drizzle 클라이언트를 만든다. Supabase의 service-role 키는 **RLS를 항상 완전히 우회**한다(Postgres `BYPASSRLS` 권한과 동일 효과). 즉:

- 현재 "14테이블 deny-all"은 **서버가 데이터를 읽고 쓰는 실제 경로에 아무 영향을 주지 않는다.** 인증은 `auth-server.ts`(ANON 키+쿠키, `getCurrentUser()`)로 세션만 확인하고, 그 뒤 실제 쿼리는 스코프 검사 없이 서비스롤로 전 테이블에 접근 가능하다.
- **따라서 이번 PRD에서 RLS 정책을 워크스페이스 스코프로 바꾼다고 해서 애플리케이션이 자동으로 안전해지지 않는다.** RLS는 (a) 미래에 클라이언트가 anon/authenticated 키로 Supabase에 직접 접근하는 경로(예: 실시간 구독, 향후 클라이언트 컴포넌트 직접 쿼리)에 대한 방어선이고, (b) 감사·규제 관점에서 "DB 레벨 접근통제가 존재한다"는 근거다.
- **실제 1차 방어선은 애플리케이션 계층이어야 한다.** 모든 API 라우트가 쿼리 실행 전에 `requireOntologyAccess(ontologyId, user)` 헬퍼로 (i) 세션 사용자 확인, (ii) 해당 `ontology_id`가 속한 `workspace_id`에 대한 `memberships` 존재 확인을 강제해야 한다. 이 헬퍼가 없으면 서비스롤 접근 자체가 무방비 상태로 남는다.
- **계약 테스트로 강제:** 스코프 대상 테이블에 대한 모든 Drizzle 쿼리가 `ontology_id` 필터를 포함하는지 정적 검사(코드 리뷰 룰 또는 커스텀 린트)로 확인하고, 통합 테스트에서 "워크스페이스 B 멤버가 워크스페이스 A의 온톨로지를 API로 조회할 수 없다"를 음성 테스트로 검증한다.

이건 이번 PRD가 "RLS만 켜면 끝"이라고 과대약속하지 않기 위한 필수 정직 진단이다.

### 5.3 리스크 & 완화

- **R1. 소급 마이그레이션 데이터 무결성.** 21개 테이블 동시 변경은 크지만, `classes.partition_id`·`relation_types.category`에서 이미 검증된 "가산적 컬럼 → DEFAULT 백필 → NOT NULL 강화" 3단계를 그대로 반복하는 것이다. **완화:** 테이블별로 마이그레이션 파일을 분리(`.cursor/rules/supabase.mdc` 원칙 "Keep migrations small" 준수), 각 파일은 전/후 행 수 일치 계약 테스트를 동반. `classes.ontology_id`와 `classes.partition_id → partitions.ontology_id`의 드리프트는 트리거(`BEFORE INSERT OR UPDATE`)로 두 값 불일치 시 예외를 던져 원천 차단.
- **R2. RLS와 서버 role 정합.** §5.2에서 분석한 대로 서비스롤이 RLS를 우회하므로, RLS 정책만으로는 보안이 완성되지 않는다. **완화:** `requireOntologyAccess` 헬퍼를 모든 스코프 API 라우트의 필수 진입점으로 강제하고, 이를 빼먹은 라우트를 잡아내는 계약 테스트(음성 테스트: 타 워크스페이스 데이터 접근 시도가 전부 403)를 CI 게이트에 포함.
- **R3. 대규모 스키마 변경.** 21개 이상 테이블을 건드리는 마이그레이션은 회귀 위험이 크다. **완화:** Supabase 브랜치(스테이징 DB)에서 전체 마이그레이션을 먼저 적용·검증한 뒤 프로덕션에 반영, 각 마일스톤(M1~M5)마다 기존 lint·프로덕션 빌드·테스트 스위트 전량 재실행, 롤백 스크립트(컬럼 DROP)를 각 마이그레이션 파일과 함께 준비.
- **R4. `branches`↔`commits` 연결고리 불확실.** 이번 리서치에서 `commits` 테이블 정의에 `branch_id` 컬럼이 보이지 않았다 — 브랜치-커밋 연결 방식(별도 조인 테이블 vs `branches.head_commit_id` vs 아직 미구현)이 확인되지 않은 채로 이 PRD를 작성했다. **완화:** M3 착수 전 코드베이스(`branch-replay.ts`, PRD-J 관련 API 라우트)를 재확인해 실제 연결 방식을 확정하고, 필요 시 `commits.branch_id` 추가를 M3 범위에 포함시킨다. 이 PRD는 그 결과를 단정하지 않는다(§8).
- **R5. `patterns`/어휘집 스코프 미확정.** 패턴 마켓플레이스(D01)의 "재사용 가능한 공유 자산" 설계와 온톨로지 1:1 스코프가 충돌할 수 있다. **완화:** 이번 PRD에서는 강제 스코프를 걸지 않고 `workspace_id`(nullable)+`is_public` 플래그만 추가, 정확한 모델은 D01과 조율해 후속 PRD에서 확정.

---

## 6. 수용 기준 (Acceptance Criteria)

- [ ] `workspaces`/`ontologies`/`memberships` 테이블이 생성되고, 기존 유일 사용자가 기본 워크스페이스의 `owner`로 자동 등록된다.
- [ ] 21개 대상 테이블(§5.1 표) 전부 `ontology_id`(또는 명시된 예외 처리)가 `NOT NULL`로 채워지며, 백필 전후 행 수가 100% 일치한다(계약 테스트).
- [ ] `classes.ontology_id`와 `classes.partition_id`가 가리키는 온톨로지가 항상 일치함이 트리거로 강제된다(불일치 INSERT/UPDATE는 거부).
- [ ] `partitions.uq_partition_name`이 `uq_partition_name_per_ontology(ontology_id, name)`으로 교체되고, 서로 다른 온톨로지에서 동일 구획명 사용이 허용된다.
- [ ] `branches.UNIQUE(name)`이 `UNIQUE(ontology_id, name)`으로 교체되고, 서로 다른 온톨로지에서 동일 브랜치명("main" 등) 사용이 허용된다.
- [ ] 24개 테이블(신규 3 + 기존 21) 전체에서 deny-all RLS 정책이 워크스페이스 멤버십 스코프 정책으로 교체된다.
- [ ] 모든 스코프 API 라우트가 `requireOntologyAccess`를 통과해야 쿼리가 실행되며, 워크스페이스 B 멤버가 워크스페이스 A의 데이터를 API로 조회/수정 시도하는 음성 테스트가 전부 403으로 거부된다.
- [ ] 온톨로지 1개를 선택했을 때의 캔버스 편집 경험(노드 생성·커밋·브랜치·MR·HITL 컨펌카드·Critic 판정·시각 언어)이 마이그레이션 전과 기능적으로 동일하다(기존 회귀 테스트 스위트 100% 통과).
- [ ] 온톨로지가 2개 이상인 워크스페이스에서 온톨로지 선택/전환 화면이 노출되고, 온톨로지가 1개뿐인 경우(기본 상태) 기존과 동일하게 자동 진입한다.
- [ ] 공통: 신규 UI는 shadcn/ui·한국어·기존 배지 taxonomy 준수, lint·프로덕션 빌드·기존 테스트 회귀 0.
- [ ] 문서: 이 PRD가 만든 `ontology_id` 스코프가 후속 PRD(PRD-PF-B 문제정의 진입점, PRD-PF-C 결정 함수, D01 패턴 마켓플레이스, D02 blame/audit)의 전제임을 각 문서 STATUS에 상호 참조.

---

## 7. 결론 (비판적 옹호 요약)

우리는 3단계(온톨로지 구축)와 3.5단계(버전관리)에서 세계 수준의 자산을 쌓았지만, 그 전부가 **"온톨로지가 하나뿐인 세계"**에 갇혀 있다. 이건 기능 부족이 아니라 **기초의 부재**다 — SaaS로 팔 수 있는 최소 조건(테넌시 격리)도, 우리가 팔란티어와 다르게 이길 수 있다고 결론 낸 "문제마다 온톨로지가 재사용·확장·분기되며 자라는" 구조도, 이 기초 없이는 슬로건에 그친다. 다행히 이 수술은 처음이 아니다 — `partitions`·`relation_types.category`에서 이미 같은 가산적 백필 방법론을 검증했고, git-for-data(`commits`/`branches`/`merge_requests`) 인프라도 이미 있다. 새로 짓는 건 컨테이너 테이블 3개뿐이고, 나머지는 전부 재배치다. 동시에 이 PRD는 정직해야 한다: RLS 전환만으로 보안이 완성된다는 착시를 경계하고(서비스롤 우회 사실을 명시), 21개 테이블 동시 변경의 무결성 리스크를 트리거·계약 테스트로 구조적으로 막으며, `branches`↔`commits` 연결고리처럼 확인이 필요한 부분은 단정하지 않고 열어 둔다. **이 PRD가 끝나면 온톨로지 1개를 선택했을 때의 사용자 경험은 오늘과 완전히 같다 — 달라지는 건, 이제 온톨로지가 여러 개일 수 있고, 그것이 워크스페이스라는 신뢰 경계 안에서 안전하게 격리된다는 것이다.**

---

## 8. 열린 결정 / 불가 기능

### 열린 결정 (후속 PRD 또는 구현 착수 시 확정 필요)

1. **`patterns`/`term_glossary`/`relation_glossary`의 정확한 스코프.** 온톨로지 1:1인지, 워크스페이스 공유 자산인지, 전역 공개 라이브러리(D01 마켓플레이스)인지 — 이번 PRD는 `workspace_id`(nullable)+`is_public` 플래그만 추가하고 확정하지 않았다.
2. **온톨로지 간 재사용의 정확한 의미론.** "재사용"이 참조(같은 `ontology_id`를 여러 문제가 공유)인지, "확장"이 같은 온톨로지에 커밋을 쌓는 것인지는 명확하지만, "분기 후 완전히 다른 워크스페이스로 복제"하는 **fork/clone 의미론**(`ontologies.forked_from_ontology_id` 컬럼만 준비)은 PRD-PF-B(문제정의 진입점)로 위임한다.
3. **`branches`↔`commits`의 실제 연결 방식.** 이번 리서치에서 `commits` 스키마에 `branch_id`가 확인되지 않았다 — 구현 착수 전 코드베이스 재확인이 필요하며, 그 결과에 따라 M3의 마이그레이션 내용이 달라질 수 있다.
4. **role 세분화의 정확한 권한 매트릭스.** `owner`/`admin`/`editor`/`viewer` 4단계 라벨은 정의했지만, 각 role이 커밋/브랜치 삭제/MR 병합/멤버 초대 등 어떤 동작을 할 수 있는지 세부 CRUD 매트릭스는 후속 정책 문서로 넘긴다.
5. **기존 실사용 데이터의 귀속.** 마이그레이션 시점에 존재하는 유일 사용자·유일 그래프를 어느 워크스페이스/온톨로지로 귀속시킬지는 자동 부트스트랩(기본 워크스페이스 owner)으로 처리하되, 실제 계정 확정은 구현 착수 시 수동 확인이 필요하다.

### 불가 기능 (이번 PRD 범위 아님, 과대약속 금지)

- **워크스페이스 간 데이터 공유·협업**(외부 파트너를 다른 워크스페이스에서 초대해 같은 온톨로지 편집) — 이번 PRD는 워크스페이스 내부 멀티 온톨로지까지만 다룬다.
- **결제/구독 티어와 워크스페이스 인원수·온톨로지 개수 연동**(빌링 로직) — 스코프 아웃.
- **SSO/SAML 등 엔터프라이즈 인증** — Supabase Auth 기본 인증만 전제.
- **실시간 다인 동시편집(OT/CRDT)** — 멤버십은 생기지만, 같은 온톨로지를 여러 명이 동시에 편집할 때의 충돌 해결은 범위 밖(현재도 없음, 유지).
- **온톨로지 마켓플레이스 공개 배포** — 그건 D01(패턴 마켓플레이스) PRD의 몫이며, 이번 PRD는 그 전제가 되는 `is_public`/`workspace_id` 컬럼만 준비한다.
