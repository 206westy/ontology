# PRD-J: 온톨로지 GitFlow — 브랜치 기반 협업

> **상태**: 진행전 (기획)
> **작성일**: 2026-07-06
> **선행 분석**: 코드베이스(commits/push/staging)·Supabase 스키마·Neo4j 정합 검증(2026-07-06 세션, 지문 대조로 무손실 미러링 확인)
> **관련**: PRD-B(구획), PRD-E(무손실 라운드트립), Auth 구현(Supabase Auth)

---

## 1. 배경과 문제

### 1.1 Git 패턴을 도입한 원래 이유

여러 사람이 **동시에 하나의 온톨로지에 계속 추가/수정하면 꼬인다.** 이를 막으려고 "Ontology Git" 3계층(작업 → 스테이징(Supabase) → 배포(Neo4j))을 도입했다.

### 1.2 그런데 현재 구조는 Git의 "이력"만 있고 "격리"가 없다

코드 분석 결과, 현재 시스템은 사실상 **"모두가 main 브랜치에 직접 커밋"**하는 구조다:

| Git의 요소 | 현재 구현 | 판정 |
|---|---|---|
| 커밋(이력) | `commits` + `commit_details`(ADD/MOD/DEL + before/after 스냅샷) | ✅ 있음 |
| 푸시(배포) | `/api/neo4j/push` — 커밋 델타를 Cypher로 재생(MERGE/DETACH DELETE) | ✅ 있음 |
| 롤백 | `buildRollbackStatements` (before 스냅샷 역재생) | ✅ 있음 |
| **작성자** | `commits`에 user 컬럼 없음 — 누가 커밋했는지 모름 | ❌ 없음 |
| **브랜치(격리)** | 없음 — 전원이 동일 엔티티 테이블에 실시간 기록 | ❌ 없음 |
| **병합/충돌 해소** | 없음 — last-writer-wins | ❌ 없음 |
| **리뷰/승인(MR)** | 없음 — 누구나 언제든 push 가능 | ❌ 없음 |

### 1.3 왜 지금 구조에서 동시 작업이 꼬이는가 (근본 원인)

`useApiSync`가 Zustand `pendingChanges`를 구독해 **엔티티 테이블(classes/instances/edges…)에 즉시 낙관적 동기화**한다. 즉:

- 스테이징 DB의 엔티티 테이블은 **"모두가 공유하는 단 하나의 작업본"**이다.
- 두 사람이 동시에 편집하면 커밋 이전에 이미 서로의 쓰기가 섞인다(꼬임의 실체).
- 커밋은 이력 기록일 뿐, 작업 격리 단위가 아니다.

### 1.4 이미 갖춰진 자산 (재사용 가능)

- **3-way 병합의 소재**: `commit_details.before_snapshot / after_snapshot` — 충돌 판정에 그대로 사용 가능
- **재생 엔진**: `buildCypherStatements` — "커밋 델타를 대상 스토어에 적용"하는 패턴이 이미 검증됨(Neo4j push). 같은 패턴을 "브랜치 커밋 → main 엔티티 적용(병합)"에 재사용
- **정합 검증**: `/api/neo4j/reconcile` — 병합 후 무결성 확인에 재사용
- **인증**: Supabase Auth(로그인/세션/미들웨어) 구현 완료 — 작성자·리뷰어 식별 기반
- **구획(partitions)**: 도메인 분리(직교 개념) — 브랜치와 조합 가능("구획 X의 feature 브랜치")
- **UI**: `ChangesSheet`(변경 목록), `CommitBar`(±~ 카운트), `LifecycleIndicator` — MR 변경 요약 화면에 재활용

---

## 2. 목표 / 비목표

### 목표

1. **격리**: 각 작업자는 자기 브랜치에서 작업하며, 커밋 전이든 후든 서로의 작업본을 오염시키지 않는다.
2. **작성자 추적**: 모든 커밋에 author 기록. "누가 무엇을 언제" 완전 추적.
3. **병합 + 충돌 해소**: 브랜치 → main 병합 시 3-way 충돌 감지, UI로 해소(mine/theirs).
4. **리뷰 게이트(MR)**: main 병합 전 변경 요약 검토·승인 흐름.
5. **배포 규율**: Neo4j push는 **main에서만**. (이전 세션 결론 유지: 삭제·초기화 포함 모든 변경은 커밋 경유 — 이미 구현됨)

### 비목표 (이번 범위 아님)

- 실시간 공동 편집(CRDT/OT, 같은 브랜치 동시 편집) — 브랜치 격리로 대체
- 브랜치의 브랜치(중첩), rebase, cherry-pick
- Neo4j에 브랜치별 그래프 저장(운영 그래프는 main 하나)
- 조직/팀/세분화된 권한 체계(RBAC) — 역할은 owner/editor 2단계만

---

## 3. 설계 결정: 브랜치를 어떻게 표현할 것인가

### 검토한 대안

| 방식 | 개요 | 장점 | 단점 |
|---|---|---|---|
| **A. 행 복사(branch_id 컬럼)** | 모든 엔티티 테이블에 branch_id 추가, 브랜치 생성 = 행 복사 | 클라이언트 로딩 로직 유지 | PK가 (id, branch_id) 복합키化 → 8개 테이블 FK 연쇄 수정, 마이그레이션 대수술 |
| **B. 커밋 체인(순수 이벤트소싱)** | 브랜치 = 커밋 목록, 체크아웃 = 전체 이력 재생 | 스키마 변경 최소 | 재생 비용, 베이스 시점 상태 계산 복잡 |
| **C. 스냅샷 + 커밋 체인 (선택)** | 브랜치 생성 시 **그래프 전체 스냅샷(jsonb) 1개** 저장 + 이후 커밋 체인. 체크아웃 = 스냅샷 로드 + 브랜치 커밋 재생 | 엔티티 테이블 무변경, 기존 커밋/재생 자산 그대로 재사용, 그래프 규모(수십~수백 노드)에 스냅샷 비용 무시 가능 | 초대형 그래프에선 스냅샷 비대(현 규모 비해당) |

**선택: C.** 근거 — `commit_details`가 이미 스냅샷 기반이고, export API로 전체 그래프 직렬화가 이미 존재하며, `buildCypherStatements` 재생 패턴이 검증돼 있다. 엔티티 테이블(= main 작업본)은 손대지 않으므로 기존 API·라이브 싱크·LLM 파이프라인이 main에서 무변경으로 동작한다.

### 핵심 규칙

```
main(엔티티 테이블) = 유일한 공유 작업본. 병합으로만 변경(직접 편집은 owner만/설정)
feature 브랜치      = base_snapshot + 커밋 체인. 체크아웃 시 클라이언트에서 재구성
Neo4j push          = main 커밋만 가능 (branch_id IS NULL or 'main')
병합                = 브랜치 커밋 델타를 main 엔티티에 적용 + 병합 커밋 생성 (충돌 시 중단·해소)
```

### 충돌 판정 (3-way)

브랜치의 각 변경 `d`(targetId 기준)에 대해, main에서 **브랜치 생성 이후** 같은 targetId를 건드린 커밋이 있는지 검사:

| 브랜치 | main (base 이후) | 판정 |
|---|---|---|
| MOD | 변경 없음 | 자동 적용 |
| MOD | MOD (다른 필드) | 자동 병합(필드 단위), 같은 필드면 충돌 |
| MOD | MOD (같은 필드, 다른 값) | **충돌** → UI 해소 |
| MOD | DEL | **충돌** (수정 vs 삭제) |
| DEL | MOD | **충돌** |
| DEL | DEL | 자동(동일 결과) |
| ADD | ADD (같은 id — UUIDv5 결정적 생성 시 가능) | **충돌** (내용 다르면) |

판정 소재는 전부 `before_snapshot`/`after_snapshot`에 이미 있다. base는 브랜치의 `base_commit_id`.

---

## 4. 데이터 모델 (Supabase 마이그레이션)

```sql
-- M1: 브랜치
CREATE TABLE branches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,                      -- 'main'은 예약(행 없음, NULL=main 규약)
  description   text NOT NULL DEFAULT '',
  author_id     uuid NOT NULL,                      -- auth.users 참조
  base_commit_id uuid REFERENCES commits(id),       -- 분기 시점 main 커밋
  base_snapshot jsonb NOT NULL,                     -- 분기 시점 그래프 전체(export 포맷 재사용)
  status        text NOT NULL DEFAULT 'active',     -- active | merged | abandoned
  merged_at     timestamptz,
  merged_by     uuid,
  merge_commit_id uuid REFERENCES commits(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(name)
);

-- M1: commits 확장 (기존 행 호환: 전부 NULL = main·작성자 미상)
ALTER TABLE commits ADD COLUMN branch_id uuid REFERENCES branches(id);
ALTER TABLE commits ADD COLUMN author_id uuid;          -- auth.users
ALTER TABLE commits ADD COLUMN parent_commit_id uuid REFERENCES commits(id);

-- M3: 머지 리퀘스트
CREATE TABLE merge_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   uuid NOT NULL REFERENCES branches(id),
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  author_id   uuid NOT NULL,
  status      text NOT NULL DEFAULT 'open',   -- open | approved | merged | closed | conflicted
  reviewer_id uuid,
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

인덱스: `commits(branch_id)`, `merge_requests(status)`. RLS는 기존 정책(deny-all + service-role) 유지, author는 API 레이어에서 `auth.getUser()`로 주입.

---

## 5. 동작 흐름

### 5.1 브랜치 생성·체크아웃

1. `POST /api/branches` — 현재 main 최신 커밋 id + export 스냅샷 저장
2. 클라이언트 체크아웃: `base_snapshot`을 Zustand에 로드 → 브랜치 커밋들(오래된 순) `commit_details`를 스토어에 재생
3. **useApiSync 게이팅(핵심 변경)**: `currentBranchId !== null`이면 엔티티 API 동기화 **중단**(main 작업본 보호). 변경은 `pendingChanges` → 커밋(branch_id 포함)으로만 기록
4. 자동저장(`isAutoSave`) 커밋도 branch_id를 달고 저장 — 브랜치 작업은 기기 간에도 이어짐

### 5.2 커밋

- 기존 `CommitBar` 흐름 유지 + `branch_id`, `author_id`, `parent_commit_id` 기록
- main에서의 직접 커밋: 기본 허용(1인 사용 호환) → M4에서 "main 보호" 설정 시 owner 외 차단

### 5.3 머지 리퀘스트 → 병합

1. `POST /api/merge-requests` — 브랜치 변경 요약(커밋 델타 집계) 생성
2. 리뷰 화면: ChangesSheet 재활용(±~ 목록, before/after 비교), 승인/반려
3. `POST /api/merge-requests/:id/merge`:
   a. 3-way 충돌 검사(§3) — 충돌 시 `conflicted` 상태 + 충돌 목록 반환
   b. 무충돌(또는 해소 완료) → 브랜치 커밋 델타를 **main 엔티티 테이블에 적용**(서버에서 트랜잭션) + 병합 커밋 생성(details = 적용 델타)
   c. 브랜치 `merged` 처리
4. 병합 커밋은 미반영(unpushed) 상태 → 기존 push 버튼으로 Neo4j 반영 (또는 자동 push 옵션)

### 5.4 충돌 해소 UI

- 충돌 항목별 카드: 좌(내 브랜치 after) / 우(main 현재) / base 3열 비교
- 선택: "내 것 유지" / "main 유지" / (MOD-MOD 같은 필드) 직접 편집
- 해소 결과를 병합 페이로드에 반영 후 재시도

### 5.5 Neo4j push 규율

- `push` route에 가드 추가: 요청 커밋들이 전부 main(branch_id NULL) 커밋인지 검증, 아니면 400
- 기존 push/rollback/reconcile 로직은 무변경

---

## 6. UI 변경

| 위치 | 변경 |
|---|---|
| 헤더 | **브랜치 스위처** (현재 브랜치명, 전환/생성 드롭다운) — PartitionSwitcher 패턴 미러링 |
| CommitBar | 현재 브랜치 배지, "브랜치에 저장" 문구 분기, main 보호 시 잠금 표시 |
| 신규: MR 패널 | MR 목록/생성/리뷰/병합 (열림·승인·충돌 상태) |
| 신규: 충돌 해소 다이얼로그 | 3열 비교 + 선택 |
| 커밋 히스토리 | 작성자 아바타·브랜치 라벨 표시 |

---

## 7. 마일스톤

| 단계 | 내용 | 핵심 산출물 | 복잡도 |
|---|---|---|---|
| **M1 작성자·스키마 기반** | commits에 author/branch/parent, branches 테이블, API에 auth 주입, 히스토리에 작성자 표시 | 마이그레이션 1, 기존 흐름 무변경(전부 nullable) | S |
| **M2 브랜치 격리** | 브랜치 생성/체크아웃/재생, useApiSync 게이팅, 브랜치 스위처 UI, 브랜치 자동저장 | 격리된 작업 가능 | M~L |
| **M3 병합·충돌** | 3-way diff 엔진, MR API+화면, 충돌 해소 UI, main 적용 트랜잭션 | 브랜치 → main 병합 완결 | L |
| **M4 거버넌스** | main 보호(역할), push=main 전용 가드, 병합 후 자동 push 옵션, Realtime presence(선택) | 협업 규율 완성 | S~M |

각 마일스톤 종료 조건: 단위 테스트 + 기존 테스트 그린 + 빌드 통과 + (M2부터) 라이브 시나리오 검증(2 브라우저 동시 작업).

---

## 8. 리스크

| 리스크 | 수준 | 대응 |
|---|---|---|
| **useApiSync 게이팅 누락 경로** — LLM parse/import/batch/enrich 등이 엔티티 API를 직접 호출하면 브랜치 격리가 뚫림 | **높음** | M2에서 엔티티 쓰기 경로 전수 조사(`/api/classes` 등 8개 라우트 호출부), 브랜치 모드 시 공통 차단 레이어(클라이언트 api.ts 단일 진입점이라 가능) |
| 자동저장 커밋 폭증(브랜치별 isAutoSave) | 중간 | 기존 autosave 압축 정책 유지, 병합 시 autosave 커밋 스쿼시 |
| 충돌 UX 복잡도 | 중간 | MVP는 항목 단위 mine/theirs만, 필드 단위 편집은 후순위 |
| 스냅샷 포맷 드리프트(export 포맷 변경 시 구 브랜치 체크아웃 실패) | 낮음 | 스냅샷에 `schemaVersion` 포함, 로더에 버전 가드 |
| 1인 사용 회귀(협업 기능이 솔로 흐름을 무겁게) | 중간 | 브랜치 미생성 시 현행과 100% 동일 동작(main 직행) 보장 |

---

## 9. 오픈 퀘스천 (구현 전 결정 필요)

1. **main 보호 기본값**: 처음부터 "main 직접 편집 금지"로 갈지, 옵션(기본 off)으로 갈지 → 1인 사용 빈도 고려해 **기본 off 권장**
2. 병합 후 **자동 Neo4j push** 여부 → 기존 규율(수동 반영) 유지 권장, 옵션 제공
3. 브랜치와 **구획(partition)** 조합 — 브랜치가 전체 그래프를 스냅샷할지, 구획 단위로 한정할지 → MVP는 전체 그래프(단순), 구획 스코프 브랜치는 후속
4. autosave 스쿼시 정책(병합 시 커밋 메시지 정리)

---

## 10. 수용 기준 (Definition of Done)

- [ ] 두 사용자가 각자 브랜치에서 동시에 작업해도 서로의 화면·데이터에 영향 없음 (2-브라우저 라이브 검증)
- [ ] 브랜치 커밋 → MR → 승인 → 병합 → main push → Neo4j 반영 전 과정 동작
- [ ] 같은 노드를 양쪽에서 수정 시 충돌 감지·해소 UI 동작
- [ ] 모든 커밋에 author 표시
- [ ] push는 main 커밋만 허용(브랜치 커밋 push 시도 시 명확한 오류)
- [ ] 브랜치 기능 미사용 시 기존 흐름(솔로) 완전 호환 — 기존 테스트 전부 그린
- [ ] 병합 후 reconcile `ok:true`
