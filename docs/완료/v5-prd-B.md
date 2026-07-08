# Ontology Studio — PRD-B: 구획(Named Graph) 분리 + UI/페이지 재구성

> **범위**: 도메인별 구획 분리(논리적 Named Graph) + 추론 격리 + 라우팅/랜딩 페이지 + EmptyState 정리
> **버전**: 1.0
> **작성일**: 2026-06-16
> **대상**: Claude Code (태스크 단위 순차 구현)
> **선행**: Phase 0 완료 + PRD-A(parse 재설계·보강). PRD-A의 연결성 검토·provenance가 본 PRD의 토대.

---

## 배경 & 근거

PRD-A 실측에서 "반도체 장비" 온톨로지에 "업무 플로우(행정)" 같은 이질 도메인이 들어오면 연결 노드가 거의 없어 **억지 연결**이 생김. 또 AI가 RAG로 반도체 지식을 탐색할 때 행정 triple이 섞여 들어가면 **오염(confusing subgraph)**이 발생.

**벤치마킹 결론(확정)**:
- 의미 기반 분리의 표준은 **Named Graph** — triple `(s,p,o)`에 구획 식별자를 더한 quad `(s,p,o,g)` 모델. 노드를 물리적으로 떼지 않고 **구획 라벨**을 붙이는 논리 분리.
- 분산/성능용 샤딩(물리 분리)과는 목적이 다름. 너희는 규모가 아니라 **의미·추론 격리**가 목적 → 논리 분리가 맞음.
- 추론 격리는 검색 정확도에 기여(무관/혼동 서브그래프 배제)가 연구로 뒷받침됨.

**제약**: Aura/Community Edition은 **단일 데이터베이스**(멀티 DB는 Enterprise 전용). 따라서 물리 분리 불가 → **노드 속성/라벨 기반 논리 구획**으로 구현(이게 유연성·전환 자연스러움 면에서도 우월).

## 설계 원칙
- **논리 구획**: 모든 노드/엣지에 `partition_id`. 같은 그래프 안에서 구획으로 격리.
- **구획 내 = 촘촘 / 구획 간 = 느슨한 다리(bridge)**: 도메인이 다르면 억지 계층 대신 명시적 bridge 관계 하나로만 연결.
- **AI가 구획을 나눔**: 입력의 기존 그래프 연결성이 낮으면 "새 구획 분리" 제안(HITL). 사용자가 수동 생성도 가능.
- **추론 격리**: 질의/탐색은 기본적으로 현재 구획 내. 경계를 넘을 땐 bridge 경유 또는 명시적 구획 전환(컨텍스트 리셋).
- **자연스러운 전환**: AI가 반도체 탐색 중 "장비 개조 회의 문서" 필요를 판단하면 업무플로우 구획으로 넘어갈 수 있어야 함(물리 분리면 끊김 → 논리 분리라 가능).

## 공통 규칙
- shadcn/ui·Lucide·Tailwind v4·CSS 변수만. 이모지 금지. 한국어.
- 그래프 변경은 store 액션 경유(pendingChanges/Undo). LLM은 AI SDK.
- 기존 데이터 무손실: 마이그레이션 시 전체를 **기본 구획**에 귀속.

### 권장 순서
`B-1(구획 데이터모델)` → `B-2(라우팅+랜딩)` → `B-3(구획 전환 UI)` → `B-4(EmptyState 정리)` → `B-5(AI 자동 구획)` → `B-6(추론 격리)`

---

# B-1: 구획 데이터 모델 + Neo4j 매핑 (foundation)

### 배경
모든 후속 작업이 `partition_id`에 의존. 가장 먼저.

### 목표
구획 개념을 스키마에 도입하고 Supabase·Neo4j 양쪽에 일관 반영. 기존 데이터는 기본 구획으로 무손실 이전.

### 구현 범위
**In**
1. **`partitions` 테이블**: `id, name, description, color, created_at`.
2. **`partition_id` 추가**: `classes`(필수 FK), `edges`(source/target 구획이 다르면 bridge). `instances`는 소속 class의 구획을 상속(명시 컬럼은 선택).
3. **bridge 식별**: 엣지의 source/target 구획이 다르면 `is_bridge = true`(저장 또는 계산). 구획 간 연결은 bridge로만.
4. **마이그레이션**: 기존 전체 노드를 **기본 구획**(예: 현재 "PSK PEE Domain")에 귀속.
5. **Neo4j 매핑**(cypher-builder 수정): 노드 CREATE 시 `partition` 속성 부여(`CREATE (n:Class {id:$id, partition:$pid, ...})`). bridge 엣지엔 `bridge:true`. (Community 단일 DB라 라벨/속성 방식.)
6. API: 구획 CRUD + 노드 생성 시 현재 구획 귀속.

**Out**: 구획 병합/이동(후속), 멀티 DB.

### 스키마 변경 (Drizzle)
| 대상 | 변경 |
|------|------|
| `partitions` (신규) | id, name, description, color, created_at |
| `classes` | `partition_id` FK NOT NULL (마이그레이션 기본값) |
| `edges` | `is_bridge` boolean default false |
| (Neo4j) cypher-builder | CREATE에 partition 속성, bridge 속성 |

### 파일 변경
| 파일 | 구분 | 내용 |
|------|------|------|
| `lib/drizzle/schema.ts` | 수정 | partitions 테이블 + partition_id + is_bridge |
| `lib/drizzle/migrations/*` | 신규 | 마이그레이션 + 기본 구획 백필 |
| `lib/neo4j/cypher-builder.ts` | 수정 | partition/bridge 속성 반영 |
| `app/api/partitions/route.ts` | 신규 | 구획 CRUD |
| `app/api/classes/route.ts` | 수정 | 생성 시 partition_id |
| `features/ontology/api.ts` | 수정 | `partitionsApi` |

### 수용 기준
- [ ] 마이그레이션 후 기존 노드 전부 기본 구획 귀속(데이터 무손실).
- [ ] 새 구획 생성/조회 동작.
- [ ] 클래스 생성 시 현재 구획에 귀속.
- [ ] push 시 Neo4j 노드에 partition 속성, bridge 엣지에 bridge 속성 반영.
- [ ] 기존 테스트 회귀 없음.

### 테스트 포인트
- [ ] 구획 2개 생성 후 각기 노드 추가 → partition_id 분리 확인.
- [ ] 구획 간 엣지 → is_bridge=true.

---

# B-2: 라우팅 도입 + 랜딩 페이지

### 배경
현재 라우팅 없는 단일 SPA. 랜딩(시딩/템플릿/구획 목록)과 에디터를 분리하려면 라우팅 필요. PRD-A에서 EmptyState의 템플릿/시딩을 랜딩으로 옮기기로 함.

### 목표
앱을 **랜딩(`/`) + 에디터(`/studio` 또는 `/g/[partitionId]`)**로 분리. 랜딩이 시딩·템플릿·구획 진입점.

### 구현 범위
**In**
1. **라우팅**: App Router 경로 분리.
   - `/` = 랜딩: 구획 목록(열기/새로 만들기) + 도메인 템플릿(시딩).
   - `/studio` 또는 `/g/[partitionId]` = 에디터(현 SPA).
2. **랜딩 페이지**: 구획 카드 목록(이름/노드수/색), "새 구획", 도메인 템플릿 카드(PRD-A에서 이전한 `TEMPLATES`/`buildImportPayload` 재사용).
3. 템플릿 선택 → 새 구획 생성 + 시딩 → 에디터로 이동.

**Out**: 인증/멀티테넌시(P3), 협업.

### 파일 변경
| 파일 | 구분 | 내용 |
|------|------|------|
| `app/page.tsx` | 수정 | 랜딩으로 전환(기존 에디터 본문은 이전) |
| `app/studio/page.tsx` 또는 `app/g/[partitionId]/page.tsx` | 신규 | 에디터 셸(현 SPA 이전) |
| `features/.../components/landing/LandingPage.tsx` | 신규 | 구획 목록 + 템플릿 |
| `features/.../components/landing/PartitionCard.tsx` | 신규 | 구획 카드 |
| (이전) `constants/templates.ts` | 유지 | 랜딩에서 재사용(삭제 금지) |

### 수용 기준
- [ ] `/`에서 구획 목록 + 템플릿 표시, 클릭 시 에디터 진입.
- [ ] 템플릿 선택 → 새 구획 시딩 → 에디터에 해당 구획 로드.
- [ ] 기존 에디터 기능이 새 경로에서 정상 동작(회귀 없음).

### 테스트 포인트
- [ ] 새 구획 생성 → 빈 에디터 진입.
- [ ] 템플릿 시딩 → 노드가 그 구획에 들어감.

---

# B-3: 구획 전환 UI + 구획 스코프 캔버스

### 배경
멀티 구획이 생기면 에디터에서 현재 구획을 인지·전환해야 함.

### 목표
에디터 상단에 **구획 전환기**, 캔버스/Explorer는 현재 구획만 표시(전체 보기 옵션).

### 구현 범위
**In**
1. **구획 전환기**(Toolbar 또는 상단): 현재 구획명 + 드롭다운으로 전환 + "새 구획".
2. **스코프 필터**: 캔버스/Explorer가 기본적으로 `partition_id = 현재`만 렌더. "전체 구획 보기" 토글(기본 OFF).
3. bridge 엣지는 다른 구획으로 향하는 경우 **시각적으로 구분**(점선/다른 색) + 클릭 시 대상 구획으로 전환 가능.
4. store에 `currentPartitionId` 상태.

**Out**: 구획 간 드래그 이동(후속).

### 파일 변경
| 파일 | 구분 | 내용 |
|------|------|------|
| `features/.../components/PartitionSwitcher.tsx` | 신규 | 전환 드롭다운 |
| `features/.../components/Toolbar.tsx` | 수정 | 전환기 + 전체보기 토글 |
| `GraphCanvas.tsx`, `ExplorerPanel.tsx` | 수정 | 구획 스코프 필터 |
| `useOntologyStore.ts` | 수정 | `currentPartitionId`, `showAllPartitions` |
| `ClassNode.tsx` 등 | 수정 | bridge 엣지 시각 구분 |

### 수용 기준
- [ ] 전환기로 구획 바꾸면 캔버스/Explorer가 그 구획만 표시.
- [ ] 전체 보기 토글 시 모든 구획 + bridge 표시.
- [ ] bridge 엣지가 시각적으로 구분되고, 클릭 시 대상 구획 전환.

### 테스트 포인트
- [ ] 구획 A↔B 전환 시 노드 셋이 바뀜.
- [ ] bridge 클릭 → 대상 구획으로 이동.

---

# B-4: EmptyState 정리 (중복 제거)

### 배경
PRD-A 논의대로 중앙 입력창은 더블클릭 팝오버와 완전 중복. 템플릿/시딩은 B-2 랜딩으로 이전됨.

### 목표
에디터의 빈 상태를 "더블클릭 안내" 전용으로 축소.

### 구현 범위
**In**
1. 제거: `InlineTextInput`(더블클릭 팝오버와 중복), `CTAButtons`(직접입력/파일/URL), `ExampleCard`, `TemplateSection`(B-2 랜딩으로 이전됨).
2. 남길 것: 더블클릭 유도 안내(아이콘+문구) — 첫 사용자 발견성.
3. `InlineTextInput` 제거 후 캔버스 전체에서 `onDoubleClick` 정상 동작 확인.
4. 미사용 import 정리.

**Out**: 온보딩 투어 개편.

### 파일 변경
| 파일 | 구분 | 내용 |
|------|------|------|
| `EmptyState.tsx` | 수정 | 4개 요소 제거, 더블클릭 안내만 |

### 수용 기준
- [ ] 빈 상태에 더블클릭 안내만 표시(입력창/버튼/예시/템플릿 없음).
- [ ] 빈 영역 더블클릭 → NewNodePopover 정상.
- [ ] build·lint 통과.

---

# B-5: AI 자동 구획 제안 + bridge 연결

### 배경
구획은 AI가 나눠야 함(사용자가 도메인 경계 판단 부담 없게). 입력의 연결성이 낮으면 새 구획 제안.

### 목표
parse(PRD-A의 연결성 검토)에 **구획 판정**을 얹어, 연결성 낮으면 새 구획 분리 제안(HITL), 교차 개념은 bridge로.

### 구현 범위
**In**
1. **연결성 점수**: 추출 엔티티 vs 현재 구획 노드의 매칭/연결 정도 계산(PRD-A A-2 재사용).
2. **구획 판정**:
   - 연결성 충분 → 현재 구획에 귀속.
   - 연결성 ~0 → "이 입력은 다른 도메인으로 보입니다. 새 구획 '○○'(AI가 명명)로 분리할까요?" **HITL 제안**.
   - 일부 교차 개념만 → 새 구획 + **bridge 엣지 제안**(억지 계층 금지).
3. AI가 새 구획 **이름 제안**(도메인 추론, 예: "업무 플로우").
4. 프리뷰(PRD-A A-5)에 구획 배정 + bridge 제안 표시, 사용자 확정.

**Out**: 자동 구획 확정(항상 HITL), 기존 구획 재분할.

### API 계약
- parse 응답 확장 또는 `POST /api/llm/partition/suggest`
  - req: `{ entities, relations, currentPartitionId, partitionsSummary }`
  - res: `{ decision: 'attach'|'new'|'bridge', suggestedPartitionName?, bridges?: [...] , rationale }`

### 파일 변경
| 파일 | 구분 | 내용 |
|------|------|------|
| `app/api/llm/partition/suggest/route.ts` | 신규 | 연결성 기반 구획 판정 |
| `features/ontology/lib/connectivity.ts` | 신규 | 연결성 점수 |
| `NewNodePopover.tsx` / 프리뷰 | 수정 | 구획 배정·bridge 제안 표시 |

### 수용 기준
- [ ] 반도체 구획에 행정 문서 투입 → "새 구획 분리" 제안 + 이름 제안.
- [ ] 일부 교차 개념 → bridge 제안(전체를 한 구획에 욱여넣지 않음).
- [ ] 제안은 항상 HITL, 자동 확정 없음.

### 테스트 포인트
- [ ] 연결성 높은 입력 → attach.
- [ ] 무관 도메인 → new + 이름.

---

# B-6: 추론 격리 (Text2Cypher 구획 스코프)

### 배경
구획의 진짜 가치 = AI 질의 시 무관 구획 triple 오염 방지. RAG 정확도 직결.

### 목표
질의/탐색이 기본적으로 **현재 구획 내에서만** 동작하고, 경계는 의도적으로만 넘는다.

### 구현 범위
**In**
1. **Text2Cypher 스코프**: 생성되는 Cypher에 기본 `WHERE n.partition = $current` 제약 주입. "전체 구획 질의" 토글(기본 OFF).
2. **경계 넘기**: bridge 엣지를 명시적으로 타거나, 사용자가 구획을 전환할 때만 다른 구획 탐색. 전환 시 **이전 구획 컨텍스트 리셋**(triple 섞임 방지).
3. 결과/컨텍스트에 출처 구획 표기.
4. (문서화) myATHENA RAG 통합 시 동일 원칙: 시작 노드 구획에서 탐색 → 경계 넘으면 컨텍스트 전환. 본 PRD는 Studio의 Text2Cypher 계층까지.

**Out**: myATHENA 런타임 RAG 전체(다운스트림), 자동 다중 구획 조인.

### 파일 변경
| 파일 | 구분 | 내용 |
|------|------|------|
| `app/api/llm/text2cypher/route.ts` | 수정 | 구획 스코프 제약 주입 |
| `Text2CypherTab.tsx` | 수정 | 현재 구획 표시 + 전체 질의 토글 |

### 수용 기준
- [ ] 기본 질의가 현재 구획만 대상(다른 구획 노드 결과에 안 섞임).
- [ ] 전체 질의 토글 시에만 교차.
- [ ] 결과에 출처 구획 표시.

### 테스트 포인트
- [ ] 반도체 구획에서 질의 → 행정 노드 결과 미포함.
- [ ] bridge 경유 질의 시 의도적 교차 동작.

---

## PRD-B 완료 정의 (DoD)
- [ ] 구획별로 노드 격리, 기존 데이터 무손실 기본 구획 귀속.
- [ ] 랜딩(`/`)에서 구획·템플릿 진입, 에디터에서 구획 전환.
- [ ] EmptyState 중복 제거(더블클릭 안내만).
- [ ] AI가 연결성 낮은 입력에 새 구획 제안(HITL), 교차는 bridge.
- [ ] Text2Cypher가 구획 스코프로 격리(기본), 전체 질의는 opt-in.
- [ ] push 시 Neo4j에 partition/bridge 반영. `npm run build` 성공, 회귀 없음.

## 비고
- 계층(class hierarchy)과 구획(partition)은 **다른 축**: 계층 = 같은 도메인 내 추상화, 구획 = 도메인 자체 분리. 둘 다 유지.
- 본 PRD의 partition/bridge/provenance는 향후 myATHENA RAG의 "구획 스코프 검색"과 P1 출처 추적의 토대.