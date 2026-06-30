# Ontology Studio — MVP PRD + UI 화면지시서

> **Version**: 0.1 MVP
> **Author**: Aiden (PSK PEE Team)
> **Date**: 2026-03-20
> **Tech Stack**: Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui + React Flow 12 + ELKjs + Zustand + Supabase + Neo4j + Claude API

---

## 1. 제품 개요

### 1.1 한 줄 요약

도메인 전문가가 코드/쿼리 없이, 자기 업무 지식만으로 온톨로지를 구축할 수 있는 그래프 편집 스튜디오.

### 1.2 핵심 가치

사용자는 "클래스", "인스턴스", "공리"라는 용어를 한 번도 쓰지 않아도 된다. 자기가 아는 것을 쏟아붓고, LLM이 구조화한 결과를 교정하고, 승인하는 것만으로 온톨로지가 만들어진다.

### 1.3 아키텍처 컨셉 — "온톨로지의 Git"

```
┌─────────────────────────────────────────┐
│  Layer 1: 온톨로지 스튜디오 (Frontend)    │
│  사용자 조작 + LLM 보조                   │
│  Next.js + React Flow + shadcn/ui            │
└──────────────┬──────────────────────────┘
               │ 변경사항 저장
               ▼
┌─────────────────────────────────────────┐
│  Layer 2: 스테이징 (Supabase)            │
│  커밋 로그, 변경 이력, 롤백 포인트         │
│  온톨로지 CRUD 테이블                     │
└──────────────┬──────────────────────────┘
               │ 확정분만 푸시
               ▼
┌─────────────────────────────────────────┐
│  Layer 3: 프로덕션 (Neo4j)               │
│  확정된 온톨로지 그래프                    │
│  벡터 인덱스 + Cypher 탐색               │
│  myATHENA 런타임 참조 대상               │
└─────────────────────────────────────────┘
```

### 1.4 사용자

Aiden 1인 사용. 병렬 처리, 권한 관리, 충돌 해소는 MVP 범위 밖.

---

## 2. 사용자 여정 (User Journey)

### Journey 1: 최초 온톨로지 생성 (Knowledge Dump)

1. 사용자가 캔버스 빈 공간을 **더블클릭**
2. 마우스 위치 근처에 **팝오버** 등장
3. 자유 형식으로 입력 (이름 하나, 장비 목록 텍스트, CSV 붙여넣기, 파일 첨부 — 형식 제한 없음)
4. [생성] 클릭 → LLM이 입력을 분석하여 클래스/프로퍼티/인스턴스/관계를 자동 추출
5. 팝오버가 **프리뷰 모드**로 전환: "이렇게 구조화했습니다" + 그래프 미리보기
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
2. "하위 클래스로 설정할까요?" 확인 팝오버
3. [확정] → is-a 관계 자동 생성, Explorer 트리 업데이트

### Journey 5: Neo4j 푸시

1. 하단 커밋 바에서 [변경 내역] 클릭 → diff 뷰 확인
2. [Neo4j 푸시] 클릭 → Cypher 자동 생성 + 실행
3. 변경분만 프로덕션 그래프에 반영

### Journey 6: 점진적 확장

1. 다음 방문 시 기존 그래프가 로드됨
2. 새 데이터를 더블클릭으로 추가 → LLM이 기존 온톨로지 컨텍스트를 참조하여 구조화
3. "기존에 정의된 관계/클래스가 있으면 재사용" → 중복 방지

---

## 3. 화면 구조 (Layout)

### 3.1 전체 레이아웃

```
┌──────────┬──────────────────────────────────┬────────────┐
│          │          Toolbar                  │            │
│          ├──────────────────────────────────┤            │
│ Explorer │                                  │   Right    │
│ (트리)   │       Graph Canvas               │   Panel    │
│          │       (그래프 시각화)              │  (노드상세) │
│  260px   │                                  │   320px    │
│          │                                  │            │
│          ├──────────────────────────────────┤            │
│          │          Commit Bar               │            │
└──────────┴──────────────────────────────────┴────────────┘
```

- **Explorer**: 좌측 고정 260px
- **Graph Canvas**: 가운데 가변폭, flex: 1
- **Right Panel**: 우측 고정 320px (노드 미선택 시 숨김 가능)
- **Toolbar**: Canvas 상단 고정 46px
- **Commit Bar**: Canvas 하단 고정 38px

### 3.2 디자인 토큰

| 토큰 | 값 | 용도 |
|------|-----|------|
| Background | `#fafafa` | 전체 배경 |
| Card | `#ffffff` | 패널, 팝오버 배경 |
| Border | `#e4e4e7` | 구분선 |
| Text Primary | `#18181b` | 본문 |
| Text Secondary | `#52525b` | 보조 텍스트 |
| Text Muted | `#a1a1aa` | 비활성 텍스트 |
| Accent | `#7c3aed` | 보라 (선택, 강조) |
| Accent Light | `#ede9fe` | 보라 배경 |
| Font | Outfit | 본문 폰트 |
| Mono | JetBrains Mono | 코드, 수치 |
| Border Radius | 10px | 카드, 팝오버 |
| Shadow | `0 4px 16px rgba(0,0,0,0.08)` | 카드 그림자 |

### 3.3 노드 색상 체계

| 노드 타입 | 색상 | HEX | 용도 |
|-----------|------|-----|------|
| 루트/핵심 클래스 | Purple | `#7c3aed` | Equipment 등 최상위 |
| 중간 클래스 | Blue | `#2563eb` | DryAsher, WetStation |
| 하위 모델 | Cyan | `#0891b2` | SUPRA, GENEVA |
| 인스턴스 | Green | `#86efac` (연한) | SP-001 등 실체 |
| 사람 | Amber | `#d97706` | Engineer |
| 장소 | Red | `#dc2626` | Site |
| 이벤트 | Pink | `#db2777` | FailureEvent |
| 비어있는 노드 | 해당 색상 + 점선 + opacity 0.35 | | 인스턴스 없는 클래스 |

---

## 4. 화면 상세 — Explorer (좌측 패널)

### 4.1 구성

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

### 4.2 인터랙션

| 동작 | 결과 |
|------|------|
| 트리 아이템 클릭 | 캔버스에서 해당 노드 선택 + 우측 패널 내용 교체 |
| ▶ 캐럿 클릭 | 하위 트리 접기/펼치기 (노드 선택 변경 없음) |
| 검색 입력 | 클래스/인스턴스 이름 필터링 |

### 4.3 시각 규칙

- **클래스 노드**: ● 색상 dot + 굵은 이름 + 인스턴스 카운트 `(N)`
- **인스턴스 노드**: ○ 연한 green dot + 보조 색상 이름 (text-secondary)
- **비어있는 클래스**: dot에 opacity 0.5 + 이름 muted 색상
- **들여쓰기**: 레벨당 18px padding-left

---

## 5. 화면 상세 — Graph Canvas (가운데)

### 5.1 Toolbar

```
┌────────────────────────────────────────────────┐
│  PSK PEE Ontology   [v0.1 draft]     [Import]  │
└────────────────────────────────────────────────┘
```

| 요소 | 설명 |
|------|------|
| 타이틀 | 온톨로지 이름 + 버전 배지 |
| [Import] | 클릭 시 팝오버 (= 새 노드 생성과 동일한 자유 입력 팝오버) |

### 5.2 캔버스 영역

**배경**: `#fafafa` + 도트 그리드 (20px 간격, `#d4d4d8`, opacity 0.5)

**노드 렌더링 규칙**:
- 원형 노드: 연한 배경 fill (색상 opacity 0.12) + 컬러 테두리 (stroke-width: 1.2~1.5)
- 선택된 노드: accent 색상 stroke (2.5px) + 외곽 glow
- 빈 클래스: 점선 테두리 (stroke-dasharray: 4 3) + 전체 opacity 0.35
- 노드 내부 텍스트: 클래스 이름 (굵게) + 인스턴스 수 (mono, 작게)
- 노드 크기: 인스턴스 수에 비례 (최소 r=22, 최대 r=40)

**엣지 렌더링 규칙**:
- 실선: `#d4d4d8`, stroke-width 1.4
- 선택된 노드의 연결선: accent-mid 색상 (`#c4b5fd`), stroke-width 2
- 빈 클래스와의 연결: 점선 (stroke-dasharray: 4 4), opacity 0.3
- 엣지 라벨: mono 폰트, 9.5px, muted 색상, 선의 중간에 위치

### 5.3 캔버스 인터랙션

| 동작 | 결과 |
|------|------|
| 노드 클릭 | 노드 선택 → Explorer 트리 동기화 + 우측 패널 교체 |
| 노드 호버 | 노드 그림자 강화 |
| 캔버스 빈 공간 더블클릭 | 새 노드 팝오버 (마우스 위치 근처) |
| 노드 → 노드 드래그 | 관계 연결 (드래그 중 점선, 드롭 시 관계 팝오버) |
| 노드를 다른 노드 위에 드롭 | 계층 이동 확인 팝오버 |
| 캔버스 빈 공간 드래그 | 캔버스 패닝 |
| 스크롤 휠 | 줌 인/아웃 |
| Esc | 팝오버 닫기 |

### 5.4 하단 힌트 바

```
[더블클릭] 새 노드  ·  [드래그] 관계 연결
```

항상 캔버스 하단 중앙에 표시. 반투명, 방해되지 않는 수준.

### 5.5 줌 컨트롤

캔버스 우하단. [-] [100%] [+] 형태.

---

## 6. 화면 상세 — Right Panel (우측 패널)

### 6.1 구조 (노드 선택 시)

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

### 6.2 섹션 순서 (중요: 이전 논의에서 확정)

| 순서 | 섹션 | 기본 상태 | 이유 |
|------|------|----------|------|
| 1 | Description | 항상 표시 (접기 없음) | "이게 뭔데?" 즉시 답 |
| 2 | Subclasses | 펼침 | 구조 파악이 우선 |
| 3 | Properties | 펼침 | 클래스 특성 확인 |
| 4 | Relations | 펼침 | 다른 노드와의 연결 |
| 5 | Constraints | **접힘** | 규칙은 필요 시 확인 |
| 6 | Instances | **접힘** | 데이터가 많을 수 있으므로 기본 접힘 |

### 6.3 중요 규칙: 스코프

**해당 노드의 "직속" 정보만 표시한다.**

- Equipment 클릭 시 → Subclasses에 DryAsher, WetStation만 표시 (손자 노드 SUPRA 안 보임)
- Equipment 클릭 시 → Instances에 Equipment 직접 속한 인스턴스만 (하위 클래스의 인스턴스 안 보임)
- SUPRA 클릭 시 → Subclasses에 SUPRA XP, nXP, Lite 표시
- SUPRA 클릭 시 → Instances에 SP-001, SP-002 등 SUPRA 직속만

### 6.4 각 섹션 상세

**Description**
- 자유 텍스트 영역. 클릭하면 인라인 편집 가능.
- LLM이 노드 생성 시 자동 생성한 설명. 사용자가 수정 가능.

**Subclasses**
- 각 항목: 색상 dot + 이름
- 클릭 시 해당 노드로 이동 (패널 교체 + 캔버스 포커스)
- [+ 하위 클래스 추가]: 클릭 → 인라인 입력 필드 또는 팝오버

**Properties**
- 각 항목: `property_name` (mono, accent 색상) + `type` (badge) + flag (있으면)
- flag 종류: `required`, `택1` (enum), 범위 제한 등
- [+ 프로퍼티 추가]: 클릭 → 인라인 행 추가 (이름 + 타입 드롭다운)

**Relations**
- 각 항목: 방향 화살표 (`→` outgoing, `←` incoming) + 관계 타입 (cyan badge) + 대상 노드 이름 + 건수
- 대상 노드 이름 클릭 → 해당 노드로 이동
- [+ 관계 추가]: 클릭 → 관계 팔레트 드롭다운 (기존 관계 재사용) + 대상 노드 선택

**Constraints**
- 각 항목: ⚠️ 아이콘 + 자연어 설명
- 단순 제약 (enum, range, required)은 Properties에서 flag로 이미 표시 → 여기에는 **복합 공리**만
- 예: "PM주기 90일 미만 → High Risk", "FailureEvent는 반드시 Equipment에 연결"
- [+ 제약조건 추가]: 자연어 입력 → LLM이 해석하여 구조화

**Instances**
- 테이블 형식: 컬럼 = Properties에서 정의된 속성들
- Status 같은 enum은 컬러 badge로 표시
- [+ 인스턴스 추가]: 클릭 → 텍스트/CSV 자유 입력 팝오버 → LLM 파싱 → 프리뷰 → 확정

### 6.5 AI 보조 입력창

패널 최하단에 항상 상주. 텍스트 입력 → Enter로 전송.

용도:
- "ECOLITE 모델도 추가해줘" → 하위 클래스 자동 추가
- "이 장비의 PM 주기는 보통 90일이야" → 프로퍼티 추가 제안
- "status에 '이관' 상태도 추가해" → enum 값 추가

AI 응답은 패널 내 관련 섹션에 **제안 항목**으로 나타나고 (배경색 구분), 사용자가 [확정] 또는 [삭제]할 수 있다.

---

## 7. 화면 상세 — 팝오버 (Popover)

### 7.1 공통 규칙

- 모든 팝오버는 **트리거 위치 근처**에 뜬다 (모달 아님)
- 캔버스 밖으로 넘어가면 반대쪽에 위치 보정
- Esc 또는 팝오버 바깥 클릭으로 닫기
- 최대 너비 360px
- 배경: `#ffffff`, border-radius 12px, shadow-lg

### 7.2 새 노드 생성 팝오버

**트리거**: 캔버스 더블클릭, [Import] 버튼 클릭

**Phase 1 — 입력**:
```
┌─ 새 노드 ──────────────────────┐
│                                  │
│  ┌────────────────────────────┐ │
│  │ (자유 입력 textarea)        │ │
│  │                            │ │
│  └────────────────────────────┘ │
│  형식 제한 없음 — LLM이 자동    │
│  구조화합니다                    │
│                                  │
│  [📎 파일]  [📋 붙여넣기]        │
│                                  │
│          [취소]  [생성 →]        │
└──────────────────────────────────┘
```

**Phase 2 — 프리뷰** ([생성] 클릭 후 같은 팝오버 내에서 전환):
```
┌─ 구조화 결과 ──────────────────┐
│                                  │
│  📦 클래스 2개                    │
│    + WetStation → Equipment      │
│    + Chemical                    │
│                                  │
│  📋 프로퍼티 3개                  │
│    + chemical_type: string       │
│    + tank_count: integer         │
│    + temperature: float          │ ← [삭제]
│                                  │
│  🔗 관계 1개                      │
│    + uses → Chemical             │
│                                  │
│  📊 인스턴스 4개                  │
│    WS-001, WS-002, WS-003...    │
│                                  │
│        [← 수정]  [확정 ✓]        │
└──────────────────────────────────┘
```

- 각 항목에 [삭제] 버튼 (인라인, hover 시 표시)
- 이름 클릭 시 인라인 편집 가능
- [← 수정]: Phase 1로 돌아감
- [확정]: 캔버스에 노드/엣지 일괄 생성

### 7.3 관계 연결 팝오버

**트리거**: 노드 → 노드 드래그 완료

```
┌─ 관계 설정 ────────────────────┐
│                                  │
│  SUPRA  ───?───→  Engineer       │
│                                  │
│  기존 관계:                      │
│  ○ assigned_to                   │
│  ○ maintained_by                 │
│  ○ located_at                    │
│                                  │
│  또는 새로 입력:                  │
│  ┌────────────────────────────┐ │
│  │                            │ │
│  └────────────────────────────┘ │
│                                  │
│          [취소]  [연결]          │
└──────────────────────────────────┘
```

- 기존 관계 라디오 버튼으로 선택
- 새 관계 입력 시 자동으로 관계 팔레트에 추가
- 관계 방향은 드래그 방향 기준 (A→B)

### 7.4 계층 이동 확인 팝오버

**트리거**: 노드를 다른 노드 위에 드롭

```
┌─────────────────────────────────┐
│  SUPRA Lite를 SUPRA의            │
│  하위로 이동할까요?               │
│                                  │
│  DryAsher                        │
│  └── SUPRA                       │
│      ├── SUPRA XP                │
│      ├── SUPRA nXP               │
│      └── SUPRA Lite (new)        │
│                                  │
│          [취소]  [확정]           │
└─────────────────────────────────┘
```

---

## 8. 화면 상세 — Commit Bar

### 8.1 구조

```
┌──────────────────────────────────────────────────────┐
│  ● 변경사항 7건   +5 class · +2 rel   [되돌리기] [변경 내역] [Neo4j 푸시] │
└──────────────────────────────────────────────────────┘
```

| 요소 | 설명 |
|------|------|
| ● (amber 점) | 미커밋 변경 존재 시 깜빡임 |
| 변경사항 N건 | 총 변경 수 (ADD + MOD + DEL) |
| +N class · +N rel | 유형별 요약 (mono 폰트, muted 색상) |
| [되돌리기] | 마지막 변경 1건 undo |
| [변경 내역] | diff 뷰 팝업 또는 사이드시트 |
| [Neo4j 푸시] | 전체 변경을 프로덕션에 반영. 초록색 버튼. |

### 8.2 변경 내역 뷰

[변경 내역] 클릭 시 캔버스 위에 오버레이 또는 패널로 표시:

```
┌─ 변경 내역 ────────────────────────────┐
│                                         │
│  + [ADD] Class: WetStation              │
│  + [ADD] Property: chemical_type        │
│  + [ADD] Relation: uses → Chemical      │
│  ~ [MOD] Equipment: 설명 수정            │
│  - [DEL] Property: old_field 삭제        │
│                                         │
│  [전체 푸시]               [닫기]        │
└─────────────────────────────────────────┘
```

- ADD: 초록, MOD: amber, DEL: 빨강 색상 코드
- 각 항목 hover 시 상세 내용 표시

---

## 9. Supabase 스키마 (스테이징 DB)

> **설계 원칙**: 단순 테이블 나열이 아닌, 관계형 DB 정규화 원칙에 따라 설계한다. FK 제약, UNIQUE 제약, CHECK 제약, 인덱스를 명시하고, 테이블 간 관계를 ER 다이어그램으로 표현한다.

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
       │
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
│    name          │  │ 1:N│ FK relation_type_id│──→ relation_types.id
│    description   │  └────│ FK source_id       │──→ (classes OR instances).id
│    source_class_id│─→    │ FK target_id       │──→ (classes OR instances).id
│    target_class_id│─→    │    source_kind     │  ('class' | 'instance')
│    created_at    │       │    target_kind     │  ('class' | 'instance')
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
│    pushed_to_neo4j│ └────│    operation       │  ('ADD'|'MOD'|'DEL')
│    pushed_at     │       │    target_table    │
│    created_at    │       │    target_id       │
│                  │       │    before_snapshot │
│                  │       │    after_snapshot  │
└──────────────────┘       └────────────────────┘
```

### 9.2 테이블 상세

#### `classes` — 온톨로지 클래스 (계층 구조)

```sql
CREATE TABLE classes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   uuid REFERENCES classes(id) ON DELETE SET NULL,
  name        text NOT NULL,
  description text DEFAULT '',
  color       text NOT NULL DEFAULT '#7c3aed'
                   CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  position_x  float NOT NULL DEFAULT 0,
  position_y  float NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_class_name_per_parent
    UNIQUE (parent_id, name)
);

CREATE INDEX idx_classes_parent ON classes(parent_id);
```

설계 포인트:
- `parent_id` 자기참조 FK로 is-a 계층 표현 (Adjacency List 패턴)
- `ON DELETE SET NULL`: 부모 삭제 시 자식이 루트로 승격 (고아 방지)
- `UNIQUE (parent_id, name)`: 같은 부모 밑에 동명 클래스 금지
- `color` CHECK 제약으로 HEX 형식 강제

#### `properties` — 클래스 프로퍼티 정의

```sql
CREATE TABLE properties (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name            text NOT NULL,
  data_type       text NOT NULL DEFAULT 'string'
                       CHECK (data_type IN (
                         'string','integer','float','boolean','date','enum'
                       )),
  is_required     boolean NOT NULL DEFAULT false,
  enum_values     jsonb DEFAULT NULL
                       CHECK (
                         data_type != 'enum' OR 
                         (enum_values IS NOT NULL AND jsonb_array_length(enum_values) > 0)
                       ),
  constraint_rule jsonb DEFAULT NULL,
  sort_order      integer NOT NULL DEFAULT 0,

  CONSTRAINT uq_property_per_class
    UNIQUE (class_id, name)
);

CREATE INDEX idx_properties_class ON properties(class_id);
```

설계 포인트:
- `ON DELETE CASCADE`: 클래스 삭제 시 프로퍼티도 함께 삭제
- `data_type` CHECK로 허용 타입만 입력 가능
- `enum_values` 조건부 CHECK: data_type이 'enum'이면 반드시 1개 이상의 값 필요
- `UNIQUE (class_id, name)`: 같은 클래스 내 동명 프로퍼티 금지
- `sort_order`: 패널에서 프로퍼티 표시 순서 제어

#### `instances` — 인스턴스 (클래스의 실체)

```sql
CREATE TABLE instances (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_instance_name_per_class
    UNIQUE (class_id, name)
);

CREATE INDEX idx_instances_class ON instances(class_id);
```

설계 포인트:
- 인스턴스의 속성값은 별도 `instance_values` 테이블에 EAV 패턴으로 저장 (아래 참조)
- `properties` jsonb 컬럼 대신 정규화한 이유: 프로퍼티별 타입 검증, 프로퍼티 추가/삭제 시 일관성 유지, 쿼리 시 특정 프로퍼티 값으로 필터링 가능

#### `instance_values` — 인스턴스별 프로퍼티 값 (EAV)

```sql
CREATE TABLE instance_values (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id   uuid NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  value         text,

  CONSTRAINT uq_value_per_instance_property
    UNIQUE (instance_id, property_id)
);

CREATE INDEX idx_ival_instance ON instance_values(instance_id);
CREATE INDEX idx_ival_property ON instance_values(property_id);
```

설계 포인트:
- EAV(Entity-Attribute-Value) 패턴으로 동적 스키마 지원
- `value`를 text로 저장하고, 앱 레벨에서 `properties.data_type`에 따라 파싱/검증
- `UNIQUE (instance_id, property_id)`: 하나의 인스턴스에 같은 프로퍼티 값은 하나만
- 양쪽 FK 모두 `CASCADE`: 인스턴스 또는 프로퍼티 삭제 시 값도 자동 삭제

#### `relation_types` — 관계 타입 정의 (팔레트)

```sql
CREATE TABLE relation_types (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL UNIQUE,
  description      text DEFAULT '',
  source_class_id  uuid REFERENCES classes(id) ON DELETE SET NULL,
  target_class_id  uuid REFERENCES classes(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
```

설계 포인트:
- `name UNIQUE`: 관계 타입 이름은 전역 유일 (재사용의 핵심)
- `source/target_class_id`: 이 관계가 "어떤 클래스 간에" 유효한지 스키마 수준 힌트 (nullable — 범용 관계도 허용)
- `ON DELETE SET NULL`: 클래스 삭제해도 관계 타입 자체는 보존

#### `edges` — 실제 연결 (관계 인스턴스)

```sql
CREATE TABLE edges (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relation_type_id  uuid NOT NULL REFERENCES relation_types(id) ON DELETE CASCADE,
  source_id         uuid NOT NULL,
  target_id         uuid NOT NULL,
  source_kind       text NOT NULL CHECK (source_kind IN ('class', 'instance')),
  target_kind       text NOT NULL CHECK (target_kind IN ('class', 'instance')),
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_edge
    UNIQUE (relation_type_id, source_id, target_id),
  CONSTRAINT chk_no_self_loop
    CHECK (source_id != target_id)
);

CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
CREATE INDEX idx_edges_relation ON edges(relation_type_id);
```

설계 포인트:
- `source_kind`/`target_kind`: 폴리모픽 FK — 클래스 간 관계와 인스턴스 간 관계를 하나의 테이블로 처리
- `UNIQUE (relation_type_id, source_id, target_id)`: 동일 관계 중복 방지
- `CHECK (source_id != target_id)`: 자기 자신에게 연결 금지
- `ON DELETE CASCADE`: 관계 타입 삭제 시 해당 타입의 모든 엣지도 삭제

#### `axioms` — 공리 / 제약조건

```sql
CREATE TABLE axioms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  rule_logic  jsonb NOT NULL DEFAULT '{}',
  severity    text NOT NULL DEFAULT 'warning'
                   CHECK (severity IN ('info', 'warning', 'error')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

#### `axiom_classes` — 공리 ↔ 클래스 매핑 (M:N)

```sql
CREATE TABLE axiom_classes (
  axiom_id  uuid NOT NULL REFERENCES axioms(id) ON DELETE CASCADE,
  class_id  uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (axiom_id, class_id)
);

CREATE INDEX idx_ac_class ON axiom_classes(class_id);
```

설계 포인트:
- 이전 설계의 `related_classes uuid[]` 배열 → 정규화된 M:N 조인 테이블로 변경
- 복합 PK로 중복 방지
- 양쪽 CASCADE: 공리 또는 클래스 삭제 시 매핑 자동 정리

#### `commits` — 커밋 로그 (Git 히스토리)

```sql
CREATE TABLE commits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message         text DEFAULT '',
  pushed_to_neo4j boolean NOT NULL DEFAULT false,
  pushed_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

#### `commit_details` — 커밋별 변경사항 (1:N 정규화)

```sql
CREATE TABLE commit_details (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commit_id       uuid NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
  operation       text NOT NULL CHECK (operation IN ('ADD', 'MOD', 'DEL')),
  target_table    text NOT NULL,
  target_id       uuid NOT NULL,
  before_snapshot jsonb,
  after_snapshot  jsonb
);

CREATE INDEX idx_cd_commit ON commit_details(commit_id);
```

설계 포인트:
- 이전 설계의 `changes jsonb` 단일 컬럼 → 정규화된 1:N 테이블로 변경
- 개별 변경사항을 독립 행으로 저장하여 필터링/집계 가능 (예: "이번 커밋에서 ADD된 클래스만 조회")
- `before_snapshot`/`after_snapshot`: 롤백 시 이전 상태 복원에 사용
- `target_table` + `target_id`로 어떤 테이블의 어떤 행이 변경되었는지 추적

### 9.3 `updated_at` 자동 갱신 트리거

```sql
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_classes_updated
  BEFORE UPDATE ON classes
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_instances_updated
  BEFORE UPDATE ON instances
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
```

### 9.4 RLS 정책

1인 사용이므로 RLS 비활성화:

```sql
ALTER TABLE classes DISABLE ROW LEVEL SECURITY;
ALTER TABLE properties DISABLE ROW LEVEL SECURITY;
ALTER TABLE instances DISABLE ROW LEVEL SECURITY;
ALTER TABLE instance_values DISABLE ROW LEVEL SECURITY;
ALTER TABLE relation_types DISABLE ROW LEVEL SECURITY;
ALTER TABLE edges DISABLE ROW LEVEL SECURITY;
ALTER TABLE axioms DISABLE ROW LEVEL SECURITY;
ALTER TABLE axiom_classes DISABLE ROW LEVEL SECURITY;
ALTER TABLE commits DISABLE ROW LEVEL SECURITY;
ALTER TABLE commit_details DISABLE ROW LEVEL SECURITY;
```

---

## 10. Neo4j 연동

### 10.1 푸시 로직

1. `ontology_commits`에서 `pushed_to_neo4j = false`인 커밋 조회
2. 각 변경사항을 Cypher 구문으로 변환
3. Neo4j에 트랜잭션 실행
4. 성공 시 `pushed_to_neo4j = true` + `pushed_at` 업데이트

### 10.2 Cypher 매핑 예시

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

### 10.3 벡터 인덱스

```cypher
// 노드 이름/설명 임베딩 저장
CREATE VECTOR INDEX ontology_embedding
FOR (n:Class) ON (n.embedding)
OPTIONS {indexConfig: {
  `vector.dimensions`: 1536,
  `vector.similarity_function`: 'cosine'
}}
```

---

## 11. LLM 통합

### 11.1 사용 지점

| 기능 | 입력 | 출력 | 모델 |
|------|------|------|------|
| 자유 입력 구조화 | 사용자 텍스트/CSV | 클래스/프로퍼티/인스턴스/관계 JSON | Claude Sonnet |
| 노드 설명 생성 | 노드 이름 + 컨텍스트 | 자연어 설명 | Claude Haiku |
| 공리 해석 | 자연어 제약 | 구조화된 rule_logic JSON | Claude Sonnet |
| AI 보조 명령 | 자연어 + 현재 노드 컨텍스트 | 변경사항 JSON | Claude Sonnet |
| 관계 자동 제안 | 신규 인스턴스 데이터 | 추천 관계 배열 | Claude Haiku |

### 11.2 프롬프트 컨텍스트 전략

LLM 호출 시 전체 온톨로지를 넣지 않는다. 필요한 범위만:

- **새 노드 생성**: 기존 클래스 목록 + 관계 타입 목록 (중복 방지)
- **AI 보조**: 선택된 노드 + 직접 연결된 노드 1홉 + 해당 클래스의 프로퍼티/인스턴스
- **공리 해석**: 관련 클래스들의 프로퍼티 + 기존 공리 목록

---

## 12. MVP 구현 우선순위

| Phase | 항목 | 설명 | 중요도 |
|-------|------|------|--------|
| **P0** | Supabase 스키마 | 7개 테이블 생성 | 🔴 |
| **P0** | 그래프 캔버스 렌더링 | React Flow 12 + ELKjs 자동 레이아웃, 클릭 선택 | 🔴 |
| **P0** | Explorer 트리 | 계층 트리 + 캔버스 연동 | 🔴 |
| **P0** | 우측 패널 (읽기) | 노드별 상세 정보 표시 | 🔴 |
| **P1** | 새 노드 팝오버 (입력만) | 더블클릭 → 자유 입력 → DB 저장 | 🟡 |
| **P1** | LLM 자동 구조화 | 자유 입력 → 클래스/프로퍼티/인스턴스 추출 | 🟡 |
| **P1** | 팝오버 프리뷰 | 구조화 결과 확인 → 확정 | 🟡 |
| **P1** | 패널 편집 (쓰기) | [+] 버튼으로 직접 추가/수정 | 🟡 |
| **P2** | 드래그 관계 연결 | 노드간 드래그 → 관계 팝오버 | 🟢 |
| **P2** | 커밋 바 + 변경 내역 | 변경 추적 + diff 뷰 | 🟢 |
| **P2** | AI 보조 입력창 | 패널 하단 자연어 → 변경 제안 | 🟢 |
| **P3** | Neo4j 연동 + 푸시 | Cypher 자동 생성 + 실행 | 🔵 |
| **P3** | 롤백 | 커밋 되돌리기 | 🔵 |
| **P3** | 벡터 검색 | Neo4j 벡터 인덱스 연동 | 🔵 |

---

## 13. 범위 밖 (Not MVP)

- 다중 사용자 동시 편집 / 충돌 해소
- 권한 관리 (RBAC)
- 온톨로지 버전 브랜칭 (git branch)
- 자동 공리 발견 (문서 축적 기반 LLM 패턴 감지)
- myATHENA 파이프라인 연동 (L6 자기강화 루프)
- 온톨로지 export (OWL/RDF/YAML)
- 대규모 그래프 성능 최적화 (WebGL)
- 모바일 대응

---

## 14. 기술 스택 상세

### 14.1 Core Framework

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `next` | 15.x | App Router, Server Actions, API Routes |
| `react` / `react-dom` | 19.x | UI 렌더링 |
| `typescript` | 5.x | 타입 안전성 |

### 14.2 UI / 스타일링

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `tailwindcss` | 4.x | 유틸리티 CSS |
| `shadcn/ui` | latest | 컴포넌트 라이브러리 (Button, Popover, Dialog, DropdownMenu, Tooltip, ScrollArea, Separator, Badge, Input, Textarea, Command, Collapsible, Sheet, Table, Tabs) |
| `lucide-react` | latest | **유일한 아이콘 소스** — 프로젝트 전체에서 lucide-react만 사용. 다른 아이콘 라이브러리(heroicons, phosphor, tabler 등) 및 인라인 SVG 아이콘 금지. |
| `framer-motion` | 11.x | 팝오버 등장/퇴장 애니메이션, 패널 전환, 노드 추가 시 bounce 효과 |
| `class-variance-authority` | latest | shadcn 컴포넌트 variant 시스템 |
| `clsx` + `tailwind-merge` | latest | 조건부 className 유틸리티 |

**shadcn/ui 활용 포인트**:
- **Popover**: 새 노드 생성 팝오버, 관계 설정 팝오버 (마우스 위치 기반 positioning)
- **Command** (cmdk): Explorer 검색 + AI 보조 입력의 자동완성
- **Collapsible**: 우측 패널 섹션 접기/펼치기
- **DropdownMenu**: 관계 팔레트 선택
- **Sheet**: 변경 내역 사이드시트
- **Table**: 인스턴스 테이블
- **Tooltip**: 노드 hover 시 요약 정보
- **Badge**: 노드 타입 (CLASS/INSTANCE), 프로퍼티 타입 (string, enum), 상태 (가동/PM/수리)

### 14.3 그래프 엔진

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `@xyflow/react` | 12.x | 그래프 캔버스 (노드 렌더링, 엣지, 줌/패닝, 드래그&드롭, 엣지 드래그 생성) |
| `elkjs` | latest | 자동 레이아웃 엔진 (layered, force, radial 알고리즘) |
| `@dagrejs/dagre` | latest | 경량 트리 레이아웃 (Explorer 계층과 동일 구조 시 사용) |

**React Flow 선택 이유**:
- Next.js/React 네이티브 통합, 커스텀 노드를 React 컴포넌트로 구현 가능
- Source/Target 핸들 시스템으로 노드간 엣지 드래그 생성 내장
- 줌/패닝/미니맵/배경 그리드 내장
- shadcn/ui + Tailwind로 노드 스타일링 가능
- xyflow 공식 Workflow Editor 템플릿이 동일 스택 (Next.js + shadcn + Tailwind + Zustand + ELKjs)

**ELKjs 선택 이유 (dagre 대비)**:
- dagre는 더 이상 활발히 유지보수되지 않음
- ELKjs는 layered, force, radial 등 다양한 알고리즘 지원
- 온톨로지 is-a 계층 + 횡단 관계를 동시에 보여주는 데 layered 알고리즘 적합
- 비동기 실행으로 대규모 그래프에서도 UI 블로킹 없음

**커스텀 노드 타입** (React 컴포넌트로 구현):

```typescript
// 클래스 노드 — 원형, 색상 테두리, 이름 + 인스턴스 수
type ClassNodeData = {
  label: string;
  color: string;
  instanceCount: number;
  isEmpty: boolean;    // 점선 테두리 여부
};

// 인스턴스 노드 — 작은 원, 연한 색상
type InstanceNodeData = {
  label: string;
  parentClass: string;
  status?: string;
};
```

### 14.4 상태 관리

| 패키지 | 용도 |
|--------|------|
| `zustand` | 전역 상태 (선택된 노드, 그래프 데이터, 변경사항 추적, 팝오버 상태) |
| `@tanstack/react-query` | Supabase 데이터 페칭/캐싱/동기화 |
| `immer` | zustand 미들웨어로 불변성 관리 (온톨로지 트리 구조 업데이트 시) |

**Zustand 스토어 구조**:

```typescript
interface OntologyStore {
  // 그래프 데이터
  classes: OntologyClass[];
  instances: OntologyInstance[];
  relations: OntologyRelation[];
  edges: OntologyEdge[];
  axioms: OntologyAxiom[];

  // UI 상태
  selectedNodeId: string | null;
  pendingChanges: Change[];
  
  // 액션
  selectNode: (id: string) => void;
  addClass: (data: Partial<OntologyClass>) => void;
  addInstance: (data: Partial<OntologyInstance>) => void;
  addRelation: (data: Partial<OntologyRelation>) => void;
  commitChanges: () => void;
  undoLastChange: () => void;
}
```

### 14.5 폼 / 유효성 검증

| 패키지 | 용도 |
|--------|------|
| `zod` | 스키마 정의 + 유효성 검증 (프로퍼티 타입, enum 값, 제약조건) |
| `react-hook-form` | 폼 상태 관리 (우측 패널 프로퍼티 편집, 팝오버 입력) |
| `@hookform/resolvers` | zod + react-hook-form 연동 |

**Zod 스키마 예시**:

```typescript
const PropertySchema = z.object({
  name: z.string().min(1, "이름 필수"),
  dataType: z.enum(["string", "integer", "float", "date", "boolean", "enum"]),
  isRequired: z.boolean().default(false),
  enumValues: z.array(z.string()).optional(),
});

const ClassSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  parentId: z.string().uuid().nullable(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});
```

### 14.6 리치 텍스트 / 편집기

| 패키지 | 용도 |
|--------|------|
| `@tiptap/react` + `@tiptap/starter-kit` | 노드 Description 편집 (인라인 마크다운 지원) |
| `@tiptap/extension-placeholder` | 빈 상태 placeholder 텍스트 |

Description 섹션에서 클릭하면 tiptap 에디터로 전환. 볼드/이탤릭/링크 정도의 가벼운 포맷팅만 지원. 복잡한 에디터가 아니라 인라인 편집 수준.

### 14.7 백엔드 / 데이터베이스

| 패키지 | 용도 |
|--------|------|
| `drizzle-orm` | **메인 ORM** — TypeScript 스키마 정의, 타입 안전한 쿼리 빌더, recursive CTE 지원 |
| `drizzle-kit` | 마이그레이션 생성 + DB 푸시 (`drizzle-kit generate`, `drizzle-kit push`) |
| `@supabase/supabase-js` | Supabase 보조 클라이언트 (Realtime 구독, Storage 등 Drizzle로 못 하는 것) |
| `@supabase/ssr` | Next.js App Router SSR 통합 |
| `postgres` | PostgreSQL 드라이버 (`drizzle-orm/postgres-js` 어댑터용) |
| `neo4j-driver` | Neo4j Cypher 실행 (Next.js API Route에서) |

**Drizzle ORM 선택 이유**:
- `@supabase/supabase-js`만으로는 10개 테이블 + 복잡한 FK/JOIN에서 타입 안전성 부족
- TypeScript 스키마에서 Zod 타입까지 자동 추론 (`drizzle-zod`)
- SQL을 직접 제어 가능 — recursive CTE(계층 탐색), 복합 JOIN 등
- 번들 사이즈 ~7.4kb, 서버리스/엣지 환경에 적합
- Supabase PostgreSQL과 바로 호환 (postgres-js 드라이버)

**Drizzle 스키마 예시** (`src/lib/db/schema.ts`):
```typescript
import { pgTable, uuid, text, boolean, timestamp, float, integer, jsonb, unique, check } from 'drizzle-orm/pg-core';

export const classes = pgTable('classes', {
  id: uuid('id').primaryKey().defaultRandom(),
  parentId: uuid('parent_id').references(() => classes.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description').default(''),
  color: text('color').notNull().default('#7c3aed'),
  positionX: float('position_x').notNull().default(0),
  positionY: float('position_y').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('uq_class_name_per_parent').on(table.parentId, table.name),
]);
```

**Supabase 설정**:
- Supabase Cloud (프로덕션)
- RLS 비활성화 (1인 사용)
- Realtime 불필요
- Drizzle이 메인 쿼리 레이어, `@supabase/supabase-js`는 보조

**Neo4j 설정**:
- Neo4j Community Edition (Docker) 또는 Neo4j Aura Free Tier (클라우드)
- neo4j-driver로 Next.js Server Action에서 Cypher 실행

### 14.8 LLM 통합

| 패키지 | 용도 |
|--------|------|
| `@ai-sdk/react` | AI SDK 6 — `useChat` 훅, Agent 인터페이스, Tool 타입 체계 |
| `@ai-sdk/anthropic` | Claude 프로바이더 (Sonnet/Haiku 모델 연결) |
| `ai` | AI SDK Core — `generateObject`, `generateText`, 스트리밍 |
| `ai-elements` (선택적) | AI 보조 패널용 컴포넌트 — `PromptInput`, `Message`, `Response`만 사용. 전체 채팅 UI는 불필요. |
| `zod` | LLM 출력 파싱 + 구조화 (Structured Output) |

**모델 분리 전략**:
- `claude-sonnet-4-20250514`: 자유 입력 구조화, 공리 해석, AI 보조 명령
- `claude-haiku-4-5-20251001`: 노드 설명 생성, 관계 자동 제안

**AI SDK 6 활용 포인트**:
- `useChat` 훅으로 AI 보조 입력창의 스트리밍 응답
- `generateObject`로 LLM 출력을 Zod 스키마에 맞춰 구조화
- Agent 인터페이스 + Tool 정의로 "구조화 제안 → 사용자 승인" Human-in-the-Loop 패턴 구현
- Tool 타입이 프론트엔드 컴포넌트까지 end-to-end 타입 안전

**AI Elements 선택적 채택**:
- `PromptInput` + `PromptInputTextarea`: AI 보조 입력창 (하단 패널)
- `Message` + `MessageResponse`: AI 제안 결과 표시
- 전체 Conversation UI는 사용하지 않음 (채팅 앱이 아니므로)

### 14.9 유틸리티

| 패키지 | 용도 |
|--------|------|
| `uuid` | 노드/엣지 ID 생성 |
| `date-fns` | 커밋 로그 날짜 포맷팅 |
| `sonner` | 토스트 알림 (커밋 성공, 에러 등) |
| `nuqs` | URL 쿼리 파라미터 상태 동기화 (선택된 노드 ID → URL) |

### 14.10 개발 도구

| 도구 | 용도 |
|------|------|
| `@biomejs/biome` | 린팅 + 포매팅 통합 (ESLint + Prettier 대체). Rust 기반 10~25배 빠름. 설정 파일 하나(biome.json). |
| `ultracite` | Biome zero-config 프리셋. Next.js/React/TypeScript 규칙 내장. AI 에이전트(Claude Code, Cursor) 룰 파일 자동 생성. |
| `@xyflow/react` DevTools | React Flow 디버깅 |

**Biome + Ultracite 선택 이유** (ESLint + Prettier 대체):
- 단일 바이너리로 린팅 + 포매팅 통합 — 127개+ npm 패키지 설치 불필요
- 10,000 파일 린팅 ~0.8초 (ESLint ~45초), 포매팅 ~0.3초 (Prettier ~12초)
- Ultracite가 Next.js + React + TypeScript 규칙을 zero-config으로 제공
- `npx ultracite` 한 번으로 Biome 설정 + 에디터 설정 + AI 에이전트 룰 파일 전부 생성
- shadcn/ui 컴포넌트 디렉토리는 린팅 제외 설정 가능

**⚠️ 사용하지 않는 도구:**
- `eslint`, `prettier`, `prettier-plugin-tailwindcss` — Biome/Ultracite로 대체
- `@next/eslint-plugin-next` — Ultracite의 Next.js 프리셋에 포함

### 14.11 설치 명령어 요약

```bash
# 프로젝트 생성
npx create-next-app@latest ontology-studio --typescript --tailwind --app --src-dir

# 린팅/포매팅 (Biome + Ultracite, ESLint/Prettier 대체)
npx ultracite

# Core UI
npx shadcn@latest init
npx shadcn@latest add button popover command collapsible dropdown-menu sheet table tooltip badge input textarea tabs scroll-area separator

# AI Elements (선택적 컴포넌트만)
npx ai-elements@latest add prompt-input message response

# 그래프 엔진
npm install @xyflow/react elkjs @dagrejs/dagre

# 상태 관리 + 데이터
npm install zustand immer @tanstack/react-query

# ORM + 데이터베이스
npm install drizzle-orm postgres @supabase/supabase-js @supabase/ssr
npm install -D drizzle-kit drizzle-zod
npm install neo4j-driver

# 폼 + 유효성
npm install zod react-hook-form @hookform/resolvers

# 편집기
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder

# LLM (AI SDK 6)
npm install ai @ai-sdk/react @ai-sdk/anthropic

# 애니메이션
npm install framer-motion

# 유틸리티
npm install uuid date-fns sonner nuqs lucide-react class-variance-authority clsx tailwind-merge

# 개발 도구
npm install -D @types/uuid
```

### 14.12 폴더 구조

```
src/
├── app/
│   ├── layout.tsx                 # 루트 레이아웃
│   ├── page.tsx                   # 메인 스튜디오 페이지
│   ├── api/
│   │   ├── neo4j/push/route.ts    # Neo4j 푸시 API
│   │   └── ai/
│   │       ├── structure/route.ts  # 자유 입력 구조화
│   │       └── assist/route.ts     # AI 보조
│   └── globals.css
├── components/
│   ├── ui/                         # shadcn/ui 컴포넌트
│   ├── ai-elements/                # AI Elements (선택적 설치분)
│   │   ├── prompt-input.tsx
│   │   ├── message.tsx
│   │   └── response.tsx
│   ├── explorer/
│   │   ├── explorer.tsx            # Explorer 패널
│   │   ├── tree-item.tsx           # 트리 아이템
│   │   └── search.tsx              # 검색
│   ├── canvas/
│   │   ├── graph-canvas.tsx        # React Flow 래퍼
│   │   ├── class-node.tsx          # 커스텀 클래스 노드
│   │   ├── instance-node.tsx       # 커스텀 인스턴스 노드
│   │   ├── relation-edge.tsx       # 커스텀 엣지
│   │   └── commit-bar.tsx          # 하단 커밋 바
│   ├── panel/
│   │   ├── right-panel.tsx         # 우측 패널 래퍼
│   │   ├── section-subclasses.tsx  
│   │   ├── section-properties.tsx  
│   │   ├── section-relations.tsx   
│   │   ├── section-constraints.tsx 
│   │   ├── section-instances.tsx   
│   │   ├── description-editor.tsx  # tiptap 인라인 에디터
│   │   └── ai-assist.tsx           # AI 보조 입력창
│   └── popovers/
│       ├── create-node-popover.tsx  # 새 노드 생성
│       ├── preview-popover.tsx      # 구조화 프리뷰
│       ├── relation-popover.tsx     # 관계 설정
│       └── hierarchy-popover.tsx    # 계층 이동 확인
├── db/
│   ├── schema.ts                   # Drizzle 스키마 정의 (전체 테이블)
│   ├── relations.ts                # Drizzle 관계 정의
│   ├── index.ts                    # DB 클라이언트 (postgres-js + drizzle)
│   └── migrations/                 # drizzle-kit 생성 마이그레이션 파일
├── stores/
│   ├── ontology-store.ts           # Zustand 메인 스토어
│   └── ui-store.ts                 # UI 상태 (팝오버, 패널)
├── lib/
│   ├── supabase/
│   │   └── client.ts               # Supabase 보조 클라이언트
│   ├── neo4j/
│   │   ├── driver.ts               # Neo4j 드라이버
│   │   └── cypher-builder.ts       # 변경사항 → Cypher 변환
│   ├── graph/
│   │   ├── layout.ts               # ELKjs 레이아웃 유틸
│   │   └── transform.ts            # DB 데이터 ↔ React Flow 변환
│   └── ai/
│       ├── agents.ts               # AI SDK 6 Agent 정의
│       ├── tools.ts                # Tool 정의 (구조화, 공리 해석 등)
│       ├── prompts.ts              # LLM 프롬프트 템플릿
│       └── schemas.ts              # LLM 출력 Zod 스키마
├── types/
│   └── ontology.ts                 # 공유 타입 정의
├── drizzle.config.ts               # Drizzle Kit 설정
└── biome.json                      # Biome 설정 (Ultracite 프리셋)
```