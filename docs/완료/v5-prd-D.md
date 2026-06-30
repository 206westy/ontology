# Ontology Studio — PRD: 자연어 추가 + 편집 시점 중복 대조 (AI Apply with Edit-time Dedup)

> **범위**: 자연어 "이런 거 추가해줘" → AI 파싱 → **편집 시점 중복 대조** → store 액션으로 Supabase write → 클라이언트 즉시 렌더 → 컨펌 → 기존 commit→push로 Neo4j 반영
> **버전**: 1.0
> **대상**: Claude Code (태스크 단위 순차 구현)
> **선행**: Phase 0(검증) + PRD-A(parse 2단계·노드 재사용) 토대 위에 올라감. ER 큐(`EntityResolutionSheet`)·`possibleDuplicates`·`mergeEntities` 기존 자산 재사용.
> **비범위**: Neo4j 벡터 검색(= myATHENA RAG 소비 경로, 별도), 자동 병합, text2cypher.

---

## 아키텍처 원칙 (반드시 준수 — 이 PRD의 존재 이유)

1. **Supabase = 최신 source of truth.** 클라이언트가 렌더하는 그래프는 항상 Supabase 상태다. Neo4j를 직접 렌더하지 않는다.
2. **Neo4j = 한 박자 뒤처진 발행본(published snapshot).** 컨펌·푸시 시점에만 갱신된다.
3. **add 단계에서 Neo4j를 읽지 않는다.** 노드 추가·중복 대조는 전부 Supabase 대상. Neo4j를 보면 미푸시 노드를 놓친다(text2cypher에서 겪은 그 한계).
4. **자동 병합 금지.** 확신 높은 동일 개념은 *재사용*, 연관이면 *관계 제안*, 동의어 의심은 *"중복 가능" 플래그 → ER 큐(HITL)*. 사용자 승인 없이 두 노드를 합치지 않는다.
5. **신규 노드만 HITL 확인.** 기존 노드 간 고확신 관계는 프리뷰에서 바로 적용 가능, 신규 노드 생성은 사용자 확정 필수.

### 전체 플로우
```
자연어 "추가해줘"
  → AI 파싱(parse, 2단계)
  → 편집 시점 dedup 대조 (Supabase: pgvector 후보 → LLM 판정)
       · 동일 개념   → 기존 노드 재사용 (신규 생성 안 함)
       · 연관        → 기존 노드로의 관계 제안
       · 동의어 의심 → "중복 가능" 플래그 → ER 큐
  → store 액션으로 Supabase write (pendingChanges 기록)
  → 클라이언트 즉시 렌더 (= 최신 상태)
  → [컨펌] → 기존 commit → cypher-builder → Neo4j 푸시
```

## 공통 규칙
- shadcn/ui · Lucide · Tailwind v4 · CSS 변수만. 하드코딩 색상·이모지 금지. UI 문구 한국어.
- **그래프 변경은 store 액션 경유**(`addClass`/`addInstance`/`addEdge`/`mergeEntities` 등 → `pendingChanges`/Undo 호환). **`/api/batch` 인터랙티브 사용 금지.**
- LLM은 AI SDK(`generateObject`/`generateText`), parse 모델 현행 유지. 멀티스테이지 호출은 작고 focused하게.
- dedup·임베딩 대상은 **Supabase**. Neo4j 접근 코드는 push 경로 외에 추가하지 않는다.

### 권장 순서
`T1(임베딩 파이프라인)` → `T2(dedup 대조 API)` → `T3(AIAssistantTab apply)` → `T4(컨펌→푸시 연결)`

---

# T1: 노드 임베딩 파이프라인 (Supabase, 의미 후보 검색 기반)

### 배경
"노드가 많을 때" 의미적 중복을 찾으려면 스키마 컨텍스트를 통째로 LLM에 넣는 방식이 수천 개에서 깨진다. **pgvector로 후보를 먼저 좁혀야** 한다. 그 전제로 노드 임베딩이 Supabase에 있어야 한다.

### 목표
`classes`/`instances`의 이름+정의를 임베딩해 Supabase에 저장하고, 의미 유사 + 텍스트 유사(오타) 2단 검색 인프라를 만든다.

### 구현 범위
**In**
1. **마이그레이션**: `classes`·`instances`에 `embedding vector(N)` 컬럼 추가, pgvector ivfflat/hnsw 인덱스, 이름에 대한 full-text(또는 trigram) 인덱스.
2. **임베딩 생성**: 노드 insert/update 시 `이름 + 정의`를 임베딩. 동기 부하 피하려면 store write 후 백그라운드(또는 RPC) 처리, 실패 시 재시도 큐.
3. **임베딩 1회 계산 원칙**: 같은 임베딩을 push 시 Neo4j 노드 속성으로 함께 실어 보낼 수 있도록 cypher-builder에서 참조 가능하게 둔다(실제 Neo4j 적재는 본 PRD 비범위, 컬럼만 노출).

**Out**: Neo4j 벡터 인덱스 생성·질의(RAG 경로).

### 파일 변경
| 파일 | 구분 | 내용 |
|------|------|------|
| `supabase/migrations/*_node_embeddings.sql` | 신규 | embedding 컬럼 + pgvector 인덱스 + full-text 인덱스 |
| `features/ontology/lib/embedding.ts` | 신규 | 임베딩 생성/업서트 유틸 |
| `features/ontology/store/*` (write 액션) | 수정 | write 후 임베딩 갱신 트리거(비동기) |

### 수용 기준
- [ ] 노드 추가/수정 시 임베딩이 채워진다(약간의 지연 허용).
- [ ] pgvector cosine top-k 질의가 동작한다.
- [ ] 이름 오타("PM주기" vs "PM 주기")가 full-text/trigram으로 잡힌다.

---

# T2: 편집 시점 중복 대조 API (후보 검색 → LLM 동일성 판정)

### 배경
파싱된 엔티티가 기존 그래프와 겹치는지 **싸게** 판단해야 한다. 전체 그래프를 LLM에 던지지 않고, 후보만 추려 판정한다.

### 목표
입력 엔티티마다 (1) pgvector + full-text로 **후보 N개**를 뽑고, (2) LLM이 `재사용 / 관계제안 / 별개 / 중복가능`을 판정한다. **자동 병합은 하지 않는다.**

### 구현 범위
**In**
1. **후보 검색** `POST /api/dedup/candidates`
   - req: `{ entities: [{ name, type, definition? }] }`
   - 내부: 각 엔티티 임베딩 → pgvector cosine top-k + 이름 full-text → 후보 합집합(중복 제거).
   - res: `{ results: [{ input, candidates: [{ id, name, type, kind, score, matchBy: 'vector'|'text' }] }] }`
2. **동일성 판정** `POST /api/llm/resolve`
   - req: `{ input, candidates }`
   - LLM 프롬프트 제약(핵심):
     - "이름이 비슷해도 **종류가 다르면 동일이 아니다**(예: 부품 `Chuck` vs 파라미터 `Chuck 온도`)."
     - "동일 개념이면 `reuse`(기존 id 지정), 의미 연관이면 `relate`(관계 타입 제안), 같은 뜻인지 애매하면 `possible_duplicate`, 무관하면 `new`."
   - res: `{ decision: 'reuse'|'relate'|'possible_duplicate'|'new', targetId?, relationType?, confidence, reason }`
3. **임계치 가드**: vector score·LLM confidence 임계 미만이면 `new`로 안전 처리(억지 재사용 금지).
4. **ER 연계**: `possible_duplicate`는 기존 `possibleDuplicates`/`ontology:duplicate-check` 이벤트와 `EntityResolutionSheet`로 라우팅(자동 병합 금지).

**Out**: 자동 병합 실행(ER Sheet의 사용자 액션으로만).

### 파일 변경
| 파일 | 구분 | 내용 |
|------|------|------|
| `app/api/dedup/candidates/route.ts` | 신규 | pgvector + full-text 후보 검색 |
| `app/api/llm/resolve/route.ts` | 신규 | LLM 동일성 판정(generateObject) |
| `features/ontology/lib/schema-context-builder.ts` | 재사용/확장 | 후보 컨텍스트 구성(PRD-A 자산) |
| `features/ontology/api.ts` | 수정 | `dedupApi.candidates()`, `llmApi.resolve()` |

### 수용 기준
- [ ] 기존 `Chuck`가 있을 때 새 입력 `Chuck` → `reuse`(신규 생성 안 함).
- [ ] `Chuck` vs `Chuck 온도` → 병합 안 되고 `relate` 또는 `new`로 분리.
- [ ] 동의어 의심("PM 주기" vs "PM 사이클") → `possible_duplicate` → ER 큐로 안내.
- [ ] 노드 수가 많아도 후보 검색이 전체 그래프를 LLM에 싣지 않는다(후보 top-k만).

---

# T3: AIAssistantTab "apply" 구현 (자연어 → dedup 반영 프리뷰 → Supabase write)

### 배경
`AIAssistantTab`은 현재 chat-only. "apply" 액션이 실제 미구현. 이 PRD의 사용자 진입점.

### 목표
자연어 입력 → parse → **T2 dedup 결과를 반영한 프리뷰** → 사용자 확정 → **store 액션으로 Supabase write**. 클라이언트 즉시 렌더.

### 구현 범위
**In**
1. 입력 → `llmApi.parse()`(PRD-A 2단계 결과) → 추출 엔티티/관계.
2. 추출분에 대해 `dedupApi.candidates()` + `llmApi.resolve()` 실행 → 각 항목에 결정 배지 표시:
   - `reuse` → "기존 노드 재사용"(회색, 신규 생성 안 함) — `NewNodePopover`의 `isExisting` 패턴 재사용.
   - `relate` → "기존 노드에 관계 추가"(관계 타입 표시).
   - `possible_duplicate` → "중복 가능" 배지 + ER 큐 이동 버튼.
   - `new` → "신규"(체크 시 생성).
3. **확정 시 store 액션만 사용**: `addClass`/`addInstance`/`addEdge`/`addRelationType`. `reuse`는 생성 스킵, `relate`는 기존 id로 엣지만 추가. **`/api/batch` 금지.**
4. write 후 `focusNode`로 캔버스 포커스, `pendingChanges` 누적이 CommitBar에 반영되는지 확인.

**Out**: 컨펌→푸시(다음 태스크), 자동 병합.

### 파일 변경
| 파일 | 구분 | 내용 |
|------|------|------|
| `features/ontology/components/AIAssistantTab.tsx` | 수정 | chat-only → parse+dedup 프리뷰+apply |
| `features/ontology/components/NewNodePopover.tsx` | 재사용 | `isExisting`/`possibleDuplicates` 표시 패턴 공유 |
| `features/ontology/store/*` | 사용 | 기존 write 액션 경유 |

### 수용 기준
- [ ] "ECOLITE 모델 추가해줘" → 프리뷰에 신규/재사용/관계/중복가능이 배지로 구분 표시.
- [ ] 확정 시 Supabase에 반영되고 캔버스에 즉시 렌더.
- [ ] 모든 변경이 `pendingChanges`에 쌓여 CommitBar에 보인다(직접 API write 아님).
- [ ] `reuse` 항목은 중복 노드를 만들지 않는다.

---

# T4: 컨펌 → 기존 commit→push로 Neo4j 반영 (새 푸시 로직 만들지 말 것)

### 배경
add 흐름의 종착점은 기존 스테이징→프로덕션 경로다. 별도 푸시 경로를 새로 만들면 정합성이 깨진다.

### 목표
T3로 쌓인 `pendingChanges`를 **기존 커밋 UI + `/api/neo4j/push`** 로 그대로 반영. 본 PRD는 연결만.

### 구현 범위
**In**
1. AIAssistantTab apply 이후 CommitBar의 기존 커밋·푸시 플로우로 자연스럽게 이어지는지 점검.
2. push 시 cypher-builder가 신규/재사용/관계를 올바른 Cypher로 변환하는지 확인(재사용은 MERGE/MATCH, 신규는 CREATE).

**Out**: 새 푸시 엔드포인트, Neo4j 벡터 적재.

### 수용 기준
- [ ] AIAssistantTab로 추가 → 커밋 → 푸시 시 Neo4j에 정확히 반영.
- [ ] 재사용 노드가 Neo4j에서 중복 생성되지 않는다(MERGE 기준).
- [ ] add 단계 어디에서도 Neo4j read가 발생하지 않는다(코드 확인).

---

## 비범위 / 다음 단계
- **Neo4j 벡터 검색**: myATHENA RAG 소비 경로(벡터 진입점 → 그래프 확장). 본 PRD에서 다루지 않음.
- **자동 병합**: ER Sheet의 사용자 승인으로만.
- **대량 문서 ingestion 청킹**: P2.

## 전체 수용 시나리오 (스모크)
1. 노드 400+ 상태에서 "이미 있을 법한" 개념을 자연어로 추가 → 프리뷰에서 `reuse`로 잡힘 → 신규 생성 0건.
2. 비슷하지만 다른 종류 개념 → 병합 안 되고 분리 유지.
3. 동의어 의심 → "중복 가능" → ER 큐에서 사람이 병합/별개 결정.
4. 확정 → Supabase 즉시 렌더 → 커밋 → 푸시 → Neo4j 정합.