# 온톨로지 그래프 뷰 가시성 개선 디자인 지시서
### myATHENA Ontology Studio — Graph View Specification v1.0

---

## 0. 목적과 범위

이 문서는 myATHENA Ontology Studio의 그래프 뷰가 현재 겪는 **hairball(엉킨 실타래) 문제**를 해결하기 위한 디자인·구현 지시서다. 대상은 react-force-graph 기반 그래프 뷰 컴포넌트이며, 백엔드는 Neo4j(LPG), 데이터·메타 계층은 Supabase, 프레임워크는 Next.js 15를 전제로 한다.

핵심 명제 한 줄: **"전체를 한 번에 그리지 않는다. 스키마와 인스턴스를 분리하고, 항상 보이는 만큼만 그린다."**

이 문서는 두 계층의 지시를 포함한다.
- **모델 계층**: 가시성 이전에 온톨로지 구조 자체에서 고쳐야 하는 것 (god node 등)
- **뷰 계층**: react-force-graph에서 구현하는 시각화·인터랙션 규칙

---

## 1. 핵심 설계 원칙 (4대 원칙)

모든 구현 결정은 아래 네 원칙으로 환원되어야 한다.

### 원칙 1 — TBox / ABox 분리
스키마(클래스·관계 정의)와 인스턴스(실제 데이터)를 **절대 같은 화면에 동시에 펼치지 않는다.**
- **TBox 뷰**: 클래스 노드 + subClassOf/관계 정의만. 노드 수가 수십 단위라 항상 읽힌다. (기본 진입 화면)
- **ABox 뷰**: 특정 클래스를 선택했을 때만 그 클래스의 인스턴스를 lazy load.

### 원칙 2 — Progressive Disclosure (점진적 공개)
처음엔 최상위만 보이고, 사용자의 클릭으로 한 겹씩 확장된다.
- 진입 시: 도메인 루트 클래스(Core, HR, Approval, Accounting, PACS, Meeting, ITProject)만 표시.
- 클릭 시: 해당 클래스의 subClassOf 자식 또는 인스턴스를 펼침.
- 전체 그래프를 강제로 펼치는 "Expand All" 버튼은 **제공하지 않는다.**

### 원칙 3 — Focus + Context
한 노드에 주목할 때 나머지는 죽이지만 사라지지는 않는다.
- 노드 hover/클릭 → 해당 노드의 1~2홉 이웃만 불투명, 나머지는 투명도 0.1로 디밍(dim).
- 사용자가 "지금 어디를 보고 있는지" 항상 알 수 있어야 한다.

### 원칙 4 — Level of Detail (LOD)
줌 레벨에 따라 표시 정보량을 조절한다.
- 줌아웃 상태: 라벨 숨김, 허브 노드 라벨만 표시.
- 줌인 상태: 모든 라벨 표시.
- 라벨은 **항상 켜져 있으면 안 된다.** 이게 가장 효과 큰 단일 개선책이다.

---

## 2. 비주얼 토큰 시스템

myATHENA "Obsidian for Engineers" 디자인 시스템을 따르되, **그래프 뷰 전용 예외 규칙**을 적용한다.

### 2.1 배경 (5단계 스케일 — 기존 유지)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--bg-0` | `#181818` | 그래프 캔버스 최하단 배경 |
| `--bg-1` | `#1e1e1e` | 패널/사이드바 배경 |
| `--bg-2` | `#242424` | 카드/리스트 아이템 |
| `--bg-3` | `#2a2a2a` | hover 상태 |
| `--bg-4` | `#2d2d2d` | 활성/선택 상태 |

### 2.2 노드 색상 — ⚠️ 디자인 시스템 예외 규칙

**중요: 그래프 뷰에서는 "단일 퍼플 액센트" 규칙을 그대로 적용하면 안 된다.**
그래프는 본질적으로 노드 타입을 색으로 구분(categorical encoding)해야 읽히는 매체다. 따라서 다음 규칙으로 분리한다.

- **퍼플(`#a78bfa`)은 "선택/강조 상태" 전용으로 예약한다.** 도메인 색으로 쓰지 않는다.
- **도메인 구분은 채도를 낮춘(desaturated) 팔레트**로 한다. 다크 배경에서 눈이 편하고, 어느 하나가 시각적으로 god node처럼 튀지 않아야 한다.

| 도메인 | 색상 토큰 | 채도 낮춘 값 (제안) |
|---|---|---|
| Core | `--node-core` | `#5b7fa6` (muted slate-blue) |
| HR | `--node-hr` | `#6fa66f` (muted green) |
| Approval | `--node-approval` | `#c9a35b` (muted amber) |
| Accounting | `--node-accounting` | `#4fa6a0` (muted teal) |
| PACS | `--node-pacs` | `#9b7fb5` (muted violet-gray) |
| Meeting | `--node-meeting` | `#b56f8f` (muted rose) |
| ITProject | `--node-itproject` | `#8a6b5b` (muted brown) |
| External | `--node-external` | `#6b6b6b` (neutral gray) |

> 제안값은 시작점이다. 모든 도메인 색은 명도(lightness)를 비슷하게 맞춰서, 색상(hue)으로만 구분되고 어느 하나가 더 "무겁게" 보이지 않도록 정렬할 것.

- **선택 상태**: 노드 외곽선(stroke)을 `#a78bfa` 2px + glow로 표현. 채움색은 도메인 색 유지.
- **디밍 상태**: 도메인 색 그대로, 투명도(alpha) 0.1.

### 2.3 폰트 (기존 유지)
- 라벨: `IBM Plex Sans` — 한글/영문 라벨.
- 기술 식별자(URI, PK, relation 이름): `IBM Plex Mono`.
- 라벨 색: `#e0e0e0` (활성), `#666` (디밍).

### 2.4 노드 크기 규칙
크기는 **의미를 하나만** 인코딩한다 — 연결 차수(degree)로 통일한다.
- `radius = base + k * sqrt(degree)` (sqrt로 완만하게, 선형은 허브가 과도하게 커짐)
- `base = 4`, `k = 1.5` 시작값. 최대 반경 상한(cap)을 둬서 god node가 화면을 잡아먹지 않게 한다.
- 색은 카테고리(도메인), 크기는 차수 — 이 규칙을 범례에 명시한다.

### 2.5 엣지 위계화
모든 엣지를 동등하게 그리지 않는다. 관계 타입에 따라 차등한다.

| 관계 종류 | 색 | 굵기 | 투명도 | 비고 |
|---|---|---|---|---|
| subClassOf (계층) | `#777` | 1.5px | 0.6 | 점선(dashed) |
| 구조 관계 (belongsTo, hasX) | 도메인 색 60% | 1px | 0.4 | 실선 |
| 참조/약한 관계 | `#444` | 0.5px | 0.25 | 실선 |
| 선택 경로 강조 | `#a78bfa` | 2px | 0.9 | 화살표 |

> 현재 이미지의 문제: 퍼플 엣지가 너무 강해 다 잡아먹는다. **퍼플은 "선택된 경로" 강조에만** 쓰고, 평상시 엣지 투명도는 전체적으로 낮춘다.

---

## 3. 노드·엣지 인코딩 규칙 요약

| 시각 채널 | 인코딩 대상 | 규칙 |
|---|---|---|
| 노드 채움색 | 도메인(카테고리) | §2.2 팔레트, 명도 균일 |
| 노드 크기 | 연결 차수 | sqrt 스케일 + 상한 |
| 노드 외곽선 | 선택 상태 | 퍼플 stroke + glow |
| 라벨 표시 여부 | 줌 레벨 / 허브 여부 | LOD (§4.1) |
| 엣지 색·굵기·투명도 | 관계 타입 | §2.5 |
| 노드/엣지 투명도 | focus 상태 | 비이웃 0.1 디밍 |

---

## 4. 인터랙션 명세

### 4.1 줌 기반 LOD
`nodeCanvasObject`에서 `globalScale`(현재 줌 배율)을 받아 라벨 표시를 제어한다.

- `globalScale < 1.5` → 라벨 전부 숨김, **단 차수 상위 N개 허브만** 라벨 표시 (N=10 시작값).
- `globalScale >= 1.5` → 화면에 보이는 노드 라벨 표시.
- 라벨 폰트 크기는 `12 / globalScale` 로 역보정 (줌해도 글자 크기 일정).
- 라벨이 노드끼리 겹치면 우선순위(차수 높은 쪽)만 표시.

### 4.2 클릭 확장 (Expand-on-Demand)
**TBox 뷰 (기본):**
- 클래스 노드 클릭 → 그 클래스의 subClassOf 자식 클래스를 펼침 (이미 펼쳐졌으면 접기 toggle).
- 자식이 없는 leaf 클래스 클릭 → "인스턴스 보기" 액션 노출.

**ABox 진입:**
- leaf 클래스에서 "인스턴스 보기" → 해당 클래스의 인스턴스를 Neo4j에서 lazy load (LIMIT 100, 페이지네이션).
- ABox는 TBox 위에 오버레이하지 않고, **별도 모드 전환** 또는 분리된 캔버스 영역에서 표시 (god node 재발 방지).

### 4.3 호버 Focus
- 노드 hover → 1홉 이웃 + 연결 엣지만 불투명, 나머지 디밍(0.1).
- 노드 클릭(선택) → 2홉까지 유지 + 우측 상세 패널 오픈.
- 빈 캔버스 클릭 → 디밍 해제, 전체 복원.

### 4.4 검색 / 필터
- **검색창**: 클래스/인스턴스 라벨 검색 → 매칭 노드로 카메라 이동(center + zoom) + focus.
- **차수 필터 슬라이더**: "차수 N 이하 노드 숨기기" → 잡음 노드 제거. 기본값 0(전체), 드래그로 허브만 남기기 가능.
- **도메인 토글**: 범례의 도메인 칩을 토글해 해당 도메인 노드 표시/숨김.

### 4.5 우측 상세 패널 (기존 myATHENA 우측 패널 활용)
선택 노드의 메타데이터 표시. 모달/토스트 금지 규칙 유지 — 우측 고정 패널에 인라인으로.
- 헤더: 클래스명(영문) + 한글명 + 도메인 칩
- Description, URI, PK
- Relations 목록 (subClassOf, hasX, isXOf …) — 각 항목 클릭 시 대상 노드로 이동
- 인스턴스 카운트 + "인스턴스 보기" 버튼

---

## 5. 레이아웃 / 물리 엔진 (d3-force)

| force | 설정 | 목적 |
|---|---|---|
| `forceCollide()` | radius = 노드 반경 + 4 | 노드 겹침 방지 (라벨 충돌 완화) |
| `forceManyBody()` | strength = -120 ~ -300 | 노드 간 적절한 반발 (밀도 분산) |
| `forceLink()` | distance = 관계 타입별 차등 | 계층 엣지는 짧게, 약한 참조는 길게 |
| `forceCenter()` | 캔버스 중심 | 그래프 중앙 정렬 |

- 노드 수가 많을 때 시뮬레이션 tick 수 제한(`cooldownTicks`)으로 초기 렌더 성능 확보.
- 펼침/접기 시 부드러운 전환을 위해 새 노드만 추가하고 기존 위치는 보존(reheat 최소화).

---

## 6. 모델 계층 시정사항 (가시성 이전 단계)

⚠️ **이건 뷰 튜닝으로 못 가린다. 온톨로지 스키마에서 고쳐야 한다.**

### 6.1 God Node 분해
한 노드에 차수가 비정상적으로 몰리면(수백 개 엣지) 어떤 시각화로도 풀리지 않는다. 원인은 보통 둘 중 하나다.
- 노드가 너무 추상적이다 (예: "증상", "이벤트", "신호" 같은 만능 분류).
- 중간 계층 없이 모든 걸 직결시켰다.

**조치:** god node를 중간 카테고리 노드 몇 개로 쪼개 차수를 분산시킨다. 예) 거대한 "증상" 허브 → "전기 증상 / 기계 증상 / SW 증상 / 진공 증상" 등 중간 분류 도입 후 그 아래로 재배치.

### 6.2 차수 진단
구현 전, 아래 Cypher로 차수 상위 노드를 점검하고 분해 대상을 식별한다.

```cypher
MATCH (n)
RETURN n.name AS node, COUNT { (n)--() } AS degree
ORDER BY degree DESC
LIMIT 20
```

상위 노드의 degree가 전체 평균의 10배를 크게 넘으면 분해 후보다.

---

## 7. 화면 구조 / 레이아웃

myATHENA 4컬럼 고정 레이아웃(Ribbon / Explorer / Editor / Right Panel)을 따른다. 그래프 뷰는 Editor 영역에 위치한다.

- **좌측 (Explorer)**: 클래스 트리 리스트 + 통계(Classes / Properties / Relations 카운트). 리스트와 그래프는 양방향 연동(리스트 클릭 → 그래프 focus, 그래프 클릭 → 리스트 하이라이트).
- **중앙 (Editor / 캔버스)**: 그래프. 좌하단에 도메인 범례(고정), 우하단에 줌 컨트롤(+/−/Reset).
- **우측 (Right Panel)**: 선택 노드 상세 (§4.5).
- 모달·토스트·별도 페이지 금지 규칙 유지.

### 범례 (필수)
현재 가장 큰 누락 중 하나. 범례 없으면 색이 뭘 의미하는지 추측해야 한다.
- 도메인별 색 칩 + 라벨 (토글 가능).
- "크기 = 연결 차수, 색 = 도메인" 인코딩 규칙 명시.

---

## 8. 구현 노트 (Next.js 15 / Neo4j / Supabase)

### 8.1 SSR 회피 (필수)
react-force-graph는 클라이언트 전용(WebGL/Canvas)이라 SSR에서 `window is not defined`로 터진다. 반드시 dynamic import.

```tsx
'use client';
import dynamic from 'next/dynamic';
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });
```
2D만 쓰면 `react-force-graph-2d`만 설치해 번들을 줄인다.

### 8.2 데이터 계약
Neo4j 드라이버는 **서버 전용**. 클라이언트에 자격증명을 노출하지 않는다 (OI170 준수).

```
Server (Route Handler / Server Action)
  ├─ neo4j-driver → Cypher → 클래스/관계/인스턴스
  ├─ Supabase     → 문서 메타데이터 (제목, 작성자, SO 참조 등)
  └─ 머지 → { nodes: [...], links: [...] } JSON 반환
        ↓
Client GraphView (dynamic, ssr:false) → ForceGraph2D
```

노드/엣지 JSON 스키마(최소):
```ts
type GraphNode = {
  id: string;
  label: string;       // 표시 라벨
  domain: Domain;      // 색 인코딩
  degree: number;      // 크기 인코딩
  kind: 'class' | 'instance';
};
type GraphLink = {
  source: string;
  target: string;
  relType: 'subClassOf' | 'structural' | 'reference';
};
```

### 8.3 핵심 Cypher (lazy load)
```cypher
-- 진입: 최상위 도메인 클래스만
MATCH (c:Class) WHERE c.isRoot = true RETURN c;

-- 클래스 클릭: 자식 클래스만
MATCH (p:Class {id:$id})<-[:SUBCLASS_OF]-(child:Class) RETURN child;

-- leaf 클릭: 그 클래스의 인스턴스만 (페이지네이션)
MATCH (i:Instance)-[:INSTANCE_OF]->(:Class {id:$id})
RETURN i SKIP $offset LIMIT 100;
```

---

## 9. 수용 기준 (Acceptance Criteria)

아래를 모두 충족하면 "가시성 개선 완료"로 본다.

1. 진입 화면에서 노드가 50개 이하이며, 모든 라벨이 겹침 없이 읽힌다.
2. 줌아웃 상태에서 라벨은 허브만 표시되고, 줌인하면 전부 표시된다. (LOD 동작)
3. 어떤 노드를 클릭해도 god node처럼 화면을 뭉개는 허브가 등장하지 않는다. (모델 분해 완료)
4. 노드 hover 시 이웃만 강조되고 나머지가 디밍된다. (focus+context 동작)
5. 범례가 존재하고, 색=도메인 / 크기=차수 규칙이 명시돼 있다.
6. 퍼플(`#a78bfa`)은 선택/강조에만 쓰이고 도메인 색으로 쓰이지 않는다.
7. 엣지가 관계 타입별로 색·굵기·투명도가 구분된다.
8. 차수 필터 슬라이더로 잡음 노드를 숨길 수 있다.
9. 전체 그래프를 한 번에 펼치는 경로가 UI에 존재하지 않는다.

---

## 부록 — 우선순위 (구현 순서)

효과 대비 비용 순으로 착수한다.

1. **LOD 라벨 토글** — 효과 가장 큼, 비용 낮음. 최우선.
2. **focus+context 디밍** — 탐색 가능성의 핵심.
3. **범례 + 엣지 위계화 + 채도 낮춘 팔레트** — 정적 가독성.
4. **forceCollide + 차수 필터** — 밀도 분산.
5. **TBox/ABox 분리 + progressive disclosure** — 구조적 해결(가장 근본적, 비용 큼).
6. **god node 모델 분해** — 스키마 작업, 별도 트랙으로 병행.