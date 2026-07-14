# PRD-PF-A 구현 착수 스펙 — 멀티 온톨로지·테넌시 마이그레이션 (실행 설계)

> 작성: 2026-07-12 · PRD-PF-A(기초공사)의 **구현 착수용 상세 스펙**. 실제 스키마 검증 기반.
> 대상 독자: 구현 엔지니어(FDE). 이 문서는 마이그레이션 SQL 스케치·RLS·앱계층 가드·무중단 롤아웃 순서를 담는다.
> 검증 사실(코드 직접 확인, `supabase/migrations` 29개): 스코프 대상 테이블 17종, `commits.branch_id` **존재**(브랜치↔커밋 연결 확인), `branches`는 전역 `UNIQUE(name)`, `partition_id` 가산→백필→NOT NULL 선례 존재(`v5_add_partitions`·`h_p3_term_glossary`), 현 RLS=deny-all이나 **서비스롤 키가 우회**(실질 방어는 앱계층).
> 확정 결정 반영: D3=A(정석 순서), 이 스펙은 그 첫 산출물. D1/D2/D7은 PF-B 소관이나 스코프 키는 신규 `functions`/`decision_results`(D2)에도 동일 적용.

---

## 0. 요약

현재 17개 도메인 테이블 어디에도 워크스페이스/온톨로지 스코프가 없고(전 테이블 `ontology_id` 0건), 단일 전역 그래프다. 이 스펙은 **`workspaces`·`ontologies`·`memberships` 3개 컨테이너 테이블을 신설**하고, **검증된 `partition_id` 백필 패턴(가산 컬럼→기본값 백필→NOT NULL 강화)을 17개 테이블에 확장**하며, **전역 유니크를 온톨로지 스코프로 재정렬**하고, **RLS(멤버십 스코프)+앱계층 가드(`requireOntologyAccess`) 이중 방어**를 세운다. 핵심 정직: **RLS만으론 안전하지 않다 — 서비스롤이 우회하므로 1차 방어선은 반드시 API 라우트의 앱계층 검증이다.**

---

## 1. 목표 & 비목표

**목표:** (1) 한 사용자가 여러 온톨로지 보유, (2) 워크스페이스(팀) 경계+멤버십 권한, (3) 온톨로지별 격리(한 온톨로지 편집이 다른 것에 영향 없음), (4) git-for-data(branches/commits)를 온톨로지 스코프로, (5) 기존 단일그래프 편집경험은 "온톨로지 1개 선택 시" 무손실 보존, (6) 무중단 마이그레이션(기존 데이터 유실 0).

**비목표(PF-A 밖, §10/타 PRD):** 워크스페이스 간 공유·협업, 빌링 연동, SSO/SAML, 실시간 다인 동시편집(CRDT), 온톨로지 공개 마켓플레이스(D01), fork/clone 의미론(PF-B).

---

## 2. 신규 컨테이너 테이블 (SQL 스케치)

```sql
-- M1: 컨테이너 3종
CREATE TABLE workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE NOT NULL,
  created_by  uuid NOT NULL,               -- auth.users
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ontologies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  status        text NOT NULL DEFAULT 'active',   -- active|archived
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE memberships (
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,             -- auth.users
  role          text NOT NULL DEFAULT 'editor',  -- owner|admin|editor|viewer
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX idx_ontologies_ws ON ontologies (workspace_id);
CREATE INDEX idx_memberships_user ON memberships (user_id);
```

> 권한 매트릭스(초안): owner=전권+멤버관리, admin=온톨로지 CRUD+멤버초대, editor=그래프 편집·커밋·발행, viewer=읽기·질의만. (세부 CRUD는 §10 잔여결정)

---

## 3. 스코프 키 소급 — 17개 테이블

### 3.1 대상 테이블(검증됨)
`classes` · `properties` · `instances` · `instance_values` · `relation_types` · `edges` · `constraints` · `validation_results` · `partitions` · `attributions` · `patterns` · `term_glossary` · `relation_glossary` · `commits` · `commit_details` · `branches` · `merge_requests`
(레거시 `axioms`·`axiom_classes`는 이미 constraints로 통합·드롭 → 대상 제외.)

> **스코프 키 선택:** 전부 `ontology_id`를 단일 스코프 키로. workspace_id는 ontologies에서 조인으로 도출(비정규화 최소화). 단 RLS 성능을 위해 자주 필터되는 `classes`/`edges`/`instances`엔 `workspace_id` 비정규화 컬럼도 선택 고려(§10).

### 3.2 검증된 3단계 백필 패턴 (`v5_add_partitions` 선례 그대로)
각 테이블에 대해:

```sql
-- (1) 가산: NULL 허용 컬럼 추가 (기존 쓰기 안 깨짐)
ALTER TABLE classes ADD COLUMN IF NOT EXISTS ontology_id uuid REFERENCES ontologies(id) ON DELETE CASCADE;

-- (2) 백필: 기존 전역 데이터를 '기본 온톨로지' 1개로 귀속
UPDATE classes SET ontology_id = :default_ontology_id WHERE ontology_id IS NULL;

-- (3) 강화: NOT NULL + 인덱스
ALTER TABLE classes ALTER COLUMN ontology_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_classes_ontology ON classes (ontology_id);
```

`:default_ontology_id` = 마이그레이션 시작 시 생성하는 "기본 워크스페이스 > 기본 온톨로지"(기존 실사용 데이터 전량 귀속). 17개 테이블에 동일 반복(자식 테이블은 부모에서 상속 백필 가능: 예 `instance_values`는 `instances.ontology_id` 조인으로 UPDATE).

### 3.3 순서 주의(FK 의존)
부모→자식 순으로 백필: classes→properties→instances→instance_values, relation_types→edges, commits→commit_details, branches→(commits.branch_id 이미 있음)→merge_requests. 자식은 부모 조인으로 백필하면 정합 보장.

---

## 4. 유니크·계보 재정렬

```sql
-- 전역 UNIQUE(name) → 온톨로지 스코프 (핵심: 서로 다른 온톨로지가 같은 브랜치명 'main' 허용)
ALTER TABLE branches DROP CONSTRAINT branches_name_key;      -- 실제 제약명 확인 후
ALTER TABLE branches ADD CONSTRAINT branches_ontology_name_uk UNIQUE (ontology_id, name);
```

- `commits.branch_id`는 이미 존재(NULL=main) → 온톨로지 스코프 안에서 그대로 동작. 단 `commits`에도 `ontology_id` 추가해 브랜치 없는 main 커밋도 온톨로지 귀속.
- `partitions` vs `ontologies` 관계 확정: **partitions = 온톨로지 내부 구획(하위 분할) 유지**, ontologies = 최상위 재사용 단위. partitions에 `ontology_id` 추가, 기존 "기본 구획"은 기본 온톨로지 소속.
- 기타 전역 유니크/자연키가 있으면 동일하게 `(ontology_id, …)`로 재정렬(마이그레이션 전 전수 grep 필요 — §10).

---

## 5. RLS + 앱계층 가드 (이중 방어 — 가장 중요)

### 5.1 정직한 전제
현 RLS=deny-all이지만 **Drizzle가 `postgres`/service-role로 접속해 RLS를 우회**한다(코드 확인). 따라서:
- **1차 방어선 = 앱계층** `requireOntologyAccess(userId, ontologyId, minRole)` — 모든 API 라우트 진입에서 강제.
- **2차 방어선(심층 방어) = RLS** — 혹시 클라이언트 키/직접 쿼리 경로가 생겨도 막도록.

### 5.2 앱계층 가드(모든 라우트 진입)
```ts
// lib/authz/requireOntologyAccess.ts (신규)
export async function requireOntologyAccess(
  userId: string, ontologyId: string, minRole: Role = 'viewer'
): Promise<{ workspaceId: string; role: Role }> {
  const row = await db.select(...)
    .from(ontologies)
    .innerJoin(memberships, and(
      eq(memberships.workspaceId, ontologies.workspaceId),
      eq(memberships.userId, userId)))
    .where(eq(ontologies.id, ontologyId)).limit(1);
  if (!row) throw new ForbiddenError();
  if (!roleGte(row.role, minRole)) throw new ForbiddenError();
  return { workspaceId: row.workspaceId, role: row.role };
}
```
- 모든 `api/*` 라우트: 요청에서 `ontologyId` 추출 → `requireOntologyAccess` → 이후 쿼리에 `where ontology_id = :ontologyId` 필수. (쿼리 헬퍼로 강제: 스코프 없는 select 금지 lint 규칙 권장.)

### 5.3 RLS 정책(2차 방어, 멤버십 스코프)
```sql
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY classes_member_read ON classes FOR SELECT
  USING (ontology_id IN (
    SELECT o.id FROM ontologies o
    JOIN memberships m ON m.workspace_id = o.workspace_id
    WHERE m.user_id = auth.uid()));
-- write 정책은 role >= editor 조건 추가. 17개 테이블에 정책 함수(헬퍼)로 반복.
```
> 권장: `user_has_ontology_access(ontology_id, min_role)` SQL 함수를 만들어 정책 중복 제거.

---

## 6. 앱 통합 (마이그레이션 후)

- **온톨로지 스위처 UI**: 워크스페이스 > 온톨로지 선택(상단). 선택된 `ontologyId`를 전역 컨텍스트로. 기존 단일 캔버스는 "선택된 온톨로지 1개"를 그대로 렌더 → **경험 무손실**.
- **API 계약 변경**: 전 `api/*` 라우트가 `ontologyId`(헤더 or 경로 파라미터) 필수 수령 → 가드 → 스코프 쿼리. (약 50개 라우트, 헬퍼로 일괄.)
- **store 스코핑**: zustand entity-slice에 `ontologyId` 편입, 온톨로지 전환 시 상태 리셋+재로드(기존 workspace-persistence의 "마지막 구획" 로직을 "마지막 온톨로지"로 확장).
- **workspace-persistence 정리**: 기존 "workspace"=구획 뷰상태였음 → 이름 충돌 해소(구획=partition, 워크스페이스=테넌시).

---

## 7. 무중단 마이그레이션 실행 순서

1. **M1**: 컨테이너 3테이블 생성 + 기본 워크스페이스/온톨로지/기존 사용자 membership(owner) 시드.
2. **M2**: 17테이블 `ontology_id` **가산(NULL 허용)** — 이 시점 앱은 기존대로 동작(스코프 미사용).
3. **M2.5**: **백필**(전 데이터 → 기본 온톨로지). 배치·자식 조인 상속.
4. **M3**: 앱 코드 배포 — 라우트가 `ontologyId` 수령·가드·스코프 쿼리(기본 온톨로지로 동작). 스위처 UI.
5. **M4**: `ontology_id` **NOT NULL 강화** + 유니크 재정렬(branches 등) + 인덱스.
6. **M5**: RLS 정책 활성화(2차 방어) + 앱계층 가드 계약 테스트.

> 각 단계는 앞뒤로 롤백 가능하게 분리(가산과 강화 사이에 코드 배포를 끼워 무중단). NOT NULL 강화(M4)는 백필·코드배포 완료 후에만.

---

## 8. 리스크 & 완화

- **R1 소급 데이터 무결성**: 자식 테이블 백필 누락 시 고아 발생. → 부모조인 백필 + 백필 후 `COUNT(* WHERE ontology_id IS NULL)=0` 검증 게이트(NOT NULL 강화 전 필수).
- **R2 RLS 착각(가장 큼)**: "RLS 켰으니 안전"은 거짓(서비스롤 우회). → 앱계층 가드를 1차 방어로 못박고, 스코프 없는 쿼리 금지 lint/리뷰.
- **R3 50개 라우트 누락**: 한 라우트라도 가드 빠지면 크로스-온톨로지 유출. → 공통 미들웨어/withOntologyGuard 래퍼로 강제, 커버리지 테스트.
- **R4 유니크 재정렬 충돌**: 기존 전역 유니크에 이미 중복이 있으면 실패. → 재정렬 전 중복 스캔.
- **R5 대규모 스키마 변경 다운타임**: 17테이블 ALTER. → 가산은 즉시(메타데이터), NOT NULL은 백필 후 별도, 대형 테이블은 `NOT VALID`+`VALIDATE CONSTRAINT` 2단계.

---

## 9. 수용 기준

- [ ] 한 사용자가 2개 이상 온톨로지를 만들고 서로 격리됨(A 온톨로지 클래스가 B에 안 보임) — 계약 테스트.
- [ ] 기존 실사용 데이터 전량이 기본 온톨로지로 귀속되고 유실 0(백필 후 NULL 0건 검증).
- [ ] 서로 다른 온톨로지가 같은 브랜치명('main') 보유 가능.
- [ ] 모든 `api/*` 라우트가 `requireOntologyAccess` 통과 없이는 데이터 반환 안 함(가드 누락 0 — 커버리지 테스트).
- [ ] viewer는 편집·커밋 불가, editor는 가능(role 게이트 테스트).
- [ ] RLS 활성 상태에서 멤버 아닌 사용자의 직접 쿼리 차단(2차 방어 테스트).
- [ ] 온톨로지 1개 선택 시 기존 단일 캔버스 편집 경험 회귀 0.
- [ ] lint·프로덕션 빌드·기존 테스트 그린.

---

## 10. 잔여 결정 (구현 착수 전 확정)

1. **비정규화 `workspace_id`**: 성능 위해 hot 테이블(classes/edges/instances)에 중복 컬럼 둘지 vs ontologies 조인만.
2. **patterns/term_glossary/relation_glossary 스코프**: 온톨로지 전용 vs 워크스페이스 공유 vs 전역 공개(패턴 마켓플레이스 D01과 연동) — 셋 중.
3. **전역 유니크 전수 조사**: branches 외 자연키 유니크 목록 확정(마이그레이션 전 grep).
4. **role별 세부 CRUD 매트릭스** 확정.
5. **fork/clone 의미론**은 PF-B로 위임(온톨로지 복제 시 커밋 계보 처리).

> 이 5개는 구현 시작 첫 스프린트에서 확정. 나머지는 위 순서대로 착수 가능.
