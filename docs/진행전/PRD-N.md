# Ontology Studio — PRD-N: 구획 지능 & 접지·운영추론

> **범위**: AI 자동 구획 제안(HITL) + 추론 격리(구획 스코프) + 접지(Grounder) + 운영추론(Operator) + 관리(Steward 잔여)
> **버전**: 1.0
> **작성일**: 2026-07-08
> **승계 원천**: `완료/v5-prd-B.md`(B-5·B-6) + `완료/v6-roadmap.md`(Phase 2~4)
> **선행**: PRD-B B-1/B-3(구획 데이터모델·전환 UI), PRD-E(임베딩·dedup), PRD-F(안정식별자·calibration), PRD-H(브릿지·연결성 검증), PRD-L(레이어·트리아지) — 전부 구현 완료 상태에서 출발

---

## 0. 왜 이 PRD인가 — 승계·폐기 대장

원 기획(v5-prd-B 2026-06-16, v6-roadmap 2026-06-25)은 이후 PRD-H/I/K/L이 대량 구현·개편하면서 전제가 달라졌다. 2026-07-08 코드베이스 전수 대조로 **유효한 미개발분만 선별**한 결과가 본 PRD다.

| 원 항목 | 판정 | 근거 |
|---------|------|------|
| B-1 구획 데이터모델 | ✅ 구현됨 | `partitions` 테이블·`partition_id`·`is_bridge`·cypher-builder partition 속성·`/api/partitions` |
| B-3 구획 전환 UI | ✅ 구현됨 | `PartitionSwitcher.tsx`·store `currentPartitionId`/`showAllPartitions`·캔버스 스코프 필터 |
| B-2 랜딩+라우팅 | 🗑 폐기 | PRD-H(패턴으로 시작 게이트)·PRD-I(GuidedJourney 상시)·PRD-K(입력 여정 개편)가 에디터 내 진입 경험을 완성해 별도 랜딩의 전제 소멸. 잔존 가치(템플릿 시딩→새 구획 귀속)만 M1에 흡수 |
| B-4 EmptyState 정리 | 🗑 폐기 | 제거 대상 4개 컴포넌트(InlineTextInput·CTAButtons·ExampleCard·TemplateSection)는 이미 존재하지 않음. 현 EmptyState는 PRD-H/K가 의도 설계 |
| B-5 AI 자동 구획 제안 | 📋 **M1 승계** | `/api/llm/partition/suggest` 부재. 단 연결성 점수·브릿지 제안은 기구현 자산 재사용 |
| B-6 추론 격리 | 📋 **M2 승계** | `text2cypher`·`rag/entrypoint` 모두 구획 스코프 없음(코드 확인) |
| v6 P1 Critic | ✅ 사실상 완료 | Critic 엔진 8종 룰(`lib/critic/review.ts`·`rules.ts`)+confirm 트리아지(PRD-L M5)+HealthScoreBadge Toolbar 상시+재사용 강제(용어해소·relation_glossary·dedup)+calibration/골든셋(PRD-F). Phase 1 완료 정의 4항목 전부 후속 PRD가 흡수 |
| v6 P2 Grounder | 📋 **M3 승계** | 개념↔실데이터 바인딩 없음(최대 격차) |
| v6 P3 Operator | 📋 **M4 승계** | `rag/entrypoint`=벡터 top-k 스캐폴드뿐. 가드레일 질의·근거경로·진단형 RAG 없음 |
| v6 P4 Steward | 🟡 **M5 잔여만** | 드리프트(PRD-H)·커밋/브랜치(PRD-J)·거버넌스(PRD-E) 기구현. 계보 리포트·버전 정책만 잔여 |

**북극성(v6 계승)**: 스케치북 → 운영 온톨로지. 구획이 추론을 격리하고, 개념이 실데이터에 접지되고, AI가 그 위에서 근거 있는 답을 내는 상태.

## 공통 규칙

- shadcn/ui·Lucide·Tailwind·CSS 변수만. 이모지 금지. 한국어 UI.
- 그래프 변경은 store 액션 경유(pendingChanges/Undo). LLM은 AI SDK.
- **AI 제안은 항상 HITL** — 자동 확정 없음(구획 분리·바인딩·행동 제안 전부).
- 기존 테스트 회귀 0. 각 마일스톤 lint·build 그린.

### 권장 순서

`M1(자동 구획)` → `M2(추론 격리)` → `M3(접지)` → `M4(운영추론)` → `M5(관리 잔여, 후순위)`

> M1·M2는 독립적이라 순서 교환 가능. M4는 M2(스코프)+M3(바인딩) 위에서 가치가 완성되므로 뒤에.

---

# M1: AI 자동 구획 제안 + bridge 연결 (B-5 승계)

### 배경

구획은 AI가 나눠야 한다(사용자가 도메인 경계 판단 부담 없게). 반도체 구획에 행정 문서가 들어오면 억지 연결 대신 "새 구획 분리"를 제안해야 한다. 원안(B-5) 대비 **기구현 자산이 늘어** 신규 구현 범위가 줄었다:

| 원안의 신규 구현 | 현재 상태 |
|------------------|-----------|
| 연결성 점수 (`connectivity.ts` 신규) | ✅ `features/ontology/lib/validate/connectivity.ts` — `analyzeConnectivity()` 기구현(PRD-H) |
| bridge 제안 UI | ✅ `components/bridge/BridgeSuggestCard.tsx` + `lib/bridge/cross-partition.ts` 기구현(PRD-H) |
| 구획 판정 API·프리뷰 표시 | 🔴 미구현 — 본 마일스톤의 실제 범위 |

### 목표

parse 파이프라인에 **구획 판정**을 얹어, 추출분과 현재 구획의 연결성이 낮으면 새 구획 분리를 제안(HITL)하고, 교차 개념은 bridge로 잇는다.

### 구현 범위

**In**

1. **구획 판정 API**: `POST /api/llm/partition/suggest`
   - req: `{ entities, relations, currentPartitionId, partitionsSummary }`
   - res: `{ decision: 'attach' | 'new' | 'bridge', suggestedPartitionName?, bridges?: BridgeSuggestion[], rationale }`
   - 1차 판정은 결정론(연결성 점수 임계) — `analyzeConnectivity()` 재사용. LLM은 새 구획 **이름 제안**과 정성 근거에만 사용(비용 절제, v6 리스크 대응 계승).
2. **판정 분기**:
   - 연결성 충분 → `attach`(현재 구획 귀속, 제안 UI 생략 — 무소음).
   - 연결성 ~0 → `new`: "이 입력은 다른 도메인으로 보입니다. 새 구획 '○○'로 분리할까요?" HITL 카드.
   - 일부 교차 개념만 → `bridge`: 새 구획 + bridge 엣지 제안(`BridgeSuggestCard` 재사용, 억지 계층 금지).
3. **프리뷰 통합**: 파싱 미리보기(트리아지 밴드 상단)에 구획 배정·bridge 제안 표시, 사용자 확정 시 `partition_id` 반영. 확정 카드는 PRD-I 공통 `<ConfirmCard>` 문법.
4. **템플릿 시딩 구획 귀속**(B-2 잔존 가치): EmptyState 템플릿 선택 시 "새 구획으로 시딩" 옵션(기본 on) — 템플릿 이름으로 구획 생성 후 귀속.

**Out**: 자동 구획 확정(항상 HITL), 기존 구획 재분할, 랜딩 페이지(폐기 확정).

### 파일 변경

| 파일 | 구분 | 내용 |
|------|------|------|
| `app/api/llm/partition/suggest/route.ts` | 신규 | 연결성 기반 구획 판정(결정론 우선+LLM 명명) |
| `features/ontology/lib/validate/connectivity.ts` | 재사용 | `analyzeConnectivity()` — 필요 시 "기존 구획 대비" 입력 형태만 어댑터 |
| `features/ontology/components/bridge/BridgeSuggestCard.tsx` | 재사용 | bridge 제안 렌더 |
| 파싱 프리뷰(트리아지 표면) | 수정 | 구획 배정 밴드 + 확정 액션 |
| `EmptyState.tsx` | 수정 | 템플릿 시딩 → 새 구획 옵션 |
| `features/ontology/api.ts` | 수정 | `partitionSuggestApi` |

### 수용 기준

- [ ] 반도체 구획에 행정 문서 투입 → "새 구획 분리" 제안 + AI 이름 제안.
- [ ] 일부 교차 개념 → bridge 제안(전체를 한 구획에 욱여넣지 않음).
- [ ] 연결성 높은 입력 → 무소음 attach(제안 카드 없음).
- [ ] 제안은 항상 HITL, 자동 확정 없음.
- [ ] 템플릿 시딩이 새 구획에 귀속(옵션 off 시 현재 구획).

---

# M2: 추론 격리 — 구획 스코프 질의 (B-6 승계)

### 배경

구획의 진짜 가치 = AI 질의 시 무관 구획 triple 오염 방지. 현재 `text2cypher`와 `rag/entrypoint` 모두 구획을 모른다(2026-07-08 코드 확인: partition 참조 0건).

### 목표

질의/탐색이 기본적으로 **현재 구획 내에서만** 동작하고, 경계는 의도적으로만 넘는다.

### 구현 범위

**In**

1. **Text2Cypher 스코프**: `app/api/llm/text2cypher/route.ts`가 `currentPartitionId`를 받아 생성 Cypher에 `WHERE n.partition = $partition` 기본 주입. "전체 구획 질의" 토글(기본 OFF) 시에만 무스코프.
2. **RAG entrypoint 스코프**: `app/api/rag/entrypoint/route.ts` 벡터 검색에 partition 필터(후보 top-k 조회 후 partition 필터 또는 인덱스 조건) + `partitionId` 파라미터.
3. **경계 넘기**: bridge 엣지를 명시적으로 타거나 구획 전환 시에만 교차. 전환 시 질의 컨텍스트 리셋(triple 섞임 방지).
4. **출처 구획 표기**: `Text2CypherTab.tsx` 결과에 현재 구획 배지 + 행별 출처 구획(전체 질의 모드).

**Out**: myATHENA 런타임 RAG 전체(다운스트림), 자동 다중 구획 조인.

### 파일 변경

| 파일 | 구분 | 내용 |
|------|------|------|
| `app/api/llm/text2cypher/route.ts` | 수정 | 구획 스코프 제약 주입 + 전체 질의 opt-in |
| `app/api/rag/entrypoint/route.ts` | 수정 | partition 필터 파라미터 |
| `features/ontology/components/Text2CypherTab.tsx` | 수정 | 현재 구획 표시 + 전체 질의 토글 + 출처 구획 |

### 수용 기준

- [ ] 기본 질의가 현재 구획만 대상(다른 구획 노드가 결과에 안 섞임).
- [ ] 전체 질의 토글 시에만 교차, 결과에 출처 구획 표시.
- [ ] RAG 진입 노드가 구획 스코프를 따름.
- [ ] 기존 text2cypher 테스트 회귀 0(스코프 미지정 시 기존 동작 보존).

---

# M3: Grounder — 개념↔실데이터 접지 (v6 P2 승계)

### 배경

팔란티어 대비 최대 격차. 현재 클래스는 "그려진 개념"이고, 인스턴스가 있어도 **얼마나 실데이터에 묶였는지(바인딩률)·그 데이터가 현재적인지(신선도)**가 보이지 않는다. 접지 없는 모델 위 운영추론(M4)은 모래성.

**범위 한정(리스크 대응)**: "실데이터"는 **현 자산 기준** — `instances`/`instance-values` + CSV/import 파이프라인(graph-ux-rebrand의 CSV LLM 분석 포함). 외부 시스템(ERP·센서 등) 커넥터는 Out.

### 목표

모든 클래스에 대해 "이 개념은 실데이터가 뒷받침하는가"를 측정·가시화하고, 미접지 개념의 데이터 연결을 유도한다.

### 구현 범위

**In**

1. **바인딩률 산출**: 클래스별 `인스턴스 수·속성 채움률(instance-values 커버리지)` 집계 → 모델 전체 "데이터 바인딩률" 산출(결정론, LLM 불필요).
2. **헬스 통합**: `HealthScoreBadge`/`HealthDashboardSheet`에 바인딩률 축 추가(v6 지표표의 "데이터 바인딩률 ↑"). 입력 전후 델타 표시(기존 헬스 델타 문법 재사용).
3. **미접지 표면화**: 캔버스/탐색기에서 인스턴스 0개 클래스에 저채도 "미접지" 배지(PRD-K 스케일 규칙 준수) + 클릭 시 CSV 임포트/인스턴스 추가 진입점.
4. **신선도(현재성)**: 인스턴스 `updated_at` 기반 구획별 최신성 요약("이 구획의 데이터는 N일 전 갱신"). 임계 초과 시 헬스에 경고.
5. **CSV 재바인딩**: CSV 재업로드 시 기존 인스턴스와 안정식별자(PRD-F UUIDv5) 매칭 → 신규/갱신/소실 diff 프리뷰(HITL 확정).

**Out**: 외부 시스템 커넥터, 실시간 동기화, write-back.

### 파일 변경

| 파일 | 구분 | 내용 |
|------|------|------|
| `features/ontology/lib/metrics/grounding.ts` | 신규 | 바인딩률·신선도 산출(순수 함수) |
| `features/ontology/components/HealthDashboardSheet.tsx` 등 | 수정 | 접지 축 추가 |
| 캔버스/탐색기 배지 표면 | 수정 | 미접지 배지 + 진입점 |
| CSV import 파이프라인 | 수정 | 재바인딩 diff 프리뷰 |

### 수용 기준

- [ ] 모델 헬스에 데이터 바인딩률이 상시 표시되고 입력 전후 델타가 보인다.
- [ ] 인스턴스 0개 클래스가 시각적으로 구분되고 데이터 연결 진입점이 있다.
- [ ] CSV 재업로드가 기존 인스턴스를 중복 생성하지 않고 diff로 흡수된다(HITL).
- [ ] 신선도 임계 초과 구획에 경고가 뜬다.

---

# M4: Operator — 가드레일 질의 + 근거경로 (v6 P3 승계)

### 배경

접지된 모델 위에서만 "돈 되는 의사결정"이 가능하다. 현재 RAG entrypoint는 벡터 top-k 진입 노드 반환뿐 — 근거경로도, 가드레일도, 진단형 응답도 없다.

### 목표

AI 질의가 **온톨로지를 통해서만**(구획 스코프+제약+bridge) 탐색하고, 모든 결론에 **추적 가능한 근거경로**를 붙인다.

### 구현 범위

**In**

1. **진단형 RAG 파이프라인**: `rag/entrypoint`(진입 노드) → 구획 스코프 그래프 탐색(M2 재사용, bridge 경유 시 명시) → 경로·속성·provenance 수집 → LLM 종합 답변.
2. **근거경로 첨부**: 응답에 `{ answer, paths: [{nodes, edges, partition}], sources: provenance[] }` — 결론마다 그래프 경로와 출처(source_type·근거 텍스트)를 구조화 반환.
3. **가드레일**: 탐색은 constraints(enforced 규칙)·구획 경계·bridge만 통과. 스키마 밖 추측은 "모델에 근거 없음"으로 명시 분리(환각 억제).
4. **UI**: AIAssistantTab(또는 전용 질의 표면)에 답변+근거경로 렌더 — 경로 클릭 시 캔버스 하이라이트(`highlightNodes` 재사용).

**Out**: 행동 실행(write-back Action), 물리모델 합류(정량 axiom/시뮬레이터 — v6 원문의 미정 사항 유지), 자동 다중 구획 조인.

### 파일 변경

| 파일 | 구분 | 내용 |
|------|------|------|
| `app/api/rag/answer/route.ts` | 신규 | 진단형 RAG(진입→탐색→근거경로→종합) |
| `features/ontology/lib/rag/traverse.ts` | 신규 | 구획 스코프 그래프 탐색(순수 로직 분리) |
| AI 질의 표면 | 수정 | 근거경로 렌더 + 캔버스 하이라이트 연동 |

### 수용 기준

- [ ] 질의 응답의 모든 결론에 추적 가능한 그래프 경로+출처가 붙는다(근거경로 제공률 측정 가능).
- [ ] 탐색이 구획·제약·bridge 가드레일을 벗어나지 않는다.
- [ ] 모델에 근거 없는 내용은 명시적으로 분리 표기된다.
- [ ] 경로 클릭 → 캔버스 하이라이트.

---

# M5: Steward 잔여 — 계보·버전 정책 (후순위)

### 배경

v6 P4의 대부분(드리프트 감지=PRD-H, 커밋/브랜치=PRD-J, 거버넌스=PRD-E, 어휘집=PRD-L)은 기구현. 잔여는 얇다.

### 구현 범위 (M1~M4 검증 후 착수, 방향 수준)

1. **계보 리포트**: 노드/관계 단위 "어디서 왔나"(커밋 체인+provenance+패턴 출처) 통합 뷰 — 기존 근거(Evidence) 탭(PRD-I M5) 확장.
2. **버전 정책**: 발행(push) 시점 스냅샷에 시맨틱 버전 태그 + 구획별 변경 요약.

### 수용 기준

- [ ] 임의 노드에서 생성 이력(커밋·출처·패턴)을 한 화면에서 추적.
- [ ] 발행 이력이 버전 태그로 구분되고 구획별 변경 요약을 가진다.

---

## 성능 지표 (v6 지표표 계승, 본 PRD 해당분)

| 축 | 지표 | 마일스톤 | 방향 |
|----|------|----------|------|
| 격리 | 교차 구획 오염률(스코프 질의 결과 내 타 구획 비율) | M2 | 0 |
| 접지 | 데이터 바인딩률(실데이터 묶인 노드 비율) | M3 | ↑ |
| 접지 | 인스턴스 신선도(임계 내 비율) | M3 | ↑ |
| 운영 | 근거경로 제공률(결론에 경로 붙은 비율) | M4 | ↑ |
| 운영 | 진단 정확도(과거 케이스 대비) | M4 | ↑ |

## 리스크

| 리스크 | 심각도 | 대응 |
|--------|--------|------|
| 구획 제안 오탐(과잉 분리 제안)으로 피로 | High | 결정론 임계 우선·attach는 무소음·제안만(HITL)·임계 튜닝 가능 |
| M3/M4 범위 비대화 | Med | M3=현 자산(instances/CSV) 한정, M4=읽기 전용(행동 실행 Out). 착수 시 플랜에서 상세 분해 |
| 구획 스코프 주입이 기존 Text2Cypher 회귀 유발 | Low | 스코프 미지정 시 기존 동작 보존 + 기존 테스트 유지 |
| RAG 탐색 비용(LLM 호출 증가) | Med | 탐색은 결정론(Cypher), LLM은 최종 종합 1회 원칙 |

## PRD-N 완료 정의 (DoD)

- [ ] 이질 도메인 입력 → 새 구획 제안(HITL)·교차는 bridge. 템플릿 시딩 구획 귀속.
- [ ] 질의/RAG가 구획 스코프 기본, 전체 질의는 opt-in, 출처 구획 표기.
- [ ] 데이터 바인딩률·신선도가 헬스에 상시 노출되고 미접지 개념에 연결 진입점.
- [ ] 질의 응답에 추적 가능한 근거경로+출처 첨부, 가드레일 준수.
- [ ] (M5) 계보 통합 뷰 + 발행 버전 태그.
- [ ] `npm run build`·lint·기존 테스트 회귀 0.

## 비고

- 계층(class hierarchy)·구획(partition)·레이어(semantic/kinetic, PRD-L)는 각기 다른 축 — 셋 다 유지.
- 본 PRD의 구획 스코프 검색·근거경로는 향후 myATHENA RAG 통합의 계약 토대(v5-prd-B·v6 원문의 방향 계승).
- PRD-M(Docker Neo4j 복귀·발행 고속화)과 독립 — 단 M2·M4의 Neo4j 질의는 PRD-M M0(Docker 복귀) 완료 환경 기준.
