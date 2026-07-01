# 시스템 감사 & 개선 추적 (System Audit & Remediation)

> 작성: 2026-06-30 · `/ecc:agent-architecture-audit` 전수 감사 결과.
> **제약(사용자 지시):** 비즈니스 로직·핵심 기능은 유지. 기능적 신뢰성만 개선한다.
> 이 문서는 **살아있는 추적 문서**다. compact/clear 후에도 이 파일만 읽으면 작업을 이어갈 수 있도록 자족적으로 작성됨.

---

## 🔄 이어서 작업하는 법 (RESUME PROTOCOL)

세션이 끊기거나 컨텍스트가 비워진 뒤 재개할 때:

1. **이 파일을 먼저 읽는다.** 아래 "진행 현황 스냅샷"과 결함 테이블의 체크박스가 단일 진실원(source of truth).
2. 앱 소스 루트는 **`ontology/ontology/ontology/src`** (3중 중첩 주의). 백엔드 라우트는 `src/app/api/**`, 클라 상태는 `src/features/ontology/store/**` + `hooks/**`.
3. 각 결함의 **증거(file:line)** 는 작성 시점 기준. 수정 착수 전 해당 줄을 다시 열어 여전히 유효한지 확인(코드가 이동했을 수 있음).
4. 수정 워크플로: **회귀 테스트 먼저(RED) → 최소 구현(GREEN) → 리뷰**. 테스트는 `src/__tests__/**`, vitest.
5. 한 항목 완료 시: ① 체크박스 `[x]`로 ② "진행 현황 스냅샷"의 날짜/메모 갱신 ③ 커밋.
6. **전 항목 완료·검증 시** 이 문서를 `docs/완료/`로 이동하고 `docs/STATUS.md` 갱신(칸반 규칙).

### 진행 현황 스냅샷
| 항목 | 상태 | 최종 갱신 | 메모 |
|------|------|-----------|------|
| 전체 | ✅ 완료 | 2026-07-01 | C1~C3·H1~H6·M1·M2·M4·M5·M6·M7·M8 전부 처리·테스트·**프로덕션 빌드 통과(48 페이지, exit 0)**. M6=신뢰 표시 삭제(방향 전환). M3(청킹)은 PRD-F Phase 2로 이관, M9(Redis)는 불필요 → 둘 다 사용자 결정으로 **제외**. 감사 항목 전부 클로즈. 선택 후속: H2 라우트 통합테스트 |
| C2 | ✅ 완료 | 2026-06-30 | instance-values GET 라우트+useInstanceValues 훅+useLoadOntology 배선. 회귀 테스트 green |
| C3 | ✅ 완료 | 2026-06-30 | useAutoSave 실패 시 status='error'+토스트+지수백오프 재시도, pendingChanges 유지. beforeunload keepalive 폴백. CommitBar 인디케이터 연동. 테스트 2 green |
| H3 | ✅ 완료 | 2026-07-01 | (수정 보완) partialize는 pendingChanges 유지(undo가 데이터+큐를 일관되게 되돌림). 대신 clearChangesWithoutHistory()로 autosave/수동커밋/푸시의 *프로그램적* 큐 비우기만 temporal.pause로 히스토리에서 제외 → undo가 커밋된 변경 재전송하던 버그 제거. 회귀 2 + single-source-of-truth green |
| C1 | ✅ 완료 | 2026-06-30 | 미들웨어 단일 체크포인트로 /api/* 인증 게이트(미인증→401 JSON, 302 아님). matcher에 /api 포함. 단일 공유(스키마 변경 없음). 테스트 3 green |
| H1 | ✅ 완료 | 2026-06-30 | 파싱 누락 구조화 경고: mapParseResult가 placeholder_endpoint 경고 반환, parse 라우트가 관계 추출 실패/빈결과 경고, assist 라우트가 드롭 액션 경고. NewNodePopover 경고 배너 + AIAssistantTab 토스트. 테스트 green |
| H4 | ✅ 완료 | 2026-06-30 | lib/neo4j/read-only.ts findWriteClauseViolation로 쓰기 절 차단(1차)+executeRead 트랜잭션(2차). text2cypher executeCypherQuery 적용. 테스트 8 green. (라우트는 핸들러 외 export 금지라 가드 별도 모듈로 분리) |
| H2 | ✅ 완료 | 2026-06-30 | push/rollback의 Supabase 플래그 갱신을 재시도(3회 백오프)+실패 시 "부분 성공" 경고로 보고(재push 유도하는 거짓 실패 제거). PushResponse.warning + NeoConfirmSheet 토스트. 타입 검증. (라우트 통합 테스트 부재 — 수동 검증 권장) |
| H5 | ✅ 완료 | 2026-06-30 | lib/entity-match/score.ts combinedMatchScore(vec 0.6+trgm 0.4)+공통 임계값. dedup 정렬을 Math.max→결합점수로 통일. 테스트 3 green. (이름기반 ER 경로는 다른 메커니즘이라 동작 보존 위해 통합 보류 — 문서화) |
| H6 | ✅ 완료 | 2026-06-30 | lib/pagination.ts parsePagination(opt-in limit/offset, 상한 1000). classes/instances/edges GET 적용. **기본은 전체 로드 유지**(그래프 전체 렌더 — 기본 절단=데이터 손실이라 금지). validate/reconcile 전체 스캔은 정합성에 필수라 보존(아키텍처 변경 필요 — 보류). 테스트 4 green |
| M1·M2 | ✅ 완료 | 2026-06-30 | lib/llm/models.ts: LLM_MODELS(env LLM_MODEL_PRIMARY/MINI, 기본 gpt-5.4/-mini)+LLM_MAX_RETRIES(env, 기본 3·상한 5, AI SDK 지수백오프). 9개 LLM 라우트 model/maxRetries 치환. 임베딩 모델은 정책 상수라 보존. 전체 테스트 358 green |
| M6 | ✅ 완료(방향 전환) | 2026-07-01 | 사용자 결정: AI confidence 는 매 추출마다 기준이 달라 **재현 불가능한 신호**라 랭킹/필터를 붙이지 않고 **UI 노출을 삭제**. RightPanel(class·edge "확신도 N%" 배지)·NewNodePopover(관계 행 배지)·EnrichmentCard·GovernanceProposalCard 의 확신도 % 표시 제거. **데이터 계약은 보존**(LLM 스키마·DB 컬럼·Neo4j 속성·plumbing 그대로 — PRD-F P4 토대). sourceType·evidence·"검증 필요"는 유지. 타입 클린, 관련 테스트 무영향 |
| M3 | ⛔ 제외 | 2026-07-01 | 사용자 결정: 청킹은 사실상 PRD-F Phase 2(P1 안정 식별자 선행 필요). PRD-F 미착수 상태라 본 감사에서 제외하고 PRD-F 정식 트랙으로 이관. 현재 8k 초과는 명시적 413 안내라 데이터 손실 없음 |
| M9 | ⛔ 제외 | 2026-07-01 | 사용자 결정: 분산 레이트리밋(Redis)은 현재 불필요. 제외 |

> 진행 순서(완료): C2→C3→H3→C1→H1→H4→H2→H5→H6→M1·M2, 이어 M4·M5·M7·M8, M6(방향 전환=삭제).
> **미해결 질문 결정됨:** 테넌시 = 단일 공유 온톨로지(C1은 인증 게이트만, 스키마 변경 없음). 착수 방식 = 항목별 회귀 테스트 우선.
> **M3·M9 제외 확정, M6 완료.** M3(청킹)은 PRD-F Phase 2로 이관(PRD-F 미착수). M9(Redis)는 현재 불필요.
> **신규 env(선택):** `LLM_MODEL_PRIMARY`, `LLM_MODEL_MINI`, `LLM_MAX_RETRIES` (미설정 시 기존 기본값과 동일).

---

## 핵심 진단

이 시스템의 지배적 실패 패턴은 **조용한 데이터 손실(silent data loss)** 이다.
LLM 파이프라인 · 자동저장 · DB 푸시 세 군데 모두 실패를 사용자에게 알리지 않고
빈 값 / 부분 결과 / 성공처럼 보이는 응답으로 흘려보낸다.
도메인 전문가가 "검토·승인"하는 제품인데, 정작 **무엇이 누락됐는지**를 볼 수 없다.

검증 범례: ✅ 코드 직접 확인됨 · 🟡 단일 에이전트 보고(미재검증, 착수 전 확인 필요)

---

## CRITICAL — 다음 릴리스 전

### ☑ C1. `/api/*` 인증 미게이트 + Drizzle가 RLS 우회 ✅ [완료 2026-06-30 — 인증 게이트만, 단일 공유]
- **증거:**
  - `src/middleware.ts:17` — matcher에서 `api` 명시적 제외.
  - `src/middleware.ts:14` 주석 — "API 라우트는 service-role 로 동작하며 사용자별 authz/RLS 는 별도 스코프".
  - `src/lib/drizzle/index.ts:6,12` — `DATABASE_URL` 직접 Postgres 연결 → RLS 우회(특권 롤).
  - `src/app/api/classes/route.ts` 전체 — `getCurrentUser()`·소유권 검사 없음.
  - RLS 마이그레이션 `supabase/migrations/20260626000001_v6_enable_rls_lockdown.sql` 은 존재하나 Supabase anon 경로에만 적용됨.
- **메커니즘:** v6 RLS는 "켜져 있지만 우회됨". 인증 없는 요청자가 `POST /api/classes`, `POST /api/batch`(대량 delete), `GET /api/export`로 전체 온톨로지 read/write/delete 가능.
- **맥락(미해결 질문):** 스키마에 owner/user_id 컬럼 없음 → 단일 온톨로지 MVP로 추정. 공개 배포 시 critical, 내부 단일테넌트면 알려진 부채.
- **수정 방향:** 라우트 공통 헬퍼로 `getCurrentUser()` 코드-게이트(미들웨어가 /api 건너뛰므로 라우트에서 강제). 멀티테넌트 목표면 owner 컬럼 + RLS 정합 단계로 확장. **→ 사용자에게 단일/멀티테넌트 의도 확인 필요.**

### ☑ C2. 인스턴스 속성값이 새로고침마다 사라짐 ✅ [완료 2026-06-30]
- **증거:** `src/features/ontology/hooks/useLoadOntology.ts:88` — 로드 시 `instanceValues: []` 하드코딩. 서버 읽기 경로 없음(`/api/instance-values` 라우트는 존재).
- **메커니즘:** 사용자가 입력한 인스턴스 속성값(예: Person `age=25`)이 저장돼도 리로드 후 화면에서 전부 빈 값.
- **수정 방향:** `useLoadOntology`에 instance-values 쿼리 연결(다른 엔티티처럼 react-query 훅 추가 → `loadOntology`에 전달). 가장 작은 diff로 핵심 데이터 손실 차단.

### ☑ C3. 자동저장 실패가 사용자에게 안 알려짐 ✅ [완료 2026-06-30]
- **증거:**
  - `src/features/ontology/hooks/useAutoSave.ts:81-83` — API 에러를 `console`에만, 토스트·재시도·표시 없음.
  - `useAutoSave.ts:133-136` — `beforeunload`에서 `sendBeacon` fire-and-forget → 느린 네트워크에서 마지막 편집 유실.
- **메커니즘:** 저장 인디케이터는 "저장됨"인데 실제 실패 → 사용자는 백업됐다고 믿음.
- **수정 방향:** 실패 시 토스트 + 재시도 큐 + 인디케이터 "저장 실패" 상태. 낙관적 업데이트는 유지, 롤백/알림만 추가.

---

## HIGH — 이번 사이클

### ☑ H1. LLM 파싱 파이프라인 전반의 조용한 누락 ✅ [완료 2026-06-30]
한 묶음(동일 패턴: 사용자에게 안 알리고 드롭):
- `src/app/api/llm/parse/route.ts:92` — Stage2 실패 시 `relations = stage2.output?.relations ?? []` → 관계 0개를 "성공"으로 반환.
- `src/features/ontology/lib/parse-mapping.ts:163-170` — 관계 끝점이 미추출 엔티티(LLM 환각)면 placeholder leaf 노드 말없이 생성 → 고립 노드.
- `src/features/ontology/lib/parse-mapping.ts:70` — 기존 클래스명과 겹치면 추출 결과 조용히 드롭.
- `src/app/api/llm/assist/route.ts:158-160` — 스키마 검증 실패 액션을 로그 없이 필터아웃.
- **수정 방향:** 드롭/placeholder/빈 관계를 에러가 아닌 **구조화된 경고**로 검토 UI에 노출. 비즈니스 로직 그대로, "무엇이 빠졌는지"만 표시.

### ☑ H2. Supabase↔Neo4j 스플릿 트랜잭션(push/rollback 비원자성) 🟡 [완료 2026-06-30]
- **증거:**
  - `src/app/api/neo4j/push/route.ts:318-354` — Neo4j 커밋 후 Supabase 플래그 업데이트가 트랜잭션 밖. 후자 실패 시 양 DB 불일치.
  - `src/app/api/neo4j/rollback/route.ts:110-122` — 동일 패턴.
- **메커니즘:** Neo4j는 push됐는데 `pushedToNeo4j=false` 잔존 → 다음 reconcile에서 거짓 충돌/중복 push.
- **수정 방향:** Supabase 업데이트 실패 시 보상 트랜잭션 / 재시도 / 상태 표시. "Ontology Git" 정합성 보증 복구.

### ☑ H3. Undo 히스토리가 동기화 큐 오염 ✅ [완료 2026-06-30]
- **증거:** `src/features/ontology/store/index.ts:30` — zundo `partialize`에 `pendingChanges` 포함.
- **메커니즘:** undo/redo가 전송 대기 큐를 과거 상태로 되돌림 → 자동저장이 이미 동기화된 op 재전송하거나 대기 op 분실.
- **수정 방향:** `partialize`에서 `pendingChanges` 제거(영속 데이터와 전이 상태 분리). 거의 한 줄.

### ☑ H4. text2cypher — 코드 레벨 read-only 강제 없음 ✅ [완료 2026-06-30]
- **증거:** `src/app/api/llm/text2cypher/route.ts:113-160` — "READ만"은 프롬프트 텍스트로만. `executeQuery` 플래그는 실행 여부만 게이트(`137`,`152`), 쿼리 종류 미검증. `correctCypher` 자동 보정 루프(`143-157`).
- **메커니즘:** 환각/주입된 `MERGE`/`DELETE`가 그대로 `executeCypherQuery` 실행 가능.
- **수정 방향:** 실행 전 쓰기 키워드 차단(파서/정규식) + Neo4j read 트랜잭션 강제.

### ☑ H5. 중복·불일치 엔티티 매칭 ✅ [완료 2026-06-30 — dedup 결합점수 통일, ER 통합 보류]
- **증거:**
  - `src/app/api/dedup/candidates/route.ts:77-82` — pgvector+trigram, `Math.max(vectorScore, trigramScore)` 정규화 없이 결합.
  - `src/app/api/entity-resolution/candidates/route.ts:29-30` — 이름 기반 `findSimilarPairs`만.
  - `src/app/api/llm/resolve/route.ts:33-40` — 후보 0개 시 `confidence: 0.9` 하드코딩(증거 없는데 고신뢰).
- **메커니즘:** 같은 데이터에 엔드포인트마다 모순된 중복 제안 → 병합 일관성 붕괴.
- **수정 방향:** 단일 점수 함수(정규화 vector+trigram)로 통합, 공통 임계값 공유.

### ☑ H6. 페이지네이션 없는 무제한 쿼리 🟡 [완료 2026-06-30 — opt-in 페이지네이션, 기본 전체로드 보존]
- **증거:** `src/app/api/validate/route.ts`(전체 로드), `src/lib/neo4j/reconcile.ts:178`(`MATCH (n:Instance) RETURN ...` LIMIT 없음), CRUD GET(`classes`/`instances`/`edges`) `take`/`LIMIT` 없음.
- **메커니즘:** 대형 온톨로지에서 메모리 폭발·응답 거대화. CSV 대량 인제스트 목표와 충돌.
- **수정 방향:** LIMIT/커서 페이지네이션. validate/reconcile은 배치 처리.

---

## MEDIUM — 다음 주기

| # | 결함 | 증거 | 영향 | 상태 |
|---|------|------|------|------|
| M1 | 모델 ID 하드코딩(`gpt-5.4`), env·폴백 없음 | 거의 모든 LLM 라우트 (`parse/route.ts:61,84` 등) | 모델 교체/장애 시 코드 배포 | ☑ 완료 (lib/llm/models.ts) |
| M2 | `maxRetries: 1` 무복원력 | `parse/route.ts:64,87` | 네트워크 블립 즉시 실패 | ☑ 완료 (LLM_MAX_RETRIES 기본 3) |
| M3 | 입력 글자수 하드컷(8k/15k)+청킹 없음 | `parse/route.ts:22-57` | 큰 문서 조용히 거부/잘림 | ⏸ 보류 — 이미 명시적 413(조용한 절단 아님). 청킹은 P2 기능이라 "기능 유지" 제약과 충돌 |
| M4 | Critic 2차 LLM 패스 에러 무시 | `critic/review/route.ts:74-77` | 품질검토 부분실패가 "완전" 위장 | ☑ 완료 — 응답에 llmReviewFailed 노출(현재 API 소비자 없음, 서버측 가시화) |
| M5 | enrich/detect LLM 실패 시 `catch{[]}` | `enrich/detect/route.ts:32-37` | 갭 탐지 부분실패가 완전으로 보임 | ☑ 완료 — llmDetectionFailed 플래그+NewNodePopover 토스트 |
| M6 | confidence 점수 운반만, 필터/랭킹 미사용 | `parse-mapping.ts:152-159` | 0.1 관계와 0.95 관계 동일 취급 | ⏸ 보류 — 랭킹/필터링은 추출 동작 변경(비즈니스 로직)이라 제약과 충돌 |
| M7 | RDF(JSON-LD/Turtle) 임포트가 zod 우회 | `import/route.ts:244-280` | 잘못된 ID/타입 그대로 삽입 | ☑ 완료 — RDF 경로도 JSON과 동일 ontology 스키마 검증(실패 시 400) |
| M8 | 온톨로지 전환 시 필터/UI 상태 잔존 | `store/entity-slice.ts:843` | 이전 필터 남아 혼란 | ☑ 완료 — loadOntology가 필터/포커스/하이라이트 기본값 초기화 |
| M9 | in-memory 레이트리밋(단일 인스턴스) | `autocomplete/route.ts:6-18` | 수평확장/재시작 시 우회 | ⏸ 보류 — 외부 스토어(Redis 등) 필요 인프라 변경이라 범위 밖 |

---

## 권장 수정 순서 (코드 우선)

1. **C2** 인스턴스값 로드 복구 — 최소 diff, 핵심 데이터 손실 차단.
2. **C3** 자동저장 실패 가시화 — 토스트+재시도+인디케이터.
3. **H3** `pendingChanges` partialize 제거 — 한 줄.
4. **C1** API 인증 코드-게이트 — (선행: 단일/멀티테넌트 의도 확인).
5. **H1** LLM 파이프라인 "누락 리포트" — 구조화 경고 노출.
6. **H4** Cypher read-only 코드 강제.
7. **H2** 푸시/롤백 정합성 보상.
8. **H5** 엔티티 매칭 일원화.
9. **H6** 페이지네이션.
10. **M1·M2** 모델 ID env화 + 지수 백오프(상한 포함).

이후 M3~M9 순차.

---

## 12-레이어 매핑 (감사 프레임)

- **L7-8 도구 실행/해석:** parse·assist가 부분 실패를 빈 배열/드롭으로 흡수 (H1).
- **L9 응답 셰이핑:** parse-mapping이 환각 끝점→placeholder, 중복명→드롭 (H1).
- **L11 숨은 보정 루프:** text2cypher correctCypher, Critic 2차 LLM (H4, M4).
- **L12 영속/상태:** instanceValues 미로드(C2), pendingChanges 혼입(H3), 자동저장 무통보(C3), 스플릿 트랜잭션(H2).
- **횡단 인증:** RLS 잠갔으나 Drizzle 특권 연결 우회 + /api 미게이트 (C1).

---

## 미해결 질문 (착수 전 사용자 확인)

1. **테넌시:** 단일 공유 온톨로지(MVP) vs 멀티유저? → C1 수정 범위 결정.
2. **착수 방식:** 항목별 TDD(회귀 테스트 먼저) vs 빠른 패치? (기본값: TDD)
3. **우선순위 조정:** 위 순서대로 진행 OK? C1(인증)을 더 앞당길지?

---

## 변경 이력
- 2026-06-30 — 감사 수행 및 문서 최초 작성(수정 미착수).
