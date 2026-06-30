# 응답속도 / DB 왕복 최적화 — 재개 노트

> Supabase(스테이징) ↔ Neo4j(프로덕션) 왕복 응답속도 개선 작업의 핸드오프 문서.
> 새 세션은 아래 측정값을 모르므로, 재측정 없이 이 문서로 바로 이어서 작업한다.

## 환경 / 측정 사실 (재측정 불필요)

| 항목 | 값 | 근거 |
|---|---|---|
| Supabase 리전 | 시드니 `aws-1-ap-southeast-2` (pooler :6543, transaction mode) | DATABASE_URL |
| Supabase 1왕복 (`select 1`) | **~170ms** | 직접 측정 |
| Supabase 8회 순차 | ~1359ms / 트랜잭션으로 묶어도 ~1642ms (더 느림) | 직접 측정 |
| Supabase 단일 multi-row 쿼리(8행) | **~173ms** (행수 무관) | 직접 측정 |
| **병렬화(Promise.all)** | **효과 없음** (순차 993 vs 병렬 1186 vs max=10 932) — 풀러가 직렬화 | 직접 측정 |
| Neo4j (로컬 컨테이너 `neo4j-onto`) | ~17ms | 직접 측정 |
| **dev 서버 오버헤드** | 라우트 1건 dev 6075ms vs **prod 615ms (≈10배)** | `next build && next start` 비교 |

**핵심 원리:** 시드니 링크에서 지연을 줄이는 유일한 레버는 **왕복 "횟수" 감소**다. 트랜잭션 묶기·병렬화는 무효. multi-row 단일 쿼리로 합쳐야 N왕복 → 1왕복.

## 프로덕션 실측 (워밍 중앙값) — 남은 병목

| 단계 | prod ms | 비고 |
|---|---|---|
| POST /classes | 615 | insert + provenance 기록 (2왕복) |
| POST /instances | 321 | ④ 적용됨 (1왕복) |
| POST /commits | 656 | ④ 적용됨 (2왕복) |
| **POST /neo4j/push** | **2365** | ⚠️ 최대 병목 = buildPushContext의 시드니 5~6회 순차 읽기 → ③ 대상 |

## 완료 (커밋됨 `8c7d732`, 브랜치 feat/v6-critic)

- **② 무효화 폭풍 제거** — `useApiSync.ts`: 커밋 후 `invalidateQueries()`(전체) → `{queryKey:['commits']}` 한정. 커밋당 8개 목록 재조회 제거.
- **④ 이중 왕복 제거** — `commits/route.ts`·`instances/route.ts`: `findFirst` 재조회 삭제, `insert().returning()`으로 응답(계약 동일). 커밋 3→2, 인스턴스 2→1.

## 완료 (브랜치 feat/v6-critic, ③=`af22d4e`)

- **③ push 재읽기 제거** — `neo4j/push/route.ts`:
  - `buildPushContext` 의 독립 5왕복(프로퍼티·instance_values·어트리뷰션·클래스/인스턴스 임베딩)을 **`UNION ALL` 단일 쿼리**로 합침. 누락 프로퍼티 보충만 `instance_values` 결과 의존이라 조건부 2왕복으로 분리(대개 0건). 임베딩은 `embedding::text::jsonb` 로 운반(서버 계산값 그대로, 재계산 금지). `PushContext` 출력 shape 동일.
  - 푸시 후 `commits` pushed 표시를 커밋별 루프 → `inArray` **단일 UPDATE**(N→1왕복).
  - 검증: `next build` 통과. dryRun 라우트로 실 Postgres 대비 context 동일 산출 확인(propsSchema·임베딩·instance 값 정상).
  - **실측(시드니 링크, 동일 시드 6행, warm median 7회):** buildPushContext **OLD 1565ms → NEW 318ms (≈4.9×, -1247ms)**. 문서화된 full push 2365ms 기준 컨텍스트 구성분이 이만큼 빠져 **push ≈ 1.1s 수준**으로 단축 예상(다건 커밋이면 commits UPDATE N→1 만큼 추가 절감).
  - 측정용 임시 데이터는 양쪽 DB에서 삭제 완료(원래 0개 상태 복귀), 임시 스크립트 삭제.

- **① 대량 적재 multi-row 배치** — `batch/route.ts` + `useApiSync.ts`:
  - batch 라우트 create 경로를 **테이블별 multi-row 단일 insert**로 coalesce(생성 의존 순서 유지). attribution **일괄 기록 이식**(class·edge provenance), `relation_type.category`·`instance.description`·`edge.isBridge`·class `partitionId`/provenance **필드 보존**, `instance_value` **onConflict upsert**(중복 갱신). update/delete 는 per-op 유지.
  - `useApiSync` 의 ADD 경로를 **batch 1요청**으로 교체(MOD/DEL 은 기존 per-entity 라우트 그대로). 기존 syncChange 의 ADD 분기 제거.
  - 검증: `next build` 통과. 실 Postgres 대비 7종 create 1배치 후 **비즈니스 로직 전수 확인**(partition·provenance·attribution 2건·category·description·isBridge·upsert 멱등성 모두 정상).
  - **실측(시드니 링크, N=10 class 생성):** 개별 N요청 순차 3819ms / 병렬 1606ms → **batch 1요청 977ms**. N 증가 시 batch 는 ~상수, 개별은 N 선형 → 대량 확정에서 격차 확대.
  - 측정용 임시 데이터 삭제 완료, 임시 스크립트 삭제.

## 남은 작업

### ⑤ (인프라, 코드 위험 없음) Supabase 서울 리전 이전
- 시드니 170ms → 서울 ~15~30ms = 모든 작업 5~10배. in-place 변경 불가 → 서울 프로젝트 신규 + `migrations/`·스키마로 이전.

## 무료·무위험 즉효
평소 작업도 `next build && next start`(프로덕션 모드). dev의 초 단위 지연이 사라진다.

## 측정 방법 메모
- 직접 DB 측정: `.env.local` 읽어 `postgres`/`neo4j-driver`로 `select 1`·`RETURN 1` RTT. (임시 스크립트는 측정 후 삭제했음)
- 라우트 측정: prod 서버를 `npx next start -p 3100`(dev 3000과 분리)로 띄우고 `/api/...` POST 타이밍. 워밍 1회 후 중앙값.
- 측정 후 테스트 데이터는 양쪽 DB에서 반드시 삭제(원래 0개 상태).

---
### 새 세션 재개 프롬프트 (복붙용)
> `docs/perf-roundtrip-notes.md` 읽고 ③(push 재읽기 제거)부터 진행해. 비즈니스 로직 삭제·대대적 변경은 지양하고, next build로 검증한 뒤 push 단계 prod 재측정해서 전후 비교해줘.
