# PRD-PF-D — 데이터 연결 & 데이터셋 재사용 (Dataset Registry + 얇은 커넥터)

> **시리즈:** PRD-PF (플랫폼) · **의존:** PRD-PF-A(워크스페이스/온톨로지 테넌시 신설) · PRD-PF-C(`problems`가 데이터셋을 참조)
> **작성일:** 2026-07-12
> **원칙:** 비판적 옹호 · 기존 자산 재배치 우선 · shadcn/ui · 한국어 UI · HITL · 시각언어 특색(원/점/파선/실선) 보존
> **정직 경계:** 데이터 통합(팔란티어식 무거운 ETL) 정면승부 금지. 완전자동 매핑·완전자동 정제 금지 — 사람이 확인한다.

---

## 0. 한 줄 요지

지금 우리는 CSV·텍스트를 **올릴 때마다 다시 파싱**해서 그래프에 반영한다 — "이미 연결한 데이터"라는 개념 자체가 없다. 이 PRD는 `datasources`/`datasets`/`dataset_columns` 3테이블로 **데이터셋 레지스트리**를 세우고, 정제된 데이터(CSV·DB 뷰·파케이)를 **한 번 연결하면 여러 problem이 재사용**하게 만든다. 무거운 ETL·실시간 스트리밍·SAP 직접 연동은 명시적으로 스코프 아웃한다 — 우리는 "이미 정제된 데이터"를 전제로 얇게만 붙는다.

---

## 1. 목적 (Purpose)

**왜 지금 이 격차인가.**

현재 데이터 유입 경로는 두 갈래뿐이다: ① CSV 업로드/텍스트 붙여넣기 → `api/llm/parse`(CSV 15,000자 상한, 텍스트는 청킹으로 무제한) → LLM이 즉석 파싱 → 그래프 반영, ② RDF/JSON-LD/Turtle → `api/import`. 두 경로 모두 **파싱 결과가 그래프에 흡수되고 나면 원본 데이터셋이라는 실체가 사라진다.** 같은 설비 마스터 CSV를 다른 problem에서 또 쓰려면 다시 업로드해서 다시 파싱해야 한다 — 토큰 비용이 중복되고, 같은 원본인데 파싱 결과가 매번 미세하게 달라질 수 있고(비결정성), "이 데이터가 어느 problem에서 왔는지" 추적이 어렵다.

동시에 우리 전략은 이미 명확하다: **데이터 통합(팔란티어 Foundry의 ①데이터 연결 ②온톨로지)에서 정면승부하지 않는다.** 우리 승부처는 "이미 정제된 데이터 위에서 온톨로지를 스케치북처럼 빠르게 만들고 AI가 비평하는" 경험이지, ETL 파이프라인 구축이 아니다. 그래서 이 PRD는 두 가지를 동시에 한다 — (a) **재사용**: 정제 데이터를 등록물로 승격해 여러 problem이 공유하게 하고, (b) **경계 유지**: 커넥터는 "읽기 전용 얇은 연결"만 지원하고 무거운 변환·실시간 동기화는 하지 않는다고 제품 표면에서부터 못 박는다.

이 PRD는 PRD-PF-A(워크스페이스 테넌시)가 있어야 `datasources`/`datasets`가 소속될 워크스페이스가 존재하고, PRD-PF-C(`problems`)가 있어야 "재사용"의 소비 주체가 존재한다는 점에서 두 PRD에 의존한다. 이번 PRD는 **데이터모델과 매핑 표면**까지만 다루고, AI의 데이터 충분성 진단·결측 추천 로직은 PRD-PF-E로 넘긴다.

---

## 2. 목표 & 지표 (Goals & Metrics)

| 목표 | 지표 | 현재 | 목표 |
|---|---|---|---|
| 재파싱 제거 | 동일 원본 데이터를 다른 problem에서 쓸 때 재업로드 필요 여부 | 100% 재업로드·재파싱 | 0%(레지스트리에서 선택) |
| 데이터셋 가시성 | "이 온톨로지가 어떤 데이터셋에 근거했는가" 도달률 | 0(개념 없음) | 워크스페이스 내 데이터셋 목록에서 100% 추적 |
| 얇은 커넥터 커버리지 | 지원 소스 타입 | CSV/텍스트 붙여넣기만 | CSV·DB 뷰(읽기전용)·parquet 3종 |
| 매핑 커버리지 | 데이터셋 컬럼 중 온톨로지 클래스/속성에 매핑된 비율 | 개념 없음 | 신규 데이터셋의 70%+ 컬럼이 첫 세션 내 매핑 |
| 프로파일링 성능 | 1만 행 데이터셋 컬럼 프로파일 완료 시간 | — | P95 10초 이내(샘플링 기반) |
| 스키마 드리프트 감지 | 원본 재조회 시 스키마 변경 감지율 | 0(감지 로직 없음) | 100%(체크섬/스키마 diff 배너) |
| 재사용 UX 채택 | 새 problem 생성 시 "기존 데이터셋 선택" vs "새로 업로드" 비율 | N/A(기능 없음) | 출시 후 3개월 내 기존 선택 30%+ |

---

## 3. 기술 스택 (재배치 우선)

| 필요 능력 | 재사용 자산 | 신규/보강 |
|---|---|---|
| CSV 파싱·구조 분석 | `api/llm/parse`(CSV 15,000자 상한, Stage1 엔티티/Stage2 관계) | 파싱 산출물을 그래프 반영 **전에** `datasets`/`dataset_columns` 스냅샷으로 먼저 적재하는 단계 삽입 |
| provenance 기록 | `attributions`(targetTable/targetId 다형성, `sourceType` enum document/sap/user/web/inferred, `sourceRef`) | 스키마 변경 없음 — `sourceRef`에 `datasets.id`(+행 식별자)를 기록하는 컨벤션만 추가. `sourceType='document'`를 데이터셋 유래에도 그대로 사용(CSV/DB뷰/parquet 모두 "정제된 문서형 데이터"로 취급) |
| DB 스키마 컨벤션 | Drizzle `pgTable`(uuid PK `defaultRandom()`, `text`/`jsonb`/`timestamp withTimezone`, `check()` 제약, `unique()`/`index()`) — `partitions`/`classes`/`constraints` 패턴 그대로 | `datasources`/`datasets`/`dataset_columns`/`dataset_column_mappings`/`problem_datasets` 5테이블 신설(§5) |
| 온톨로지 클래스/속성 참조 | 기존 `classes`/`properties` 테이블 | `dataset_column_mappings`가 FK로 참조(신규 테이블 추가 없이 연결만) |
| 텍스트 검증·zod | zod4 스키마 컨벤션(`features/ontology/lib/schemas.ts`) | `datasourceType`/`datasetStatus`/`mappingTargetType` enum을 동일 컨벤션으로 신설 |
| UI 컴포넌트 | shadcn(카드·팝오버·배지 taxonomy), Cytoscape(그래프 캔버스 자체는 불변) | 데이터셋 레지스트리 목록/상세, 컬럼 프로파일 카드, 매핑 테이블 UI(신규 화면) |
| 상태관리 | zustand + zundo | 매핑 UI는 별도 스토어(그래프 undo/redo 스택과 분리 — 매핑은 그래프 편집이 아님) |
| 벡터 검색(선택) | pgvector(기존 임베딩 인프라) | 컬럼명↔클래스/속성명 매핑 후보 제안 시 임베딩 유사도 재사용 가능(자동 확정은 금지, 후보 제시만) |

새 인프라 도입은 최소화한다. DB 뷰 커넥터의 "읽기 전용 접속"만 신규 능력이며, 이는 Postgres `information_schema` 조회 + 파라미터화 쿼리로 충분하다(전용 ETL 엔진 불필요).

---

## 4. 방향 (마일스톤)

### M1 — 데이터셋 레지스트리 데이터모델 · 척추
- `datasources`/`datasets`/`dataset_columns` 3테이블 신설(§5.1). 기존 CSV 업로드 경로를 그대로 통과시키되, 파싱 직전에 **원본을 `datasets` 스냅샷으로 먼저 적재**하도록 파이프라인에 삽입점 추가.
- CSV 업로드 시 `datasources`에 `type='csv'` 레코드를 자동 생성(사용자가 별도로 "연결"을 만들 필요 없음 — 기존 UX 회귀 없음).
- 워크스페이스 스코프(PRD-PF-A 완료 후 `workspace_id` FK 활성화. 그 전까지는 nullable로 두고 단일 테넌트 취급).

### M2 — 얇은 커넥터: DB 뷰 · parquet (읽기 전용)
- `datasources.type='db_view'|'table'`: 접속 정보(host/db/schema/뷰명, 자격증명은 앱 레벨 암호화) 입력 → 읽기 전용 검증(연결 성공 + `information_schema`로 컬럼 목록만 조회, INSERT/UPDATE 권한 요구하지 않음) → 스냅샷을 `datasets`로 승격.
- `datasources.type='parquet'`: 업로드 또는 경로 지정 → 스키마·행수 추출.
- **명시적 아웃(이번 마일스톤에 포함 안 함):** 실시간 스트리밍, 증분 CDC, 양방향 쓰기, SAP/ERP 직접 프로토콜 연동. SAP는 여전히 provenance `sourceType='sap'` 라벨일 뿐 — "정형 추출 테이블/뷰"로 받는 것을 전제하며 SAP 커넥터 자체는 만들지 않는다.

### M3 — 컬럼 프로파일링 & 온톨로지 매핑 UI
- 데이터셋 적재 시 `dataset_columns`에 타입 추론·결측률·유니크수·분포 샘플을 채운다(대용량은 샘플링 — 5만 행 상한으로 캡, 전수 스캔 금지).
- 매핑 화면: 컬럼 목록 ↔ 기존 클래스/속성을 나란히 놓고 드래그 또는 선택으로 연결. 프로파일(타입·결측률·샘플값)을 매핑 판단 근거로 카드에 노출.
- 임베딩 유사도로 매핑 **후보**만 제안(자동 확정 금지 — HITL로 확인 클릭 필수).

### M4 — 재사용 UX & provenance 연결
- 새 problem 생성 흐름(PRD-PF-C 완료 후)에서 "새 데이터 업로드" 옆에 "기존 데이터셋에서 선택" 탭 추가 → `problem_datasets` 연결만으로 재연결 불필요.
- 데이터셋 상세 화면에 "이 데이터셋을 참조하는 problem 목록" 역방향 노출(재사용 가시성).
- 그래프에 반영된 노드/엣지의 `attributions.sourceRef`가 데이터셋 id를 가리키도록 파이프라인 연결 — "이 클래스는 어느 데이터셋 몇 번째 컬럼에서 왔나"까지 역추적 가능하게.

---

## 5. 방법론 (데이터모델 · 리스크)

### 5.1 신규 테이블 스케치

```
datasources
  id                uuid PK default random
  workspace_id      uuid FK -> workspaces.id (nullable until PRD-PF-A)
  type              text NOT NULL   -- check: 'csv' | 'db_view' | 'table' | 'parquet'
  name              text NOT NULL
  connection_config jsonb NOT NULL default '{}'  -- 자격증명은 앱 레벨 암호화 후 저장, DB 평문 금지
  read_only         boolean NOT NULL default true
  last_validated_at timestamp with tz
  created_by        text
  created_at        timestamp with tz NOT NULL default now()
  check: connection_config가 write 권한 요구 시 read_only=false 로의 전환은 별도 승인 플로우(이번 PRD 범위 밖, 기본은 항상 true)

datasets
  id                uuid PK default random
  workspace_id      uuid FK -> workspaces.id (nullable until PRD-PF-A)
  datasource_id     uuid FK -> datasources.id, onDelete: 'set null'
  name              text NOT NULL
  description       text default ''
  status            text NOT NULL default 'ready'  -- check: 'ready' | 'profiling' | 'stale' | 'error'
  row_count         integer
  storage_ref       text   -- 스냅샷 위치(테이블명 또는 스토리지 경로)
  checksum          text   -- 스키마+표본 해시, 드리프트 감지용
  refreshed_at      timestamp with tz
  created_by        text
  created_at        timestamp with tz NOT NULL default now()
  updated_at        timestamp with tz NOT NULL default now()
  unique(workspace_id, name)

dataset_columns
  id                uuid PK default random
  dataset_id        uuid FK -> datasets.id, onDelete: 'cascade'
  name              text NOT NULL
  ordinal_position  integer NOT NULL
  data_type         text NOT NULL  -- check: 'string'|'integer'|'float'|'boolean'|'date'|'datetime'|'enum'|'unknown'
  nullable          boolean NOT NULL default true
  missing_rate      real          -- 0.0~1.0
  distinct_count    integer
  sample_values     jsonb default '[]'
  min_value         text
  max_value         text
  enum_values       jsonb
  profiled_at       timestamp with tz
  unique(dataset_id, name)

dataset_column_mappings
  id                uuid PK default random
  dataset_column_id uuid FK -> dataset_columns.id, onDelete: 'cascade'
  ontology_id       uuid FK -> ontologies.id  -- PRD-PF-A 신설 테이블, 매핑은 데이터셋 단위가 아니라 (데이터셋,온톨로지) 단위로 스코프
  target_type       text NOT NULL  -- check: 'class' | 'property'
  target_class_id   uuid FK -> classes.id
  target_property_id uuid FK -> properties.id
  confidence        real
  source            text NOT NULL default 'user'  -- check: 'user' | 'embedding_suggested'
  created_by        text
  created_at        timestamp with tz NOT NULL default now()
  check: (target_type='class' AND target_class_id IS NOT NULL AND target_property_id IS NULL)
      OR (target_type='property' AND target_property_id IS NOT NULL AND target_class_id IS NULL)

problem_datasets   -- PRD-PF-C의 problems 신설을 전제로 하는 연결 테이블(재사용의 실체)
  id                uuid PK default random
  problem_id        uuid FK -> problems.id, onDelete: 'cascade'
  dataset_id        uuid FK -> datasets.id, onDelete: 'restrict'
  role              text NOT NULL default 'primary'  -- check: 'primary' | 'reference'
  attached_by       text
  attached_at       timestamp with tz NOT NULL default now()
  unique(problem_id, dataset_id)
```

`attributions` 테이블은 스키마 변경이 필요 없다 — `sourceRef` 필드에 `datasets.id`(선택적으로 `#컬럼명` 또는 행 인덱스를 붙여)를 기록하는 컨벤션만 `recordAttribution` 호출부에 추가하면 기존 다형성 provenance 구조(`targetTable`/`targetId`/`sourceType`/`sourceRef`)에 자연스럽게 흡수된다.

### 5.2 리스크 & 완화

- **R1. 정제 데이터 전제의 한계.** 더러운 데이터(결측 과다, 타입 혼재)는 프로파일링이 경고는 하지만 정제하지 않는다. **완화:** 매핑 화면에 결측률·이상치를 카드로 노출하되 "정제는 사용자 책임"임을 UI 문구로 명시(과대약속 금지). AI의 충분성 진단·결측 추천은 PRD-PF-E로 위임.
- **R2. DB 뷰 접근 보안.** 접속 자격증명 저장·읽기전용 강제 우회 가능성. **완화:** `connection_config` 앱 레벨 암호화(평문 DB 저장 금지), 연결 시 `information_schema` 조회 권한만 요구하는 최소권한 원칙 문서화, `read_only` 플래그를 쿼리 실행 전 매번 검증(SELECT 외 구문 차단).
- **R3. 대용량 프로파일링 비용.** 수백만 행 테이블을 전수 스캔하면 비용·지연 폭증. **완화:** 5만 행 샘플링 상한 하드코딩, 프로파일링을 비동기 잡으로 분리(`status='profiling'` 중간 상태), 완료 전까지 매핑 UI는 "프로파일링 중" 배지로 대체.
- **R4. 스키마 드리프트.** DB 뷰의 컬럼이 원본에서 바뀌면 기존 매핑이 깨질 수 있음. **완화:** `checksum` 재계산 시 불일치 감지 → `status='stale'` 전환 + 배너로 재확인 유도(자동 재매핑 금지, HITL 승인 필수). 이 데이터셋을 참조하는 모든 `problem_datasets`에 경고 전파.
- **R5. 스코프 크리프(ETL 유혹).** "이왕이면 변환도 지원하자"는 요구가 반드시 들어온다. **완화:** 본 PRD는 읽기 전용 3종 커넥터만 — 변환·조인·스케줄 트리거는 PRD-PF-I(트리거·준실시간)로 명시적 위임, 이번 문서에 착수하지 않는다.

---

## 6. 수용 기준 (Acceptance Criteria)

- [ ] `datasources`/`datasets`/`dataset_columns`/`dataset_column_mappings`/`problem_datasets` 5테이블이 Drizzle 마이그레이션으로 생성되고 기존 `classes`/`properties`/`attributions`/`ontologies`(PRD-PF-A)/`problems`(PRD-PF-C)와 FK 무결성을 만족한다.
- [ ] CSV 업로드 시 기존 UX(파싱→그래프 반영)가 회귀 없이 동작하면서, 동시에 `datasets` 레코드가 자동 생성된다.
- [ ] DB 뷰 연결이 SELECT 외 구문을 실행하지 못함을 계약 테스트로 검증한다(음성 테스트 통과).
- [ ] 1만 행 CSV 기준 컬럼 프로파일링이 P95 10초 이내 완료된다.
- [ ] 매핑 화면에서 컬럼→클래스/속성 매핑을 저장하면 `dataset_column_mappings`에 `source='user'`로 기록되고, 임베딩 제안은 `source='embedding_suggested'`로 구분된다.
- [ ] 새 problem 생성 시 "기존 데이터셋에서 선택" 경로로 재파싱 없이 `problem_datasets` 연결이 생성된다.
- [ ] 데이터셋 원본이 바뀌었을 때(체크섬 불일치) `status='stale'` 배너가 노출되고, 자동으로 매핑이 재작성되지 않는다.
- [ ] 신규 UI는 shadcn/ui·한국어·기존 배지 taxonomy를 준수하고, lint·빌드·기존 테스트 회귀 0.

---

## 7. 결론

데이터 통합은 팔란티어의 해자이지 우리 승부처가 아니다. 그래서 이 PRD는 "더 많은 커넥터"를 만드는 게 아니라 **"이미 연결한 것을 다시 연결하지 않아도 되게"** 만드는, 훨씬 좁고 방어 가능한 문제만 푼다. `datasets` 레지스트리는 무거운 ETL 엔진이 아니라 우리 기존 파싱 파이프라인과 provenance(`attributions`) 구조 위에 얇게 얹는 캐시·참조 계층이다. 이 경계를 지키는 한, 우리는 "정제된 데이터가 있는 곳"(SAP가 있는 곳보다 훨씬 많다) 어디서든 빠르게 붙을 수 있고, 동시에 데이터 정제·실시간 동기화라는 늪에 빠지지 않는다.

---

## 8. 열린 결정 / 불가 기능

**열린 결정 (Open Decisions)**
- `dataset_column_mappings`를 (데이터셋, 온톨로지) 단위로 스코프할지, (데이터셋, problem) 단위로 더 세분화할지 — 온톨로지 재사용 폭에 따라 PRD-PF-C 확정 후 재검토.
- DB 뷰 자격증명 암호화 방식(앱 레벨 AES vs Supabase Vault) — 인프라팀 결정 대기.
- 데이터셋 스토리지 스냅샷을 Supabase 테이블로 물리화할지, 원본 조회 시점 캐시(TTL 기반)로만 둘지 — 대용량 비용과 정합성 트레이드오프, M1 구현 중 프로토타입으로 검증.
- 프로파일링 5만 행 샘플링 상한이 실제 공정데이터 규모(초대형 설비 이력 등)에 충분한지 — 파일럿 고객 데이터로 재보정 필요.

**불가 기능 (Explicitly Out of Scope)**
- 무거운 ETL(조인·변환·정규화 파이프라인 빌더) — 스코프 아웃.
- 실시간 스트리밍·CDC(Change Data Capture) — PRD-PF-I(트리거·준실시간)에서 별도 다룸, 이번 문서 대상 아님.
- SAP/ERP 직접 프로토콜 연동(OData, RFC 등) — SAP는 "정형 추출 테이블/뷰"로만 받는다는 전제 유지, 직접 커넥터 개발 안 함.
- DB 뷰 쓰기(양방향 동기화) — 읽기 전용만 지원.
- 컬럼→클래스/속성 매핑 완전 자동화 — 항상 사람의 확인 클릭 필수(HITL), 자동 확정 금지.
- 더러운 데이터의 자동 정제(결측 보간, 이상치 제거 등) — 진단·경고까지만, 정제는 사용자 책임.
