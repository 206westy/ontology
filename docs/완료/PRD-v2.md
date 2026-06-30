# Ontology Studio — PRD v2

> **Version**: 2.0
> **Author**: Planner (MVP Dev Team)
> **Date**: 2026-03-22
> **Status**: Phase 1 구현 완료, Phase 2 착수
> **Tech Stack**: Next.js 15.1 (App Router) + React 19 + TypeScript 5 + Tailwind CSS 3.4 + shadcn/ui + React Flow 12 + ELKjs + Zustand + Supabase + Neo4j + Claude API

---

## 1. 제품 비전

### 1.1 한 줄 요약

도메인 전문가가 코드/쿼리 없이, 자기 업무 지식만으로 온톨로지(지식 그래프)를 구축할 수 있는 **그래프 편집 스튜디오**.

### 1.2 왜 이 제품인가

많은 기업이 GraphRAG나 지식 그래프를 도입하고 싶어 하지만, Neo4j 세팅과 Cypher 쿼리의 높은 진입장벽 때문에 포기한다. Ontology Studio는 이 장벽을 완전히 제거한다.

### 1.3 아키텍처 컨셉 — "온톨로지의 Git"

```
┌─────────────────────────────────────────┐
│  Layer 1: 온톨로지 스튜디오 (Frontend)    │
│  사용자 조작 + LLM 보조                   │
│  Next.js + React Flow + shadcn/ui        │
└──────────────┬──────────────────────────┘
               │ 자동 저장 (debounced 2초)
               ▼
┌─────────────────────────────────────────┐
│  Layer 2: 스테이징 (Supabase)            │
│  온톨로지 CRUD + 커밋 로그 + 롤백 포인트   │
│  Working Directory 역할                  │
└──────────────┬──────────────────────────┘
               │ 수동 커밋 → 확정분만 푸시
               ▼
┌─────────────────────────────────────────┐
│  Layer 3: 프로덕션 (Neo4j)               │
│  확정된 온톨로지 그래프                    │
│  벡터 인덱스 + Cypher 탐색               │
│  GraphRAG 런타임 참조 대상               │
└─────────────────────────────────────────┘
```

**저장 모델 (Git 비유)**:
- **편집** → 자동 저장(debounced 2초) → Supabase (= working directory)
- **커밋** → 수동 커밋 버튼 → commits 테이블에 스냅샷 (= git commit)
- **푸시** → Neo4j 푸시 버튼 → 프로덕션 그래프 반영 (= git push)

---

## 2. 핵심 가치 제안

| # | 가치 | 설명 |
|---|------|------|
| V1 | **제로 코딩** | 사용자는 "클래스", "인스턴스", "공리"라는 용어를 몰라도 됨 |
| V2 | **LLM 자동 구조화** | 자유 형식 텍스트/CSV를 쏟아부으면 LLM이 온톨로지로 변환 |
| V3 | **HITL 교정** | AI 결과를 사용자가 프리뷰에서 수정/확정 — 최종 결정권은 인간 |
| V4 | **시각적 편집** | 드래그&드롭으로 관계 연결, 계층 이동 — 생각의 흐름대로 모델링 |
| V5 | **안전한 배포** | Git 방식 스테이징/커밋/푸시로 실수 방지 + 롤백 가능 |
| V6 | **Neo4j 은닉** | 사용자는 Neo4j/Cypher를 1%도 몰라도 지식 그래프 DB를 소유 |

---

## 3. 사용자 페르소나

### Primary: 도메인 전문가 (1인 사용)

| 항목 | 설명 |
|------|------|
| 이름 | Aiden (PSK PEE Team) |
| 역할 | 반도체 제조 공정 엔지니어 |
| 기술 수준 | Excel/PowerPoint 능숙, 코딩/DB 경험 없음 |
| 목표 | 장비/공정/인력 지식을 체계화하여 팀 내 공유 + GraphRAG 연동 |
| 불만 | "Neo4j가 좋다는데, Cypher 배울 시간이 없다" |
| 기대 | "내가 아는 것을 말하면 그래프가 만들어지면 좋겠다" |

**MVP 범위**: 1인 사용. 병렬 처리, 권한 관리, 충돌 해소는 범위 밖.

---

## 4. 사용자 여정

### Journey 1: 최초 온톨로지 생성 (Knowledge Dump)

1. 사용자가 캔버스 빈 공간을 **더블클릭**
2. 마우스 위치 근처에 **팝오버** 등장
3. 자유 형식으로 입력 (이름 하나, 장비 목록 텍스트, CSV 붙여넣기, 파일 첨부 — 형식 제한 없음)
4. [생성] 클릭 → LLM이 입력을 분석하여 클래스/프로퍼티/인스턴스/관계를 자동 추출
5. 팝오버가 **프리뷰 모드**로 전환: "이렇게 구조화했습니다" + 항목별 미리보기
6. 사용자가 프리뷰에서 수정 가능 (이름 변경, 불필요 항목 삭제)
7. [확정] 클릭 → 캔버스에 노드/엣지가 생성됨
8. 하단 커밋 바에 변경사항 누적

### Journey 2: 기존 노드 편집

1. 캔버스 또는 Explorer에서 노드 **클릭**
2. 우측 패널에 해당 노드 상세 정보 표시
3. 패널 내에서 직접 편집 ([+] 버튼, 인라인 수정) 또는 AI 보조 입력창에 자연어 입력
4. 변경사항이 즉시 반영되고 커밋 바에 누적

### Journey 3: 관계 연결

1. 캔버스에서 노드 A → 노드 B로 **드래그**
2. 드래그 중 임시 점선이 마우스를 따라감
3. 노드 B 위에서 놓으면 **관계 설정 팝오버** 등장 (마우스 위치 근처)
4. 기존 관계 팔레트에서 선택 또는 새 관계 이름 입력
5. [연결] 클릭 → 엣지 생성

### Journey 4: 계층 이동 (is-a)

1. 캔버스에서 노드를 다른 노드 **위에 드롭**
2. "하위 클래스로 설정할까요?" 확인 팝오버 (순환 참조 자동 방지)
3. [확정] → is-a 관계 자동 생성, Explorer 트리 업데이트

### Journey 5: Neo4j 푸시

1. 하단 커밋 바에서 [커밋] 클릭 → 변경 이력 스냅샷 생성
2. [Neo4j 푸시] 클릭 → 확인 시트 등장 (변경 요약 + Cypher 미리보기)
3. [푸시 실행] → 진행률 표시 → Cypher 자동 생성 + 트랜잭션 실행
4. 성공 시 토스트 알림, 실패 시 에러 상세 + 롤백

### Journey 6: 점진적 확장

1. 다음 방문 시 기존 그래프가 로드됨
2. 새 데이터를 더블클릭으로 추가 → LLM이 기존 온톨로지 컨텍스트를 참조하여 구조화
3. "기존에 정의된 관계/클래스가 있으면 재사용" → 중복 방지

### Journey 7: 온보딩 (신규)

1. 첫 진입 시 빈 캔버스에 Empty State 안내 표시
2. "캔버스를 더블클릭하여 첫 노드를 만들어 보세요" + "예시 불러오기" 버튼
3. "예시 불러오기" 클릭 시 반도체 장비 온톨로지 샘플 데이터 로딩
4. 노드가 1개라도 생성되면 안내 사라짐

### Journey 8: AI 보조 편집 (Phase 2)

1. 우측 패널 하단 AI 입력창에 자연어 명령 입력 ("ECOLITE 모델도 추가해줘")
2. LLM이 현재 노드 컨텍스트를 참조하여 변경 제안 생성
3. 관련 섹션에 제안 항목이 인라인으로 표시 (배경색 구분)
4. 사용자가 [확정] 또는 [삭제]

---

## 5. 기능 명세

### 5.1 Phase 1 (MVP) — 구현 완료

> 현재 코드베이스에 이미 구현된 기능들. 안정화/버그 수정 위주.

| # | 기능 | 설명 | 구현 위치 |
|---|------|------|----------|
| F1-1 | LLM 자유 입력 구조화 | 텍스트/CSV → 클래스/프로퍼티/인스턴스/관계 JSON | `api/llm/parse/route.ts` |
| F1-2 | HITL 프리뷰 | Phase 1(입력) → Phase 2(프리뷰) → 확정 플로우 | `NewNodePopover.tsx` |
| F1-3 | 컨텍스트 참조 (기본) | LLM API에 기존 클래스/관계 전달하여 중복 방지 | LLM parse API params |
| F1-4 | D&D 관계 연결 | 노드→노드 드래그 → 관계 설정 팝오버 | `GraphCanvas.tsx`, `RelationPopover.tsx` |
| F1-5 | D&D 계층 이동 | 노드를 다른 노드 위에 드롭 → is-a 확인 팝오버 | `HierarchyPopover.tsx` |
| F1-6 | 스키마/데이터 분리 | 클래스(●)/인스턴스(○) 시각 구분 + 스코프 규칙 | `ExplorerPanel`, `ClassNode`/`InstanceNode` |
| F1-7 | Git 방식 커밋 | 변경사항 추적(ADD/MOD/DEL) + diff 뷰 + 커밋 API | `CommitBar.tsx`, `useOntologyStore` |
| F1-8 | Undo/Redo | zundo temporal 기반 50단계 되돌리기 | `useOntologyStore` (temporal middleware) |
| F1-9 | Optimistic UI | React Query + Zustand 연동, 서버 응답 전 UI 선반영 | `useApiSync.ts` |
| F1-10 | Explorer 트리 | 계층 트리 + 검색 필터 + 캔버스 동기화 | `ExplorerPanel.tsx` |
| F1-11 | Right Panel | 6개 섹션(Description, Subclasses, Properties, Relations, Constraints, Instances) | `RightPanel.tsx` |
| F1-12 | 노드 삭제 | Delete 키/우클릭 → cascade 경고 확인 → 삭제 | `DeleteConfirmDialog.tsx` |
| F1-13 | 키보드 단축키 | Ctrl+Z/Y, Delete, Escape | `useKeyboardShortcuts.ts` |
| F1-14 | 자동 레이아웃 | ELKjs layered 알고리즘 | `elk-layout.ts` |
| F1-15 | Supabase CRUD API | 10개 테이블 전체 REST API | `app/api/` routes |

### 5.2 Phase 2 — 다음 스프린트

> MVP의 핵심 빈 구멍 채우기 + 사용성 고도화

| # | 기능 | 설명 | 우선순위 |
|---|------|------|---------|
| F2-1 | **Neo4j 연결 + Cypher 자동 생성** | 커밋 → Cypher 변환 → Neo4j 트랜잭션 실행. "온톨로지의 Git" Layer 3 완성 | 긴급 |
| F2-2 | **Neo4j 푸시 확인 UI** | 변경 요약 + Cypher 미리보기 시트 + 진행률 + 성공/실패 처리 | 긴급 |
| F2-3 | **Neo4j 롤백** | before_snapshot 기반 상태 복원 + Cypher 역변환 | 높음 |
| F2-4 | **빈 캔버스 Empty State** | 온보딩 안내 + "예시 불러오기" 버튼 | 높음 |
| F2-5 | **검색 → 캔버스 포커스** | Explorer 검색 결과 클릭 시 해당 노드로 줌/패닝 | 높음 |
| F2-6 | **MiniMap** | React Flow MiniMap 컴포넌트 활성화 | 중간 |
| F2-7 | **로딩 스켈레톤** | Explorer/Canvas/RightPanel 영역별 Skeleton UI | 중간 |
| F2-8 | **sonner 토스트 교체** | 기존 radix-ui toast → sonner 선언적 API | 중간 |
| F2-9 | **에러 처리 전략** | Supabase 연결 실패, LLM API 실패, Neo4j 푸시 실패 별 처리 | 높음 |
| F2-10 | **다크모드 완전 지원** | CSS 변수 기반 다크모드 컬러 세트 + 노드 색상 대응 | 중간 |
| F2-11 | **대량 임포트 진행률** | LLM 구조화 중 단계별 진행률 표시 + 취소 기능 | 중간 |
| F2-12 | **Level of Detail** | 줌 레벨별 노드 간소화 (100%+: 전체, 50~100%: 이름만, 50%-: dot) | 중간 |

### 5.3 Phase 3 — 로드맵

> 확장 기능. 실사용 피드백 기반으로 우선순위 조정.

| # | 기능 | 설명 |
|---|------|------|
| F3-1 | **Chat-to-Edit AI 어시스턴트** | RightPanel 하단 AI 입력창에 LLM 실제 연동. 자연어 → 변경 제안 |
| F3-2 | **Axiom 자동 번역** | 자연어 제약조건 → 구조화된 rule_logic JSON 자동 변환 |
| F3-3 | **파일 첨부 파싱 강화** | CSV, PDF 매뉴얼 직접 업로드 → LLM 구조화 |
| F3-4 | **컨텍스트 유지 고도화** | Semantic similarity 기반 중복 노드 탐지 |
| F3-5 | **GraphRAG 벡터 인덱싱** | Neo4j 벡터 인덱스 자동 생성 (노드 임베딩) |
| F3-6 | **온톨로지 Export** | OWL/RDF/JSON-LD 표준 포맷 내보내기 |
| F3-7 | **온톨로지 템플릿** | 도메인별 프리셋 (반도체, 제조, 의료 등) |
| F3-8 | **키보드 단축키 확장** | Ctrl+F 검색, / AI 포커스, Space 패널 토글 |
| F3-9 | **Explorer 가상 스크롤** | 노드 100개+ 시 @tanstack/react-virtual 적용 |
| F3-10 | **URL 상태 동기화** | nuqs로 선택된 노드 ID를 URL 쿼리 파라미터 동기화 |
| F3-11 | **캔버스 파일 드래그&드롭** | CSV/TXT 파일을 캔버스에 직접 드래그 → 자동 입력 |
| F3-12 | **노드 그룹핑/클러스터** | 관련 노드를 그룹으로 묶어 접기/펼치기 |

---

## 6. 화면 구조 (UI/UX 설계)

### 6.1 전체 레이아웃

```
┌──────────┬──────────────────────────────────┬────────────┐
│          │          Toolbar (46px)           │            │
│          ├──────────────────────────────────┤            │
│ Explorer │                                  │   Right    │
│ (트리)   │       Graph Canvas               │   Panel    │
│          │       (그래프 시각화)              │  (노드상세) │
│  260px   │                                  │   320px    │
│          │      [Empty State / MiniMap]      │            │
│          ├──────────────────────────────────┤            │
│          │  Hint Bar (투명, 하단 중앙)        │            │
│          ├──────────────────────────────────┤            │
│          │          Commit Bar (38px)        │            │
└──────────┴──────────────────────────────────┴────────────┘
```

- **Explorer**: 좌측 고정 260px — 계층 트리 + 검색
- **Graph Canvas**: 가운데 flex:1 — React Flow 기반 그래프 시각화
- **Right Panel**: 우측 고정 320px — 노드 상세 (미선택 시 숨김 가능)
- **Toolbar**: Canvas 상단 고정 46px — 온톨로지 이름 + 버전 + Import
- **Commit Bar**: Canvas 하단 고정 38px — 변경 추적 + 커밋 + Neo4j 푸시
- **Hint Bar**: Canvas 하단 중앙, 반투명 — "[더블클릭] 새 노드 · [드래그] 관계 연결"

### 6.2 Explorer (좌측 패널)

```
┌─ Explorer ──────────────────────┐
│                                  │
│  [Logo] Ontology Studio          │
│         PSK PEE Domain           │
│  ────────────────────────────── │
│  🔍 검색...                      │
│  ────────────────────────────── │
│                                  │
│  ▶ ● Equipment           (5)    │
│    ▶ ● DryAsher          (3)    │
│      ▶ ● SUPRA           (3)    │
│          ○ SUPRA XP              │
│          ○ SUPRA nXP             │
│          ○ SUPRA Lite            │
│        ● GENEVA                  │
│      ● WetStation         (2)    │
│  ▶ ● Engineer             (3)    │
│  ▶ ● Site                 (2)    │
│    ● FailureEvent         (0)    │
│                                  │
└──────────────────────────────────┘
```

**시각 규칙**:
- 클래스: ● 색상 dot + 굵은 이름 + 인스턴스 카운트 `(N)`
- 인스턴스: ○ 연한 green dot + text-secondary 이름
- 빈 클래스: dot opacity 0.5 + muted 색상 이름
- 들여쓰기: 레벨당 18px padding-left

**인터랙션**:
- 트리 아이템 클릭 → 캔버스 노드 선택 + Right Panel 교체
- ▶ 캐럿 클릭 → 하위 트리 접기/펼치기 (선택 변경 없음)
- 검색 입력 → 클래스/인스턴스 이름 필터링
- 검색 결과 클릭 → 캔버스 줌/패닝으로 해당 노드 포커스 (Phase 2)

### 6.3 Graph Canvas (가운데)

**배경**: `#fafafa` (dark: `#0a0a0b`) + 도트 그리드 (20px 간격)

**노드 렌더링**:
- 원형 노드: 연한 배경 fill (색상 opacity 0.12) + 컬러 테두리 (stroke-width: 1.2~1.5)
- 선택된 노드: accent 색상 stroke (2.5px) + 외곽 glow (`box-shadow: 0 0 0 3px rgba(124,58,237,0.2)`)
- 빈 클래스: 점선 테두리 (stroke-dasharray: 4 3) + 전체 opacity 0.35
- 노드 내부: 클래스 이름 (굵게) + 인스턴스 수 (mono, 작게)
- 노드 크기: 인스턴스 수에 비례 (최소 r=22, 최대 r=40)
- 호버: `transform: scale(1.05)` + 그림자 강화 (150ms transition)
- 인스턴스 수 뱃지: 노드 우측 상단 원형 뱃지 (카운트 0이면 숨김)

**Level of Detail (줌 기반)**:
- 줌 100%+: 전체 (이름 + 인스턴스 수 + 프로퍼티 뱃지)
- 줌 50~100%: 이름만 표시
- 줌 50% 미만: 색상 dot만 표시

**엣지 렌더링**:
- 실선: `#d4d4d8`, stroke-width 1.4
- 선택된 노드의 연결선: accent-mid (`#c4b5fd`), stroke-width 2
- 빈 클래스와의 연결: 점선 (stroke-dasharray: 4 4), opacity 0.3
- 엣지 라벨: mono 9.5px, muted 색상, 선의 중간

**인터랙션**:
| 동작 | 결과 |
|------|------|
| 노드 클릭 | 노드 선택 → Explorer 동기화 + Right Panel 교체 |
| 노드 호버 | 그림자 강화 |
| 빈 공간 더블클릭 | 새 노드 팝오버 (마우스 위치) |
| 노드 → 노드 드래그 | 관계 연결 (점선 → 드롭 시 관계 팝오버) |
| 노드를 노드 위에 드롭 | 계층 이동 확인 팝오버 |
| 빈 공간 드래그 | 캔버스 패닝 |
| 스크롤 휠 | 줌 인/아웃 |
| Delete 키 | 선택 노드/엣지 삭제 확인 다이얼로그 |
| Ctrl+Z / Ctrl+Y | Undo / Redo |
| Esc | 팝오버 닫기 / 선택 해제 |

### 6.4 Right Panel (우측 패널)

```
┌─ Right Panel ───────────────────┐
│                                  │
│  ● Equipment          [CLASS]    │
│  ────────────────────────────── │
│  반도체 제조 공정에서 사용되는     │
│  장비의 최상위 클래스...           │
│  ────────────────────────────── │
│                                  │
│  ▼ SUBCLASSES                (2) │
│    ● DryAsher                    │
│    ● WetStation                  │
│    [+ 하위 클래스 추가]            │
│                                  │
│  ▼ PROPERTIES                (5) │
│    model_name     string         │
│    fab_site       string   req   │
│    install_date   date           │
│    status         enum     택1   │
│    manufacturer   string         │
│    [+ 프로퍼티 추가]               │
│                                  │
│  ▼ RELATIONS                 (3) │
│    → located_at    Site     5건  │
│    ← assigned_to   Eng.    3건  │
│    ← occurred_on   Fail.   0건  │
│    [+ 관계 추가]                  │
│                                  │
│  ▶ CONSTRAINTS               (3) │
│    (접힌 상태)                    │
│                                  │
│  ▶ INSTANCES                 (5) │
│    (접힌 상태)                    │
│                                  │
│  ────────────────────────────── │
│  ⚡ AI 보조                       │
│  ┌────────────────────────────┐ │
│  │ "ECOLITE도 추가해줘"        │ │
│  └────────────────────────────┘ │
│                                  │
└──────────────────────────────────┘
```

**섹션 순서 및 기본 상태**:
| 순서 | 섹션 | 기본 상태 | 이유 |
|------|------|----------|------|
| 1 | Description | 항상 표시 | "이게 뭔데?" 즉시 답 |
| 2 | Subclasses | 펼침 | 구조 파악이 우선 |
| 3 | Properties | 펼침 | 클래스 특성 확인 |
| 4 | Relations | 펼침 | 다른 노드와의 연결 |
| 5 | Constraints | **접힘** | 규칙은 필요 시 확인 |
| 6 | Instances | **접힘** | 데이터가 많을 수 있음 |

**스코프 규칙**: 해당 노드의 **직속** 정보만 표시.
- Equipment 클릭 → Subclasses에 DryAsher, WetStation만 (손자 SUPRA 안 보임)
- Equipment 클릭 → Instances에 직접 속한 인스턴스만 (하위 클래스 인스턴스 안 보임)

### 6.5 Commit Bar (하단)

```
┌──────────────────────────────────────────────────────────────┐
│  ● 변경사항 7건   +5 class · +2 rel   [되돌리기] [변경 내역] [커밋] [Neo4j 푸시] │
└──────────────────────────────────────────────────────────────┘
```

| 요소 | 설명 |
|------|------|
| ● (amber 점) | 미커밋 변경 존재 시 pulse 애니메이션 |
| 변경사항 N건 | 총 변경 수 (ADD + MOD + DEL) |
| +N class · +N rel | 유형별 요약 (mono, muted) |
| [되돌리기] | Ctrl+Z와 동일 (로컬 undo) |
| [변경 내역] | diff 뷰 시트 (ADD: 초록, MOD: amber, DEL: 빨강) |
| [커밋] | Supabase에 커밋 스냅샷 생성 |
| [Neo4j 푸시] | 커밋된 변경분을 프로덕션에 반영 (확인 시트 → 실행) |

### 6.6 팝오버 공통 규칙

- 트리거 위치 근처에 표시 (모달 아님)
- 캔버스 밖으로 넘어가면 반대쪽에 위치 보정
- Esc 또는 바깥 클릭으로 닫기
- 최대 너비 360px
- 배경: Card 색상, border-radius 12px, shadow-lg
- 등장 모션: `scale(0.95→1) + opacity(0→1)`, 150ms

### 6.7 Neo4j 푸시 확인 시트 (Phase 2 신규)

**트리거**: CommitBar의 [Neo4j 푸시] 버튼 클릭
**컴포넌트**: `NeoConfirmSheet` — 하단에서 올라오는 Sheet (50vh)

**Phase 1 — 확인**:
```
┌─ Neo4j 푸시 ─────────────────────────────────────────┐
│                                                        │
│  변경 요약                                             │
│  ┌──────────────────────────────────────────────────┐ │
│  │  +5 class  ~2 modified  -1 deleted               │ │
│  │  +3 relation  +12 instance                       │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  ▶ Cypher 미리보기               (접기/펼치기)         │
│  ┌──────────────────────────────────────────────────┐ │
│  │  CREATE (n:Class {id: '...', name: 'WetStation'})│ │
│  │  SET n.description = '...'                       │ │
│  │  MATCH (a:Class {id: '...'}), (b:Class {id: '..'│ │
│  │  CREATE (a)-[:USES]->(b)                         │ │
│  │                                          [복사]   │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│                          [취소]  [푸시 실행 ▶]         │
└────────────────────────────────────────────────────────┘
```

**Phase 2 — 진행 중** (같은 Sheet 내 전환, Sheet 닫기 불가):
```
┌─ Neo4j 푸시 중... ───────────────────────────────────┐
│                                                        │
│  ███████████░░░░░░░░░░░░░░  3/7 쿼리 실행 중          │
│                                                        │
│  ✓ 클래스 5개 생성                                     │
│  ✓ 프로퍼티 8개 생성                                   │
│  ◎ 관계 3개 생성 중...                  ← spinner      │
│  ○ 인스턴스 12개                                       │
│  ○ 엣지 4개                                           │
│  ○ 인덱스 업데이트                                     │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Phase 3a — 성공**:
```
┌─ 푸시 완료 ──────────────────────────────────────────┐
│                                                        │
│       ✓  Neo4j에 성공적으로 반영되었습니다              │
│          7/7 쿼리 완료 · 0.8초                         │
│                                                        │
│  [Neo4j 브라우저에서 확인]              [닫기]          │
└────────────────────────────────────────────────────────┘
```

**Phase 3b — 실패 (일부)**:
```
┌─ 푸시 부분 실패 ─────────────────────────────────────┐
│                                                        │
│  ✓ 5/7 성공   ✗ 2건 실패                              │
│                                                        │
│  실패 항목:                                            │
│  ✗ 관계 "uses" 생성 — ConstraintViolation              │
│  ✗ 인스턴스 "WS-003" — 중복 키 오류                    │
│                                                        │
│          [실패 건만 재시도]  [건너뛰기]  [닫기]          │
└────────────────────────────────────────────────────────┘
```

**인터랙션 규칙**:
- Cypher 미리보기: 기본 접힘, mono 폰트, 구문 하이라이팅 (keyword=cyan, string=green)
- [복사]: Cypher 텍스트 클립보드 복사
- 진행 중 Sheet 닫기 불가 (backdrop 클릭 무시)
- 진행 바: emerald-500, transition 애니메이션

**컴포넌트 구조**:
```
CommitBar
  └── NeoConfirmSheet (Sheet)
        ├── PushSummary (변경 요약)
        ├── CypherPreview (접기/펼치기 코드 블록)
        ├── PushProgress (단계별 진행률)
        └── PushResult (성공/실패 상태)
```

### 6.8 빈 캔버스 Empty State (Phase 2 신규)

**현재**: GraphCanvas.tsx에 기본 빈 상태 UI 구현됨. 이를 확장.

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│                   (subtle dot grid bg)                   │
│                                                          │
│            ┌─────────────────────────────┐               │
│            │   [Mouse double-click icon] │               │
│            │   (pulse ring animation)    │               │
│            └─────────────────────────────┘               │
│                                                          │
│        빈 공간을 더블클릭하여 지식을 입력하세요            │
│                                                          │
│   자유 형식의 텍스트를 입력하면 AI가 클래스,              │
│   프로퍼티, 관계를 자동으로 구조화합니다.                 │
│                                                          │
│   ┌──────────────────────────────────────┐              │
│   │ 입력 예시                             │              │
│   │ "반도체 FAB에는 DryAsher, WetStation │              │
│   │  장비가 있고, 엔지니어 김철수가 SUPRA │              │
│   │  장비를 관리한다"                     │              │
│   └──────────────────────────────────────┘              │
│                                                          │
│    [예시 온톨로지 불러오기]    [직접 시작하기]             │
│                                                          │
│   ────────────────────────────────────────               │
│   [더블클릭] 새 노드  ·  [드래그&드롭] CSV/TXT 임포트    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**[예시 온톨로지 불러오기] 클릭 시** — 팝오버:
```
┌─ 예시 온톨로지 선택 ──────────────────┐
│                                        │
│  반도체 장비 도메인                     │
│  Equipment > DryAsher > SUPRA...       │
│  클래스 6개, 인스턴스 12개, 관계 8개    │
│  [불러오기]                             │
│                                        │
│  제조 공정 도메인              (추후)   │
│  자동차 부품 도메인            (추후)   │
│                                        │
└────────────────────────────────────────┘
```

**인터랙션 규칙**:
- [예시 온톨로지 불러오기]: 팝오버 → 선택 → loadOntology → 노드 등장 애니메이션
- [직접 시작하기]: NewNodePopover를 화면 중앙에 열기
- 파일 드래그 시: `border-2 border-dashed border-primary` 오버레이 표시
- 노드 1개 이상 생성 시 Empty State 자동 퇴장

**컴포넌트 구조**:
```
GraphCanvas (isEmpty 분기)
  └── EmptyState
        ├── EmptyStateGuide (아이콘 + 텍스트)
        ├── ExampleCard (입력 예시)
        ├── EmptyStateActions ([예시 불러오기] [직접 시작])
        │     └── TemplatePopover (예시 온톨로지 목록)
        └── DropZoneOverlay (파일 드래그 시)
```

### 6.9 삭제 확인 다이얼로그

**트리거**: Delete/Backspace 키 (노드 선택), 우클릭 → [삭제], RightPanel 헤더 삭제 버튼

```
┌─ 노드 삭제 ──────────────────────────┐
│                                        │
│  ● Equipment 를 삭제하시겠습니까?      │
│                                        │
│  ⚠ 다음 항목도 함께 삭제됩니다:       │
│  ┌──────────────────────────────────┐ │
│  │  하위 클래스 3개                  │ │
│  │    ├─ DryAsher (인스턴스 5개)     │ │
│  │    │  └─ SUPRA (인스턴스 3개)     │ │
│  │    └─ WetStation (인스턴스 2개)   │ │
│  │                                   │ │
│  │  관련 관계 4개                     │ │
│  │    → located_at (5건)             │ │
│  │    ← assigned_to (3건)            │ │
│  │                                   │ │
│  │  총 영향: 클래스 4, 인스턴스 10,  │ │
│  │  관계 4건 삭제                     │ │
│  └──────────────────────────────────┘ │
│                                        │
│  ○ 하위 항목도 모두 삭제 (cascade)     │
│  ○ 하위 항목을 상위로 승격 (promote)   │
│    └─ DryAsher, WetStation이          │
│      루트 클래스로 이동                │
│                                        │
│              [취소]  [삭제]            │
└────────────────────────────────────────┘
```

**인터랙션 규칙**:
- 영향 범위 트리: 재귀적으로 모든 하위 항목 계산
- 라디오 선택: cascade(기본) / promote
- promote 시: 하위 클래스의 parentId가 삭제 대상의 parentId로 변경
- [삭제] 버튼: `bg-destructive`, 영향 10개+ 시 건수 표시 ("삭제 (14건)")
- 인스턴스 노드 삭제: 단순 확인만 (cascade 없음)
- 삭제 후 zundo로 undo 가능

**컴포넌트 구조**:
```
DeleteConfirmDialog (AlertDialog)
  ├── CascadeTree (영향 범위 트리)
  ├── DeleteModeRadio (cascade / promote)
  └── DeleteActions
```

### 6.10 Chat-to-Edit AI 어시스턴트 (Phase 3)

**위치**: RightPanel 최하단 (AI 보조 입력창)

**기본 상태**:
```
┌─ RightPanel 하단 ───────────────────┐
│  ── separator ──                     │
│  ⚡ AI 보조                          │
│  ┌─────────────────────────────┐    │
│  │ "ECOLITE도 추가해줘"     [▶]│    │
│  └─────────────────────────────┘    │
│  / 명령어 보기                       │
└──────────────────────────────────────┘
```

**AI 응답 후 제안 표시**:
```
┌─ RightPanel 하단 ───────────────────┐
│  ⚡ AI 보조                          │
│                                      │
│  💬 "ECOLITE도 추가해줘"             │
│                                      │
│  ┌─ AI 제안 ──────────────────────┐ │
│  │ 다음을 추가하겠습니다:          │ │
│  │                                 │ │
│  │ + ECOLITE  (DryAsher 하위)     │ │
│  │   description: "ECOLITE 모델..." │ │
│  │                                 │ │
│  │  [확정]  [수정]  [삭제]         │ │
│  └─────────────────────────────────┘ │
│                                      │
│  ┌─────────────────────────────┐    │
│  │ 추가 지시...             [▶]│    │
│  └─────────────────────────────┘    │
└──────────────────────────────────────┘
```

**섹션 내 인라인 제안** (예: "status에 이관 추가해줘"):
```
┌─ PROPERTIES ──────────── (6) ──────┐
│  status         enum     택1        │
│    ┌─────────────────────────────┐  │
│    │ ⚡ AI 제안: enum에 "이관" 추가│  │
│    │    현재: [가동, 정지, 점검]   │  │
│    │    변경: [가동, 정지, 점검,   │  │
│    │          이관]               │  │
│    │         [적용]  [무시]       │  │
│    └─────────────────────────────┘  │
└─────────────────────────────────────┘
```

**인터랙션 규칙**:
- Enter 전송, Shift+Enter 줄바꿈
- 스트리밍 중: typing indicator (3 dot bounce)
- 제안 배경: `bg-primary/5` + `border-l-2 border-primary`
- [확정] → 스토어 반영 + 제안 fade-out
- [수정] → 인라인 편집 폼 전환
- 복수 섹션 동시 제안 가능
- `/` 키로 입력창 포커스 (단축키)
- 히스토리: 최근 2~3턴 스크롤 확인

**컴포넌트 구조**:
```
RightPanel
  ├── (기존 섹션들 — 인라인 AiSuggestion 포함 가능)
  └── AiAssistant
        ├── AiChatHistory
        ├── AiSuggestionCard → SuggestionDiff + SuggestionActions
        ├── AiStreamingIndicator
        └── AiInput
```

### 6.11 대량 임포트 진행률 (Phase 2 신규)

**트리거**: NewNodePopover에서 대량 텍스트/CSV 입력 후 [생성] 클릭

**NewNodePopover 내 Phase 전환**: input → loading → preview

```
┌─ 구조화 중... ─────────────────────┐
│                                      │
│  ⚡ AI가 입력을 분석하고 있습니다     │
│                                      │
│  ████████████░░░░░░░░  60%           │
│                                      │
│  ✓ 텍스트 파싱 완료                  │
│  ✓ 엔티티 추출 (23개 감지)           │
│  ◎ 관계 추론 중...         ← spin   │
│  ○ 기존 온톨로지와 매칭              │
│  ○ 계층 구조 최적화                  │
│                                      │
│  입력: 2,847자 · 예상 소요: ~5초     │
│                                      │
│                           [취소]     │
└──────────────────────────────────────┘
```

**인터랙션 규칙**:
- 진행률 바: primary 색상, 실제 비율 또는 indeterminate
- 각 단계: ✓(완료, emerald) / ◎(진행중, spinner) / ○(대기, muted)
- [취소]: AbortController로 LLM 요청 취소 → input phase 복귀
- 소량 입력(100자 미만)은 진행률 건너뛰고 바로 preview

**컴포넌트 구조**:
```
NewNodePopover
  ├── InputPhase (기존)
  ├── LoadingPhase (신규) → ProgressBar + StepChecklist
  └── PreviewPhase (기존)
```

### 6.12 Level of Detail — 줌 기반 노드 간소화 (Phase 2)

**줌 레벨별 렌더링**:

| 줌 레벨 | 노드 표시 | 엣지 라벨 |
|---------|----------|----------|
| 100%+ (상세) | 이름 + 인스턴스 수 + 프로퍼티 뱃지 | 표시 |
| 50~99% (중간) | 이름만, 크기 약간 축소 | 80% 미만에서 숨김 |
| 50% 미만 (최소) | 색상 dot만 (8~12px) | 숨김 |

**구현**:
```typescript
// ClassNode 내부
const zoom = useStore((s) => s.transform[2]);
const detail = zoom >= 1 ? 'full' : zoom >= 0.5 ? 'name' : 'dot';

if (detail === 'dot') return <ColorDot />;
if (detail === 'name') return <NameOnly />;
return <FullNode />;
```

- 전환 시 부드러운 opacity transition (150ms)
- MiniMap에는 항상 색상 dot만 표시

### 6.13 로딩 스켈레톤 (Phase 2)

shadcn/ui `Skeleton` 컴포넌트(`animate-pulse`) 사용.

**Explorer 스켈레톤**:
```
┌─ Explorer ─────────────────┐
│  [Logo] Ontology Studio    │
│  [  검색...            ]   │
│  ──────────────────────── │
│  ██████████████ ████       │
│    ████████████ ██         │
│      ██████████████        │
│    ██████████ ████         │
│  ████████████████ ██       │
└────────────────────────────┘
```

**Canvas 스켈레톤**: 중앙 Spinner + "그래프를 불러오고 있습니다"

**RightPanel 스켈레톤** (노드 선택 후 데이터 로딩):
```
┌─ Right Panel ──────────────┐
│  ○ ████████████   [CLASS]  │
│  ████████████████████████  │
│  ████████████████          │
│  ──────────────────────── │
│  SUBCLASSES          (-)   │
│  ████████████              │
│  ████████████████          │
│  ──────────────────────── │
│  PROPERTIES          (-)   │
│  ████████ ████             │
│  ██████████████ ██         │
└────────────────────────────┘
```

**규칙**:
- 초기 로딩 시만 표시 (후속 데이터 갱신은 직접 업데이트)
- 스켈레톤 → 실제 콘텐츠: fade transition 150ms
- CommitBar는 비활성 상태 표시 (회색 텍스트)

### 6.14 검색 → 캔버스 포커스 하이라이트 (Phase 2)

Explorer 검색 결과 또는 트리 아이템 클릭 시:
1. 캔버스가 해당 노드로 패닝+줌 (기존 `fitView` 동작 유지)
2. 노드에 일시적 하이라이트 ring pulse 추가 (1.5초 후 자동 해제)
3. `Ctrl+F` → Explorer 검색 입력에 포커스 (단축키)

**하이라이트 CSS**:
```css
@keyframes focus-ring {
  0% { box-shadow: 0 0 0 0 rgba(124,58,237,0.4) }
  100% { box-shadow: 0 0 0 8px transparent }
}
```

ClassNode/InstanceNode에 `isFocused` prop 추가.

### 6.15 디자인 토큰 확장

기존 토큰으로 대부분 커버. 추가 필요한 토큰:

```css
:root {
  --ai-suggestion-bg: 263 83% 97%;       /* AI 제안 배경 */
  --ai-suggestion-border: 263 70% 70%;   /* AI 제안 border */
  --progress-fill: 142 71% 45%;          /* 진행률 바 (emerald-500) */
  --focus-ring-color: 263 70% 50.4% / 0.3; /* 포커스 링 */
}
.dark {
  --ai-suggestion-bg: 263 30% 12%;
  --ai-suggestion-border: 263 50% 40%;
  --progress-fill: 142 60% 40%;
  --focus-ring-color: 263 70% 58% / 0.3;
}
```

---

## 7. 브랜딩 가이드라인

### 7.1 톤앤매너

**"전문적이지만 두렵지 않은 도구"**

| 원칙 | 설명 | 적용 예시 |
|------|------|----------|
| **접근 가능한 전문성** | 온톨로지 개념을 자연스럽게 학습시키되, 전문 용어를 전제하지 않음 | "클래스", "관계" 같은 최소 용어만 노출. "공리"→"제약조건"으로 순화 |
| **결과 먼저, 설명 나중** | 사용자가 뭘 해야 하는지가 아니라 뭘 얻는지 먼저 보여줌 | "자유 형식의 텍스트를 입력하면 AI가 자동으로 구조화합니다" |
| **실수해도 괜찮다는 안심감** | 되돌리기, 프리뷰 확인, 커밋 시스템으로 안전망 제공 | Phase2 프리뷰에서 삭제/수정 가능, Undo/Redo 50단계, 커밋 이력 |
| **미니멀 데이터 밀도** | 정보 과부하 방지. 기본은 접힘, 필요 시 펼침 | RightPanel의 Constraints/Instances 기본 접힘 |

**금지 사항**:
- "에러가 발생했습니다" 단독 사용 금지 → 항상 대안 행동 제시
- "온톨로지 공리(axiom)" 등 학술 용어 사용자 UI에 노출 금지
- 영문 단독 버튼 라벨 금지 (단, 고유명사 "Neo4j"는 예외)

### 7.2 색상 시스템

**디자인 토큰** (Light/Dark 모두 `globals.css`에 구현 완료):

| 토큰 | Light | Dark | 용도 |
|------|-------|------|------|
| Background | `#fafafa` | `#0a0a0f` (구현됨) | 전체 배경 |
| Card | `#ffffff` | `#17171c` (구현됨) | 패널, 팝오버 배경 |
| Border | `#e4e4e7` | `#27272a` (구현됨) | 구분선 |
| Text Primary | `#18181b` | `#fafafa` | 본문 |
| Text Secondary | `#52525b` | `#a1a1aa` | 보조 텍스트 |
| Text Muted | `#a1a1aa` | `#71717a` | 비활성 텍스트 |
| Accent | `#7c3aed` | `#8b5cf6` (다크에서 약간 밝게) | 보라 (선택, 강조) |
| Accent Light | `#ede9fe` | `rgba(124,58,237,0.15)` | 보라 배경 |
| Canvas BG | `#fafafa` | `#0a0a0b` | 캔버스 배경 |
| Grid Dots | `#d4d4d8` | `#3f3f46` | 캔버스 그리드 |
| Shadow | `rgba(0,0,0,0.08)` | `rgba(0,0,0,0.32)` | 카드 그림자 |

**노드 색상 체계** (테두리 색상 + 다크모드 배경 fill):

| 노드 타입 | 테두리 (Light) | 테두리 (Dark) | Dark 배경 fill | 용도 |
|-----------|---------------|--------------|---------------|------|
| 루트/핵심 클래스 | `#7c3aed` | `#8b5cf6` | `rgba(124,58,237,0.20)` | Equipment 등 최상위 |
| 중간 클래스 | `#2563eb` | `#3b82f6` | `rgba(37,99,235,0.20)` | DryAsher, WetStation |
| 하위 모델 | `#0891b2` | `#06b6d4` | `rgba(8,145,178,0.20)` | SUPRA, GENEVA |
| 인스턴스 | `#86efac` | `#4ade80` | `rgba(134,239,172,0.15)` | SP-001 (opacity 낮춤 — 과도한 밝기 방지) |
| 사람 | `#d97706` | `#f59e0b` | `rgba(217,119,6,0.20)` | Engineer |
| 장소 | `#dc2626` | `#ef4444` | `rgba(220,38,38,0.20)` | Site |
| 이벤트 | `#db2777` | `#ec4899` | `rgba(219,39,119,0.20)` | FailureEvent |
| 빈 클래스 | 해당색 + 점선 + opacity 0.35 | 해당색 + opacity 0.20 | — | 인스턴스 없는 클래스 |

- Light 모드 노드 배경 fill opacity: 0.12
- Dark 모드 노드 배경 fill opacity: 0.20 (가시성 확보)
- **구현 방법**: `NODE_BG_COLORS`를 테마 인식 함수로 변경하거나 CSS 변수로 전환

### 7.3 타이포그래피

**폰트 패밀리**: Outfit (본문) + JetBrains Mono (코드/수치) — Google Fonts, CSS 변수로 로딩.

**폰트 사이즈 스케일** (코드 기반 검증 완료):

| 스케일 | 사이즈 | Weight | 용도 |
|--------|--------|--------|------|
| xs-caption | 10px | 400~600 | 배지, 힌트, 카운트, 섹션 헤더(uppercase, semibold) — **최소 크기 하한선** |
| xs-body | 11px | 400 | 모노 데이터 (CommitBar 텍스트, 프로퍼티 타입) |
| sm-body | 12px | 400~600 | 트리 아이템, 목록, 팝오버 본문, 캔버스 노드 이름(semibold) |
| base-body | 14px | 400 | 패널 제목, Toolbar 텍스트, 일반 본문 |
| heading | 16px | 400 | 빈 상태 제목 (드물게 사용) |

**모노 폰트 적용 위치**: 인스턴스 카운트, 프로퍼티 타입 뱃지, CommitBar 통계, 엣지 라벨, Cypher 미리보기

### 7.4 아이콘

- **유일한 소스**: `lucide-react` — 프로젝트 전체에서 lucide-react만 사용
- 다른 아이콘 라이브러리(heroicons, phosphor, tabler 등) 및 인라인 SVG 아이콘 금지
- 아이콘 기본 크기: 16px (패널), 14px (뱃지/인라인), 20px (Toolbar)
- stroke-width: 1.75 (기본)
- 커스텀 아이콘 현재 불필요. 향후 필요 시 lucide 스타일(24x24, stroke-width 2, round linecap)로 제작
- 현재 `Box` 아이콘이 로고로 사용 중 → 향후 전용 로고 SVG로 교체 권장

### 7.5 모션 디자인 원칙

**원칙**:
- Spring 기본 — ease 대신 spring 사용 (물리적 자연스러움)
- 200ms 이하 — 사용자가 "즉각적"으로 느끼는 범위
- 같은 유형의 UI 요소는 같은 모션 토큰 사용 (일관성)

**모션 토큰** (코드 기반 검증 완료):

```typescript
MOTION_TOKENS = {
  // 구조적 전환 (패널 열기/닫기, 큰 영역 변화)
  structural: { type: 'spring', damping: 24, stiffness: 260 },

  // 요소 등장/퇴장 (노드, 카드)
  element: { type: 'spring', damping: 15, stiffness: 300 },

  // 오버레이 (팝오버, 드롭다운) — y offset: -8px
  overlay: { type: 'spring', damping: 25, stiffness: 350 },

  // 미세 전환 (접기/펼치기, 페이드)
  micro: { duration: 0.15 },

  // 강조 (pulse, ping)
  emphasis: { duration: 3, repeat: Infinity },
}
```

**적용 매핑**:

| 인터랙션 | 모션 토큰 | 상태 |
|---------|----------|------|
| 팝오버 등장/퇴장 | `overlay` + scale(0.95→1), y(-8→0) | 구현됨 |
| 패널 슬라이드 | `structural` + x 슬라이드 | 구현됨 |
| 노드 추가 | `element` + scale(0→1), bounce | 구현됨 |
| 트리 접기/펼치기 | `micro` | 구현됨 |
| 노드 삭제 | `micro` + scale(1→0.8), fade | Phase 2 |
| 엣지 연결 중 | 점선 stroke-dashoffset 회전 | Phase 3 |
| Commit Bar amber 점 | `emphasis` + pulse | 구현됨 |

### 7.6 에러/빈 상태 메시지 톤

**메시지 작성 규칙**:
1. 주어 생략 — "연결에 실패했습니다" (O), "시스템이 연결에 실패했습니다" (X)
2. 해결책 포함 — "~실패. 다시 시도해주세요" (O), "~실패했습니다" (X)
3. 기술 용어 회피 — "서버와 연결할 수 없습니다" (O), "HTTP 503 에러" (X)
4. 한국어 존대 — "~해주세요", "~합니다" 톤 유지
5. 성공 메시지는 간결 — "커밋 완료" (O), "성공적으로 커밋이 완료되었습니다" (X)

**상태별 메시지**:

| 상태 | 메시지 예시 | 톤 |
|------|-----------|-----|
| 빈 캔버스 | "빈 공간을 더블클릭하여 지식을 입력하세요" + 입력 예시 | 호기심 유발 + 구체적 안내 |
| 빈 검색 결과 | "'{query}'에 대한 결과가 없습니다" | 간결, 구체적 |
| Supabase 연결 실패 | "연결이 불안정합니다. 변경사항은 로컬에 보관됩니다." | 안심 + 상태 설명 |
| LLM API 실패 | "AI 구조화에 실패했습니다. 직접 입력하시겠습니까?" | 대안 제시 |
| Neo4j 푸시 실패 | "프로덕션 반영에 실패했습니다. 변경사항은 스테이징에 안전하게 보존되어 있습니다." | 안심 + 상세 |
| 중복 이름 | "같은 이름의 클래스가 이미 존재합니다." | 직접적, 간결 |
| 삭제 확인 | "하위 N개 항목도 함께 삭제됩니다." | 명확한 영향 범위 |
| 커밋 성공 | "커밋 완료" | 간결 |
| 푸시 성공 | "Neo4j 반영 완료 (N건)" | 간결 + 수량 |
| 로딩 | 스켈레톤 UI (텍스트 없음) | 비침투적 |

### 7.7 Toolbar 브랜드 이슈 (수정 필요)

| 이슈 | 현재 | 수정 방향 |
|------|------|----------|
| "Import" 영문 라벨 | Toolbar의 Import 버튼 | "가져오기" 또는 "+ 지식 추가"로 변경 |
| AI Sparkles 버튼 기능 없음 | onClick 핸들러 없음 | Phase 3까지 `disabled` 상태로 표시하거나 숨김 |
| Download 버튼 기능 없음 | onClick 핸들러 없음 | Phase 3 Export까지 `disabled` 상태로 표시하거나 숨김 |

---

## 8. 기술 스택

### 8.1 Core Framework

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `next` | 15.1.x | App Router, Server Actions, API Routes, Turbopack |
| `react` / `react-dom` | 19.x | UI 렌더링 |
| `typescript` | 5.x | 타입 안전성 |

### 8.2 UI / 스타일링

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `tailwindcss` | 3.4.x (MVP) → 4.x (post-MVP) | 유틸리티 CSS |
| `shadcn/ui` | latest | 컴포넌트 (Popover, Command, Collapsible, Sheet, Table, Badge, Dialog, AlertDialog 등) |
| `lucide-react` | latest | **유일한 아이콘 소스** |
| `framer-motion` | 11.x | 모션 애니메이션 |
| `class-variance-authority` | latest | variant 시스템 |
| `clsx` + `tailwind-merge` | latest | 조건부 className |
| `sonner` | latest | 토스트 알림 (Phase 2에서 교체) |

### 8.3 그래프 엔진

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `@xyflow/react` | 12.x | 그래프 캔버스 (커스텀 노드, 엣지, 줌/패닝, D&D) |
| `elkjs` | latest | 자동 레이아웃 (layered 알고리즘) |

**ELKjs 설정**:
```typescript
const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.layered.spacing.nodeNodeBetweenLayers': '80',
  'elk.layered.spacing.edgeNodeBetweenLayers': '40',
  'elk.spacing.nodeNode': '50',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
};
```

**React Flow 필수 패턴**:
- `nodeTypes` 객체를 컴포넌트 외부에서 정의 (매 렌더 재생성 방지)
- 커스텀 노드 컴포넌트에 `React.memo` 적용
- `edgeTypes`도 동일하게 메모이제이션

### 8.4 상태 관리

| 패키지 | 용도 |
|--------|------|
| `zustand` (v4) | 전역 상태 — 슬라이스 패턴 (Graph, Selection, Change, Popover) |
| `immer` | zustand 미들웨어 — 깊은 중첩 안전 업데이트 |
| `zundo` | zustand temporal 미들웨어 — Ctrl+Z/Y Undo/Redo (50단계) |
| `@tanstack/react-query` | Supabase 데이터 페칭/캐싱/동기화 |

**Zustand 슬라이스 구조**:
```typescript
ontologyStore = create(
  devtools(
    temporal(
      immer(
        (...a) => ({
          ...createGraphSlice(...a),      // classes, instances, relations, edges
          ...createSelectionSlice(...a),   // selectedNodeId, hoveredNodeId
          ...createChangeSlice(...a),      // pendingChanges, commitHistory
          ...createPopoverSlice(...a),     // popoverState, popoverPosition
        })
      )
    )
  )
)
```

**React Query 캐싱 전략**:

| 데이터 | staleTime | gcTime | 이유 |
|--------|-----------|--------|------|
| classes (트리) | 5분 | 30분 | 자주 변경되지 않음 |
| instances | 2분 | 10분 | 빈번한 추가/수정 |
| relation_types | 10분 | 1시간 | 거의 변경 없음 (팔레트) |
| edges | 2분 | 10분 | 관계 연결/삭제 빈번 |
| commits | 30초 | 5분 | 최신 상태 반영 필요 |

### 8.5 폼 / 검증

| 패키지 | 용도 |
|--------|------|
| `zod` | 스키마 정의 + 유효성 검증 |
| `react-hook-form` + `@hookform/resolvers` | 폼 상태 관리 + zod 연동 |

### 8.6 리치 텍스트

| 패키지 | 용도 |
|--------|------|
| `@tiptap/react` + `@tiptap/starter-kit` | Description 인라인 편집 (볼드/이탤릭/링크) |
| `@tiptap/extension-placeholder` | 빈 상태 placeholder |

### 8.7 백엔드 / 데이터베이스

| 패키지 | 용도 |
|--------|------|
| `drizzle-orm` | 메인 ORM — TypeScript 스키마 + 타입 안전 쿼리 + CTE |
| `drizzle-kit` | 마이그레이션 생성/푸시 |
| `@supabase/supabase-js` | 보조 클라이언트 (Realtime, Storage) |
| `@supabase/ssr` | Next.js SSR 통합 |
| `postgres` | PostgreSQL 드라이버 |
| `neo4j-driver` | Neo4j Cypher 실행 (API Route) |

### 8.8 유틸리티

| Need | Use |
|------|-----|
| Date/time | `date-fns` |
| Branching logic | `ts-pattern` |
| React hooks | `react-use` |
| Utilities | `es-toolkit` |

---

## 9. DB 스키마

### 9.1 ER 다이어그램

```
┌──────────────┐       ┌──────────────────┐
│   classes    │       │   properties     │
├──────────────┤       ├──────────────────┤
│ PK id        │──┐    │ PK id            │
│ FK parent_id │──┘ 1:N│ FK class_id      │──→ classes.id
│    name      │◄──────│    name          │
│    description│      │    data_type     │
│    color     │       │    is_required   │
│    position_x│       │    enum_values   │
│    position_y│       │    constraint_rule│
│    created_at│       │    sort_order    │
│    updated_at│       └──────────────────┘
└──────┬───────┘
       │ 1:N
       ▼
┌──────────────────┐       ┌────────────────────┐
│   instances      │       │  instance_values   │
├──────────────────┤       ├────────────────────┤
│ PK id            │──┐    │ PK id              │
│ FK class_id      │  │ 1:N│ FK instance_id     │──→ instances.id
│    name          │  └────│ FK property_id     │──→ properties.id
│    created_at    │       │    value           │
│    updated_at    │       └────────────────────┘
└──────────────────┘

┌──────────────────┐       ┌────────────────────┐
│  relation_types  │       │      edges         │
├──────────────────┤       ├────────────────────┤
│ PK id            │──┐    │ PK id              │
│    name (UNIQUE) │  │ 1:N│ FK relation_type_id│──→ relation_types.id
│    description   │  └────│ FK source_id       │
│    source_class_id│      │ FK target_id       │
│    target_class_id│      │    source_kind     │ ('class'|'instance')
│    created_at    │       │    target_kind     │ ('class'|'instance')
└──────────────────┘       │    created_at      │
                           └────────────────────┘

┌──────────────────┐       ┌────────────────────┐
│     axioms       │       │   axiom_classes    │
├──────────────────┤       ├────────────────────┤
│ PK id            │──┐    │ PK axiom_id (FK)   │──→ axioms.id
│    description   │  │ M:N│ PK class_id (FK)   │──→ classes.id
│    rule_logic    │  └────│                    │
│    severity      │       └────────────────────┘
│    created_at    │
└──────────────────┘

┌──────────────────┐       ┌────────────────────┐
│    commits       │       │  commit_details    │
├──────────────────┤       ├────────────────────┤
│ PK id            │──┐    │ PK id              │
│    message       │  │ 1:N│ FK commit_id       │──→ commits.id
│    pushed_to_neo4j│ └────│    operation       │ ('ADD'|'MOD'|'DEL')
│    pushed_at     │       │    target_table    │
│    created_at    │       │    target_id       │
│                  │       │    before_snapshot │
│                  │       │    after_snapshot  │
└──────────────────┘       └────────────────────┘
```

### 9.2 테이블 상세

총 10개 테이블: `classes`, `properties`, `instances`, `instance_values`, `relation_types`, `edges`, `axioms`, `axiom_classes`, `commits`, `commit_details`

**핵심 설계 원칙**:
- `classes.parent_id` 자기참조 FK — Adjacency List 패턴으로 is-a 계층 표현
- `ON DELETE SET NULL` (classes.parent_id) — 부모 삭제 시 자식 루트로 승격
- `ON DELETE CASCADE` (properties, instances, instance_values) — 클래스 삭제 시 연쇄 정리
- EAV 패턴 (instance_values) — 동적 스키마 지원
- 폴리모픽 FK (edges.source_kind/target_kind) — 클래스/인스턴스 간 관계 통합
- M:N 조인 테이블 (axiom_classes) — 공리↔클래스 매핑

**RLS**: 1인 사용이므로 전체 비활성화.

**자동 트리거**: `updated_at` 컬럼 자동 갱신 (classes, instances).

---

## 10. API 명세

### 10.1 REST API (Next.js API Routes)

| Method | Path | 설명 |
|--------|------|------|
| GET/POST | `/api/classes` | 클래스 목록 조회 / 생성 |
| GET/PATCH/DELETE | `/api/classes/[id]` | 클래스 상세 / 수정 / 삭제 |
| GET/POST | `/api/properties` | 프로퍼티 목록 / 생성 |
| GET/PATCH/DELETE | `/api/properties/[id]` | 프로퍼티 상세 / 수정 / 삭제 |
| GET/POST | `/api/instances` | 인스턴스 목록 / 생성 |
| GET/PATCH/DELETE | `/api/instances/[id]` | 인스턴스 상세 / 수정 / 삭제 |
| POST | `/api/instance-values` | 인스턴스 값 일괄 저장 |
| GET/POST | `/api/edges` | 엣지 목록 / 생성 |
| GET/DELETE | `/api/edges/[id]` | 엣지 상세 / 삭제 |
| GET/POST | `/api/relation-types` | 관계 타입 목록 / 생성 |
| GET/PATCH/DELETE | `/api/relation-types/[id]` | 관계 타입 상세 / 수정 / 삭제 |
| GET/POST | `/api/axioms` | 공리 목록 / 생성 |
| GET/PATCH/DELETE | `/api/axioms/[id]` | 공리 상세 / 수정 / 삭제 |
| POST | `/api/commits` | 커밋 생성 (변경사항 스냅샷) |
| POST | `/api/llm/parse` | 자유 텍스트 → LLM 구조화 |

### 10.2 Phase 2 추가 API

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/neo4j/push` | 커밋 → Cypher 생성 → Neo4j 트랜잭션 실행 |
| POST | `/api/neo4j/rollback` | Neo4j 푸시 롤백 (before_snapshot 기반) |
| GET | `/api/neo4j/status` | Neo4j 연결 상태 확인 |

### 10.3 LLM 통합 포인트

| 기능 | 입력 | 출력 | 모델 |
|------|------|------|------|
| 자유 입력 구조화 | 사용자 텍스트/CSV + 기존 클래스/관계 목록 | 클래스/프로퍼티/인스턴스/관계 JSON | Claude Sonnet |
| 노드 설명 생성 | 노드 이름 + 컨텍스트 | 자연어 설명 | Claude Haiku |
| 공리 해석 (Phase 3) | 자연어 제약 + 관련 클래스 프로퍼티 | 구조화된 rule_logic JSON | Claude Sonnet |
| AI 보조 명령 (Phase 3) | 자연어 + 현재 노드 + 1홉 컨텍스트 | 변경사항 JSON | Claude Sonnet |
| 관계 자동 제안 | 신규 인스턴스 데이터 | 추천 관계 배열 | Claude Haiku |

**프롬프트 컨텍스트 전략** (전체 온톨로지를 넣지 않음):
- 새 노드 생성: 기존 클래스 목록 + 관계 타입 목록
- AI 보조: 선택된 노드 + 1홉 연결 노드 + 해당 프로퍼티/인스턴스
- 공리 해석: 관련 클래스 프로퍼티 + 기존 공리 목록

### 10.4 Neo4j 푸시 로직 (Phase 2)

1. `commits`에서 `pushed_to_neo4j = false`인 커밋 조회
2. `commit_details`에서 변경사항 추출
3. 각 변경사항을 Cypher 구문으로 변환:
   ```cypher
   // 클래스 생성
   CREATE (n:Class {id: $id, name: $name, description: $desc})

   // is-a 관계
   MATCH (child:Class {id: $childId}), (parent:Class {id: $parentId})
   CREATE (child)-[:IS_A]->(parent)

   // 인스턴스 생성
   CREATE (n:Instance {id: $id, name: $name})
   SET n += $properties

   // 관계 생성
   MATCH (a {id: $sourceId}), (b {id: $targetId})
   CREATE (a)-[:$relType]->(b)
   ```
4. Neo4j에 트랜잭션 실행
5. 성공 시 `pushed_to_neo4j = true` + `pushed_at` 업데이트
6. 실패 시 트랜잭션 롤백 + 에러 반환

---

## 11. 구현 우선순위

### Phase 1 (MVP) — 구현 완료 ✓

| # | 기능 | 상태 |
|---|------|------|
| P0-1 | Supabase 스키마 마이그레이션 (10개 테이블) | ✓ |
| P0-2 | Drizzle ORM 스키마 정의 | ✓ |
| P0-3 | 디자인 시스템 (shadcn/ui + Tailwind) | ✓ |
| P0-4 | 3단 레이아웃 + Toolbar + Commit Bar | ✓ |
| P0-5 | Graph Canvas (React Flow 12 + ELKjs) | ✓ |
| P0-6 | Explorer 트리 (계층 + 검색 + 캔버스 동기화) | ✓ |
| P0-7 | Right Panel (6개 섹션 읽기/쓰기) | ✓ |
| P0-8 | Zustand 스토어 (슬라이스 + zundo + immer) | ✓ |
| P1-1 | 새 노드 생성 팝오버 | ✓ |
| P1-2 | LLM 자유 입력 구조화 | ✓ |
| P1-3 | HITL 프리뷰 팝오버 | ✓ |
| P1-4 | Right Panel 편집 (쓰기) | ✓ |
| P1-5 | React Query 데이터 동기화 + Optimistic UI | ✓ |
| P2-1 | 드래그 관계 연결 + 관계 팝오버 | ✓ |
| P2-2 | 계층 이동 (D&D) + 순환 참조 방지 | ✓ |
| P2-3 | Commit Bar (변경 추적 + diff 뷰 + 커밋) | ✓ |
| P2-4 | 노드/엣지 삭제 + cascade 확인 | ✓ |
| P2-5 | 키보드 단축키 (Ctrl+Z/Y, Delete, Esc) | ✓ |
| P2-6 | 전체 CRUD API (15개 엔드포인트) | ✓ |

### Phase 2 — 다음 스프린트

| # | 기능 | 의존성 | 소요 예상 |
|---|------|--------|----------|
| F2-1 | Neo4j 연결 + Cypher 자동 생성 | neo4j-driver 설정 | 핵심 |
| F2-2 | Neo4j 푸시 확인 UI (시트) | F2-1 | 핵심 |
| F2-3 | Neo4j 롤백 | F2-1 | 높음 |
| F2-4 | 빈 캔버스 Empty State | 없음 | 중간 |
| F2-5 | 검색 → 캔버스 포커스 | 없음 | 중간 |
| F2-6 | MiniMap | 없음 | 낮음 |
| F2-7 | 로딩 스켈레톤 | 없음 | 낮음 |
| F2-8 | sonner 토스트 교체 | 없음 | 낮음 |
| F2-9 | 에러 처리 전략 통합 | F2-1 | 높음 |
| F2-10 | 다크모드 CSS 변수 | 없음 | 중간 |
| F2-11 | 대량 임포트 진행률 | 없음 | 중간 |
| F2-12 | Level of Detail (줌 기반) | 없음 | 중간 |

### Phase 3 — 로드맵

| # | 기능 | 비고 |
|---|------|------|
| F3-1 | Chat-to-Edit AI 어시스턴트 | RightPanel LLM 연동 |
| F3-2 | Axiom 자동 번역 | 자연어 → rule_logic |
| F3-3 | 파일 첨부 파싱 강화 | CSV, PDF |
| F3-4 | 컨텍스트 유지 고도화 | Semantic similarity |
| F3-5 | GraphRAG 벡터 인덱싱 | Neo4j 벡터 인덱스 |
| F3-6 | 온톨로지 Export | OWL/RDF/JSON-LD |
| F3-7 | 온톨로지 템플릿 | 도메인별 프리셋 |
| F3-8 | 키보드 단축키 확장 | Ctrl+F, /, Space |
| F3-9 | Explorer 가상 스크롤 | @tanstack/react-virtual |
| F3-10 | URL 상태 동기화 | nuqs |
| F3-11 | 캔버스 파일 D&D | 파일 직접 드래그 |
| F3-12 | 노드 그룹핑/클러스터 | 접기/펼치기 |

---

## 12. 성공 지표 (KPI)

### 정량 지표

| KPI | 목표 | 측정 방법 |
|-----|------|----------|
| 온톨로지 생성 시간 | 텍스트 입력 → 10개 노드 그래프 5분 이내 | 사용자 행동 로그 |
| LLM 구조화 정확도 | 프리뷰에서 삭제/수정 비율 20% 이하 | 확정 vs 삭제 비율 추적 |
| Neo4j 푸시 성공률 | 95% 이상 | 푸시 성공/실패 로그 |
| 에러 발생률 | 세션당 치명적 에러 0건 | 에러 추적 |

### 정성 지표

| KPI | 목표 | 측정 방법 |
|-----|------|----------|
| 학습 곡선 | 30분 내 기본 온톨로지 생성 가능 | 사용자 피드백 |
| 만족도 | "코딩 없이 그래프가 만들어진다" 체감 | 사용자 인터뷰 |
| 신뢰도 | "AI가 제안한 구조가 내 의도와 맞다" 체감 | HITL 확정 비율 |

---

## 범위 밖 (Not in Scope)

- 다중 사용자 동시 편집 / 충돌 해소
- 권한 관리 (RBAC)
- 온톨로지 버전 브랜칭 (git branch)
- 자동 공리 발견 (문서 축적 기반 LLM 패턴 감지)
- 대규모 그래프 성능 최적화 (WebGL)
- 모바일 대응
- Biome/Ultracite 마이그레이션 (post-MVP 안정화 시)
