# Plan: PRD-PF-A(기초공사) + PRD-PF-B(결정함수 레이어)

**Source PRDs**: `docs/진행전/PRD-PF-Modify/` — `PRDPFAfoundationmultitenancy.md`, `PRDPFAIMPLmigrationspec.md`, `PRDPFBontologylayersredefinition.md` (+ INDEX roadmap)
**Selected Milestone**: Phase 0 (A: M1~M5) + Phase 1 (B: M0~M5, Tier 1만)
**Complexity**: Large

## 확정 결정 (2026-07-14)
1. **두 버전 진입점 = 라우트 분리.** `/` = 스튜디오 단독(현재 경험 유지), `/platform` = PF-C~I 워크플로우(후속). A·B는 두 버전 공통 백엔드. 이번엔 런처 + `/`(스튜디오)까지, `/platform` 셸은 PF-C에서.
2. **마이그레이션 = 라이브 직접 적용** (supabase MCP `apply_migration`) + `supabase/migrations/*.sql` 파일 동시 저장.
3. **B = Tier 1(선언적 AST)만 이번 구현**, Tier 2(샌드박스 TS 코드) 후속 PRD.

## Summary
A는 단일 전역 그래프를 멀티 온톨로지 SaaS 기반으로 승격한다: `workspaces`/`ontologies`/`memberships` 신설 + 17개 도메인 테이블에 `ontology_id` 소급(가산→백필→NOT NULL) + 전역 UNIQUE 재정렬 + 앱계층 `requireOntologyAccess` 가드(1차 방어) + RLS 멤버십 스코프(2차 방어). B는 kinetic 라벨을 일급 결정함수로 승격한다: `functions`/`decision_results` 신설 + 순수·결정론·감사가능 AST 평가기 + 자연어→AST AI 초안 + HITL 컨펌 + 함수 시각화. 온톨로지 1개 선택 시 기존 스튜디오 경험은 100% 보존.

## Patterns to Mirror (코드베이스 근거)
| Category | Source | Pattern |
|---|---|---|
| 소급 백필 | `schema.ts:49` `classes.partitionId` (default `'00000...001'`) · `20260617000001_v5_add_partitions.sql` | 가산 컬럼 + DEFAULT 백필 + NOT NULL 3단계 (검증된 선례) |
| Drizzle 테이블 | `schema.ts` `pgTable`(uuid `defaultRandom()`, `check()`, `unique()`, `index()`, `relations()`) | 신규 5테이블 동일 컨벤션 |
| API 라우트 | `src/app/api/classes/route.ts` | `getDb()` → zod safeParse → Drizzle → `handleApiError`/`recordAttribution` |
| 인증 | `src/lib/supabase/auth-server.ts` `getCurrentUser()` (ANON) · `middleware.ts`(전 라우트 세션 게이팅) | 세션은 ANON+쿠키, 데이터는 `getDb()` service-role(RLS 우회) |
| 검증 스키마 | `src/features/ontology/lib/schemas.ts` (zod4) | enum/입력 스키마 동일 위치·컨벤션 |
| AI 초안+컨펌 | `src/app/api/critic/review/route.ts`, `api/llm/assist`, ConfirmCard/ActionCard 패턴 | 자연어→구조화(zod) 초안 → HITL 카드 |
| 상태관리 | `useOntologyStore`(zustand+zundo) | ontologyId 스코프 편입, 전환 시 리셋+재로드 |

## Files to Change (핵심)
| File | Action | Why |
|---|---|---|
| `supabase/migrations/2026071xxxxxx_pf_a_m1_containers.sql` | CREATE | workspaces/ontologies/memberships + 부트스트랩 시드 |
| `supabase/migrations/..._pf_a_m2_scope_backfill.sql` | CREATE | 17테이블 ontology_id 가산+백필 |
| `supabase/migrations/..._pf_a_m4_enforce_unique.sql` | CREATE | NOT NULL + 전역 UNIQUE 재정렬 + 인덱스 |
| `supabase/migrations/..._pf_a_m5_rls.sql` | CREATE | 멤버십 스코프 RLS + `user_has_ontology_access()` 함수 |
| `supabase/migrations/..._pf_b_m1_functions.sql` | CREATE | functions/decision_results |
| `src/lib/drizzle/schema.ts` | UPDATE | 신규 테이블 정의 + ontologyId 컬럼 + 유니크 재정렬 + relations |
| `src/lib/authz/requireOntologyAccess.ts` | CREATE | 앱계층 1차 방어 가드 |
| `src/lib/authz/ontologyContext.ts` | CREATE | 요청에서 ontologyId 추출(헤더 `x-ontology-id`) |
| `src/app/api/**/route.ts` (~57) | UPDATE | ontologyId 스코프 주입 + 가드 |
| `src/app/api/workspaces/route.ts`, `api/ontologies/route.ts` | CREATE | 컨테이너 CRUD |
| `src/lib/remote/*` 또는 fetch 래퍼 | UPDATE | 클라이언트가 active ontologyId 헤더 전송 |
| `src/features/ontology/hooks/useOntologyStore.ts` | UPDATE | activeOntologyId 상태 + 전환 |
| `src/features/workspace/components/OntologySwitcher.tsx` | CREATE | shadcn Command/Popover 온톨로지 전환 |
| `src/app/launcher/page.tsx` (또는 `/`) | CREATE/UPDATE | 두 버전 진입 런처 |
| `src/lib/functions/ast.ts`, `evaluator.ts` | CREATE | 화이트리스트 AST 평가기(순수·결정론) |
| `src/app/api/functions/[id]/evaluate/route.ts` | CREATE | 인스턴스 판정 실행 → decision_results |
| `src/app/api/llm/function-draft/route.ts` | CREATE | 자연어→AST 초안(zod 구조화) |
| B UI: 함수 편집/미리보기 카드, 함수 노드/뱃지(Cytoscape) | CREATE | 시각언어 직교 확장 |

## Tasks

### PHASE 0 — PRD-PF-A (기초공사)

**A-M1 — 컨테이너 신설(파괴 없음)**
- Action: `workspaces`/`ontologies`/`memberships` 마이그레이션 + Drizzle 정의. 기본 워크스페이스/온톨로지 고정 UUID 시드(`00000000-0000-0000-0000-0000000000W1`/`...O1`), 기존 auth.users 전원 owner 등록(SQL `INSERT ... SELECT id FROM auth.users`, PII 미노출). `partitions`→기본 온톨로지 귀속 준비.
- Validate: 라이브 `list_tables`에 3테이블·시드 1행 확인, 기존 테이블 무변경(회귀 0).

**A-M2 — 스코프 소급(가산+백필)**
- Action: 17테이블에 `ontology_id uuid` 가산(NULL 허용) → 기본 온톨로지로 백필(부모조인 상속: instance_values←instances 등). 폴리모픽(attributions/validation_results)은 target_table CASE 조인 백필. 특수(patterns/term_glossary/relation_glossary)는 §열린결정 — `workspace_id`(nullable)+`is_public`만.
- Validate: `SELECT count(*) WHERE ontology_id IS NULL = 0` 게이트(각 테이블), 백필 전후 행수 일치.

**A-M3 — 앱계층 가드 + 라우트 스코프**
- Action: `requireOntologyAccess(userId, ontologyId, minRole)` + ontologyId 추출 헬퍼 + 라우트 래퍼. ~57 라우트에 스코프 쿼리(`where ontology_id = :id`). 클라이언트 fetch에 `x-ontology-id`(active ontology) 주입. useOntologyStore에 activeOntologyId.
- Validate: 타 워크스페이스 온톨로지 접근 음성 테스트 403, 가드 누락 0(커버리지).

**A-M4 — 제약 강화 + 유니크 재정렬(가장 위험)**
- Action: 백필·코드배포 후 `ontology_id NOT NULL`. 전역 UNIQUE 재정렬: `partitions.uq_partition_name`→`(ontology_id,name)`, `branches.uq_branch_name`→`(ontology_id,name)`, `relation_types.name unique`→`(ontology_id,name)`. `commits.branch_id` 이미 존재. 인덱스 추가. `classes.ontology_id`↔`partition_id→partitions.ontology_id` 드리프트 방지 트리거.
- Validate: 서로 다른 온톨로지 동일 브랜치명 'main' 허용, 드리프트 INSERT 거부.

**A-M5 — RLS + 온톨로지 스위처 UI + 런처**
- Action: `user_has_ontology_access(ontology_id, min_role)` SQL 함수 + 24테이블 멤버십 스코프 RLS(deny-all 교체). OntologySwitcher(shadcn Command/Popover). 두 버전 런처(`/` 스튜디오 단독 유지, `/platform` 자리 예약). 온톨로지 1개면 자동 진입(선택 화면 미노출).
- Validate: 멤버 아닌 직접 쿼리 차단(2차 방어), 스튜디오 회귀 0, lint·build 그린.

### PHASE 1 — PRD-PF-B (결정함수, Tier 1)

**B-M0 — 용어·경계 확정** — kinetic 라벨→"Function(결정함수)" UI/문서 카피 일원화, `relation_types.layer` 재의미화(서술용), dynamic 미도입 확인.

**B-M1 — 데이터모델** — `functions`(ontology_id, target_class, inputs, logic jsonb AST, output_spec, nl_source, impl_type='ast', status, version) + `decision_results`(function_id, instance_id, verdict, input_snapshot, input_hash, evaluated_at). Drizzle + 마이그레이션 + RLS.

**B-M2 — 실행엔진 MVP** — `src/lib/functions/ast.ts`(화이트리스트 연산자: 비교/논리/산술/임계, `eval`/`Function` 금지) + `evaluator.ts`(instance_values 조회→alias 바인딩→AST 평가→verdict 정규화). 순수(엔진은 판정만 반환, write는 적재기). 결정론(input_snapshot 해시=input_hash 재현검증). 감사(decision_results 적재).

**B-M3 — 자연어→AST + 컨펌** — `api/llm/function-draft`(zod 구조화 `{inputs, logic, output_spec}` 초안) → ConfirmCard(사람이 읽을 조건식 + 예시 판정 미리보기) → Critic 훅(없는 속성 참조·단위 불일치) → 승인 시 `status='confirmed'`. 완전자동 금지.

**B-M4 — 시각화 + 감사 UI** — 함수 노드/뱃지(대상 클래스=원에 직교 부착, 입력속성→함수→판정 흐름). 인스턴스(점)에 최근 판정 색/뱃지 오버레이(SoT=decision_results). 판정 근거(input_snapshot) 조회 카드.

**B-M5 — 경계 확인** — 상태 라이프사이클·이벤트 자동화=PF-I 위임 티켓, Tier 2 샌드박스=후속 명시.

## Migration 롤아웃 순서 (무중단)
M1(컨테이너+시드) → M2(가산+백필) → M3(코드배포: 가드·스코프쿼리·스위처, 기본 온톨로지로 동작) → M4(NOT NULL+유니크재정렬+인덱스) → M5(RLS) → B-M1~M5. 각 단계 롤백 스크립트 동반, NULL 0건 게이트 후에만 NOT NULL.

## Validation
```bash
# 앱 루트: c:\Users\224070\Desktop\GFP\ontology\ontology\ontology
npm run lint
npm run build
npx vitest run            # 기존 스위트 회귀 0 + 신규 계약/단위 테스트
```
- 라이브 검증: supabase MCP `execute_sql`(NULL 0 게이트·격리 음성 테스트·유니크 재정렬), `get_advisors security`.

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| 17테이블 소급 무결성(고아행) | Med | 부모조인 백필 + NULL 0 게이트(NOT NULL 전 필수) + 롤백 스크립트 |
| ~57 라우트 가드 누락→크로스 유출 | Med | 공통 래퍼 강제 + 커버리지/음성 테스트 |
| RLS 착각(서비스롤 우회) | High(개념) | 앱계층 1차 방어 못박기, RLS는 2차 심층방어로 명시 |
| 유니크 재정렬 충돌(기존 중복) | Low | 재정렬 전 중복 스캔(relation_types.name 등) |
| 스튜디오 회귀 | Med | 온톨로지 1개 경로 회귀 테스트, 라우트/스코프만 주입·로직 불변 |
| AST 결정론 미보장 | Low | 화이트리스트만·자유코드 금지·input_hash 재현 |
| 함수 자연어 오역 | Med | HITL 필수·Critic 훅·예시 미리보기·승인 전 저장 금지 |

## Acceptance (PRD 수용기준 매핑)
- [ ] A: 3컨테이너 생성·기존 사용자 owner 시드 / 17테이블 ontology_id NOT NULL·백필 전후 행수 일치 / 드리프트 트리거 / 유니크 (ontology_id,name) 재정렬 / 24테이블 멤버십 RLS / 모든 라우트 requireOntologyAccess·타 워크스페이스 403 / 스튜디오 회귀 0 / 온톨로지 1개 자동진입.
- [ ] B: Semantic/Kinetic 2레이어 용어 일원화 / functions+decision_results / AST 판정 MVP / 결정론 장치(화이트리스트·input_hash) / decision_results 감사적재 / 자연어→초안→컨펌 승격 / 무결성 vs 결정 구분 / layer 재의미화 / dynamic 미도입 / 함수 시각화·시각언어 불변.
- [ ] 공통: shadcn·한국어·배지 taxonomy, lint·build·기존 테스트 회귀 0.
- [ ] 두 버전: `/` 스튜디오 단독 동작, `/platform` 자리 예약(후속 PF-C).
- [ ] 칸반: `PRD-PF-Modify` 진행전→진행중, STATUS.md 갱신.
