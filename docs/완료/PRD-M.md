# PRD-M: Docker Neo4j 복귀 + 발행 파이프라인 고속화

> 작성 2026-07-08. 상태: **완료 (당일 구현·라이브 검증)** — 하단 §7 구현 결과 참조.
> 트리거: "전체 초기화 → 발행" 시 변경로그 100+건이 개별 Cypher로 재생되며 수십 초 소요, 같은 날 Neo4j Desktop 인스턴스 다운 발생.

## 1. 배경 / 문제

1. **발행이 느리다.** 발행(push)은 커밋 변경로그(commit_details)를 문장 단위 Cypher로 번역해 `tx.run`을 순차 `await`한다(`src/app/api/neo4j/push/route.ts`). 문장 N개 = 네트워크 왕복 N회(직렬). "생성 몇 건 → 전체 초기화 → 발행" 시나리오에서는 생성 문장을 실행한 직후 삭제 문장으로 지우는 낭비 재생까지 겹쳐 100문장 이상이 나갔다.
2. **Neo4j Desktop이 불안정하다.** 2026-07-08 발행 중 Desktop 2 인스턴스(dbms-8b9146da, enterprise 2026.05.0) 다운. Desktop은 서비스가 아니라 수동 시작이 필요하고(Electron UI 의존), 상시 운용에 부적합하다고 판단 → **Docker 로 복귀하고 Desktop 은 폐기한다.** (2026-06-23~ Docker `neo4j-onto` 5.26 운용 이력 있음. Aura 는 pause 백업 유지.)

## 2. 결정 기록 (검토 이력)

| 검토안 | 결론 | 근거 |
|---|---|---|
| 임베딩을 Neo4j 발행에서 제거하고 pgvector 단일화 (v1~v2) | **기각** | 발행 무거움은 UNWIND 배칭으로 해결 가능. 임베딩을 그래프에 두면 벡터검색+탐색을 단일 Cypher 로 처리(Neo4j 공식 GraphRAG 패턴) — Athena 에서 리트리버+탐색 한 방. |
| "한 건 추가 시 전체 재임베딩 필요" 우려 | **오해로 확인** | 신경망 임베딩은 건별 독립 계산(코사인은 질의 시점 계산). 실제 워커도 `embedding IS NULL` 건만 증분 처리(`api/embeddings/process`). |
| 진입점 검색에 클러스터링 필요? | **불필요** | top-k 진입점은 벡터 인덱스(HNSW)가 담당. 클러스터링(Leiden 커뮤니티 탐지)은 "전역 요약 질문"용 별도 확장 — 필요 시 GDS 로 후속. |
| `/api/neo4j/reset` 전용 라우트 | **기각(YAGNI)** | 생애주기 압축이 들어가면 "초기화 후 발행"이 자연히 문장 몇 개로 수렴. |
| 롤백 경로 배칭 | **범위 제외** | 빈도 낮음, 위험 대비 이득 적음. |

**아키텍처 확정**: 임베딩은 Supabase(pgvector, 편집 시점 dedup)와 Neo4j(발행본, RAG 진입점+단일 Cypher 하이브리드) **양쪽 유지**. 계산은 Supabase 에서 1회, 발행이 같은 벡터를 운반(재계산 금지, 기존 계약 유지).

## 3. 목표 / 비목표

**목표**
- G1. Neo4j 를 Docker 상시 컨테이너로 운용 (Desktop 폐기). MCP(도커 `neo4j-mcp`)가 이 인스턴스에 연결됨을 보장.
- G2. 발행 시간: "전체 초기화 후 발행" 및 일반 발행 모두 **왕복 횟수 O(문장 수) → O(구문 형태 수)** 로. 체감 수십 초 → 1~2초.
- G3. 임베딩 드리프트 구멍 봉합(§5 M3).

**비목표**
- 롤백 경로 배칭, reset 전용 API, GDS 커뮤니티 탐지, Qdrant 등 전문 벡터DB 도입, Aura 복귀.

## 4. 마일스톤

### M0. Docker Neo4j 복귀 (선행 필수)

1. 기존 잔재 확인: `docker ps -a` / `docker volume ls` 에서 과거 `neo4j-onto` 컨테이너·볼륨 존재 여부 확인 후 정리 또는 재사용.
2. 컨테이너 기동(볼륨 영속화, 자동 재시작):
   ```powershell
   docker run -d --name neo4j-onto --restart unless-stopped `
     -p 127.0.0.1:7474:7474 -p 127.0.0.1:7687:7687 `
     -v neo4j-onto-data:/data `
     -e NEO4J_AUTH=neo4j/neo4jlocal123 `
     neo4j:5.26
   ```
   - 버전: 5.26 (벡터 인덱스 5.13+ 요건 충족, 과거 Docker 운용 검증 이력).
   - 포트(7687)·자격증명(neo4j/neo4jlocal123)을 Desktop 시절과 동일하게 유지 → `.env.local`(`NEO4J_URI=neo4j://127.0.0.1:7687`) **무변경**.
3. 스키마 부트스트랩: `POST /api/neo4j/init` (제약·인덱스·`concept_embedding` 벡터 인덱스, idempotent).
4. **MCP 재연결 검증(필수)**: `neo4j-mcp` 컨테이너는 `neo4j://host.docker.internal:7687` + 동일 자격증명으로 이미 구성돼 있음 → 포트·비밀번호 동일 유지 시 설정 무수정으로 붙어야 함. `mcp__neo4j__get_neo4j_schema` 호출로 실연결 확인. 불일치 시 `neo4j-mcp` 컨테이너 재생성(메모리의 실행식 참조).
5. Desktop 폐기: 인스턴스 중지, 이후 미사용 선언. 데이터 이관 불필요 — Supabase 스테이징이 진실원이므로 재발행으로 채움(사용자는 어차피 온톨로지 재구축 예정).
6. 문서/메모리 갱신: `neo4j-connection` 메모리를 Docker 기준으로 갱신.

**수용 기준**: 컨테이너 재부팅 후 자동 기동, 앱 발행 성공, MCP 스키마 조회 성공, Desktop 프로세스 없이 전체 흐름 동작.

### M1. 생애주기 압축 (cypher-builder 전처리)

발행 대상 details 를 targetId 별로 압축한 뒤 Cypher 를 생성한다:
- `ADD → (MOD…) → DEL` : **전부 소거** (해당 배치 내에서 태어나고 죽은 엔티티).
- `MOD → MOD → …` : **마지막 스냅샷 1건으로 병합** (last-write-wins). 예: "VV 수정 3회" → 1문장.
- `ADD → MOD…` : ADD 에 마지막 스냅샷 반영해 1건.
- 기존에 발행된 엔티티의 DEL 은 유지(정상 삭제).
- 소거된 노드를 참조하는 edge 는 그 edge 도 ADD+DEL 쌍으로 존재해 자연 소거됨. 잔존 edge ADD 의 endpoint 미존재 시 `MATCH` 실패로 no-op(현행 동작과 동일, 안전).

**수용 기준**: "생성 k건 → 전체 초기화 → 발행" 시 생성/삭제 상쇄 후 잔여 문장만 생성. 단위 테스트: ADD→MOD→DEL 소거, MOD 3연속 병합, ADD→MOD 병합, 기발행 DEL 보존.

### M2. UNWIND 배칭

같은 형태의 구문을 `UNWIND $rows AS row` 단일 문장으로 병합:
- 그룹: 클래스 upsert / 인스턴스 upsert / IS_A / INSTANCE_OF / 인스턴스 값 SET / 각 삭제류 / relation_type upsert. 관계명이 동적인 edge upsert 는 관계 타입별 그룹.
- 기존 정렬(ADD→MOD→DEL, classes→…→edges)을 그룹 경계로 유지 → 의존 순서 보존. M1 압축 선행으로 배치 내 동일 targetId 는 1건 → 순서 충돌 원천 제거.
- 배치 상한 1,000행(플랜 캐시를 위해 쿼리 형태 고정, 파라미터만 변경 — Neo4j 공식 배칭 가이드).
- `_SyncState` 기록도 UNWIND 1문장으로.

**수용 기준**: 문장 수가 O(변경 건수) → O(구문 형태 수). 통합(roundtrip) 테스트 그린. dryRun 프리뷰로 배칭 확인.

### M3. 임베딩 드리프트 보정

현행 구멍: 임베딩 워커는 커밋 후 비동기 실행 → 워커 완료 **전에** 발행하면 Neo4j 노드에 임베딩이 실리지 않고, 해당 엔티티를 다시 수정하기 전까지 영영 미반영.
- 발행 시 "이번 발행 대상 + Neo4j 에 임베딩 미반영" 노드의 임베딩을 UNWIND 1문장으로 동기화(`SET n.embedding = row.embedding`).
- reconcile 은 임베딩을 비교에서 제외 중(현행 유지) — 본 보정은 발행 경로에서 해결.

**수용 기준**: "커밋 직후 즉시 발행 → 워커 완료 → 재발행 없이" 시나리오에서 다음 발행 때 임베딩 동기화 확인 테스트.

### M4. 프리뷰 개선 + 검증

- `formatCypherPreview`: 배칭 후 rows 덤프 방지 — "구문 + 대상 요약(행 수, 이름 목록 상위 n)" 형식으로. NeoConfirmSheet 표시 정상.
- 테스트: cypher-builder(압축·배칭·드리프트), roundtrip, contract 갱신. `npm run lint && npx vitest run` 그린.
- 성능 측정: 동일 시나리오(전체 초기화 후 발행) 개선 전/후 발행 시간 기록.

## 5. 리스크

| 리스크 | 수준 | 대응 |
|---|---|---|
| UNWIND 그룹 경계 실수로 의존 순서 붕괴 | 중 | M1 압축 선행 + 기존 정렬 경계 재사용 + roundtrip 테스트 |
| 압축 로직이 기발행 엔티티 DEL 을 오소거 | 중 | "배치 내 ADD 존재 시에만 소거" 규칙 + 전용 테스트 |
| Docker 포트/자격증명 불일치로 MCP 단절 | 저 | 동일 포트·비밀번호 유지, `get_neo4j_schema` 실연결 검증을 M0 수용 기준에 포함 |
| Desktop 잔존 데이터 유실 | 저 | Supabase 가 진실원, 재발행으로 복원 가능(사용자 재구축 예정) |

## 6. 참고

- Neo4j 드라이버 성능 가이드(배칭 1순위): https://neo4j.com/docs/javascript-manual/current/performance/
- Michael Hunger, 5 Tips for Fast Batched Updates: https://medium.com/neo4j/5-tips-tricks-for-fast-batched-updates-of-graph-structures-with-neo4j-and-cypher-73c7f693c8cc
- UNWIND 유무 7M 적재 비교: https://achantavy.github.io/cartography/performance/cypher/neo4j/2020/07/19/loading-7m-items-to-neo4j-with-and-without-unwind.html
- Neo4j GraphRAG 하이브리드 리트리버: https://neo4j.com/blog/developer/hybrid-retrieval-graphrag-python-package/
- 연결 이력/자격증명: 메모리 `neo4j-connection` (Docker `neo4j-onto` 이력, `neo4j-mcp` 실행식 포함)

## 7. 구현 결과 (2026-07-08)

**M0 — Docker 복귀 완료.** 기존 `neo4j-onto`(neo4j:5.26 community) 컨테이너·`neo4j-onto-data` 볼륨 재사용, `docker update --restart unless-stopped` 후 기동. 스키마 부트스트랩(제약 3·조회 인덱스·`concept_embedding` VECTOR) cypher-shell로 적용·`SHOW INDEXES` 확인. MCP(`neo4j-mcp`)는 무수정 재연결 검증(read 쿼리 성공). `.env.local` 무변경. **결정 수정**: §4의 "127.0.0.1 바인딩" 계획은 기각 — MCP 컨테이너가 `host.docker.internal`(host-gateway)로 접근하려면 전 인터페이스 게시가 필요해 기존 바인딩 유지. Desktop은 다운 상태 그대로 폐기(도커가 7687 선점).

**M1~M4 — 구현 완료.**
- 신규 `src/lib/neo4j/cypher-batch.ts`: `compressDetails`(생애주기 압축) + `batchStatements`(쿼리 템플릿 그룹핑→UNWIND, 상한 1,000행, 템플릿 우선순위로 delete-before-merge 순서 보장) + `buildBatchedCypherStatements` + `formatBatchedCypherPreview`(rows 요약·대형 배열 축약). 기존 `cypher-builder.ts`는 무수정(롤백 경로 공유 보존), params 재사용으로 로직 중복 0.
- `push/route.ts`: 압축 가드(기발행 커밋 섞이면 압축 생략), 전체 상쇄 시 400 대신 _SyncState만 기록, _SyncState UNWIND 1문장, M3 임베딩 드리프트 보정(Neo4j 미보유 노드 조회→Supabase 벡터 UNWIND 동기화, 실패해도 발행 계속).

**검증.** 신규 테스트 15건 포함 전체 724 테스트·lint·프로덕션 빌드 그린. **라이브 실증**: 실제 잔존 데이터(미발행 커밋 11개·detail 194건, "생성 후 전체 초기화" 시나리오 포함)를 dryRun→실발행 — **194건 → UNWIND 5구문**(propsSchema 16행·엣지 15행·인스턴스 10행·클래스 22행·관계타입 12행)으로 압축, 발행 성공, Neo4j에 _SyncState 11개만 기록(상쇄 정확), 미발행 커밋 0. Neo4j 왕복이 지배 요인에서 제거됨.

**잔여 관찰(범위 밖).** 발행 총 소요 ~14–29s의 대부분은 Supabase 읽기 왕복(회사망·시드니, 쿼리당 수 초)이다 — perf-roundtrip-notes 계보의 별도 주제. Neo4j 레그는 로컬 도커에서 수 ms.

## 8. 후속: Supabase 왕복 지연 개선 (2026-07-08 같은 날)

§7의 "잔여 관찰"을 이어서 당일 처리. 계측(M0)으로 병목을 확정한 뒤 3개 레버 적용.

**계측 결과(pg 프로브 + 라우트 단계 로그)**: 웜 pg 쿼리 ~145ms(시드니 RTT, 정상) / 콜드 연결(TLS) ~1s / 병렬 쿼리 시 풀 신규 연결 ~900ms / 미들웨어 getUser HTTPS ~0.4-0.7s. 즉 범인은 "왕복당 수 초"가 아니라 **직렬 왕복 수 × 콜드 연결 반복 + 요청마다 인증 왕복**.

**적용**:
1. push 라우트 — commits 가드 조회 ∥ commit_details 조회 `Promise.all`, 드리프트 Neo4j 조회를 context(Supabase)와 병렬화(전용 세션 self-close). 단계별 타이밍 로그(`[Neo4j Push] 발행 타이밍`) 상설.
2. `drizzle/index.ts` — postgres-js `keep_alive: 30` + 기동 시 3커넥션 워밍업(fire-and-forget) → 병렬 쿼리 콜드 페널티 제거.
3. `supabase/middleware.ts` — **/api 한정 검증 캐시(TTL 60s)**: 같은 세션 쿠키가 TTL 내 getUser 검증을 통과한 이력이 있으면 원격 재검증 생략. 미인증은 캐시 안 함, 페이지 라우트는 항상 원격 검증, 상한 1000엔트리. 트레이드오프(서버측 강제 로그아웃 반영 최대 60s 지연)는 코드 주석에 문서화.

**결과(동일 최악 시나리오: 기발행 194 detail, dryRun)**: 13.8~29.4s → **웜 2.2~2.3s** (커밋+detail 병렬 ~0.7s + context ~0.9s + 응답 꼬리 ~0.6s, 미들웨어 ~0ms). 실사용(미발행·압축) 경로는 페이로드가 작아 더 빠름. 테스트 730(+6: 검증 캐시)·lint·빌드 그린.

**남은 하한**: 시드니 RTT 145ms × 직렬 3왕복 + 페이로드 전송 — 코드로 더 줄이려면 리전 이전(서울) 또는 detail 페이로드 축소가 필요(별도 결정).
