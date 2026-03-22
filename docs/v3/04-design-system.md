# UI/BX 디자이너 -- 디자인 시스템 및 UI 개선안

> **작성일**: 2026-03-22
> **작성자**: UI/BX 디자이너 (v3 기획단)
> **대상**: Ontology Studio v3

---

## 1. 현재 디자인 시스템 감사 결과

### 1.1 색상 체계

**기본 토큰 (CSS 변수, HSL 기반)**

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--background` | `#fafafa` | `#0a0a0f` | 앱 배경 |
| `--foreground` | `#18181b` | `#fafafa` | 기본 텍스트 |
| `--card` | `#ffffff` | `#111118` | 카드/패널 배경 |
| `--primary` | `#7c3aed` (violet-600) | `#8b5cf6` (violet-500) | 메인 액센트 |
| `--muted` | `#f4f4f5` | `#27272a` | 보조 배경 |
| `--border` | `#e4e4e7` | `#27272a` | 테두리 |
| `--destructive` | `#ef4444` | `#7f1d1d` | 위험 액션 |

**노드 색상 팔레트 (7색)**

| 키 | 라이트 | 다크 | 용도 |
|----|--------|------|------|
| `root` | `#7c3aed` | `#8b5cf6` | 루트 클래스 |
| `mid` | `#2563eb` | `#3b82f6` | 중간 클래스 |
| `leaf` | `#0891b2` | `#06b6d4` | 하위 클래스 |
| `instance` | `#86efac` | `#4ade80` | 인스턴스 |
| `person` | `#d97706` | `#f59e0b` | 사람 |
| `place` | `#dc2626` | `#ef4444` | 장소 |
| `event` | `#db2777` | `#ec4899` | 이벤트 |

**텍스트 토큰 (3단계)**

| 토큰 | 라이트 | 다크 | 용도 |
|------|--------|------|------|
| `--text-primary` | `#18181b` | `#fafafa` | 제목, 주요 텍스트 |
| `--text-secondary` | `#52525b` | `#a1a1aa` | 보조 텍스트 |
| `--text-muted` | `#a1a1aa` | `#71717a` | 비활성/메타 텍스트 |

**감사 소견**:
- 기본 색상 체계는 shadcn/ui 표준을 잘 따르고 있음
- 노드 7색 팔레트는 차별성이 있으나, **의미론적 색상(semantic color)**이 부족 -- `success`, `warning`, `info` 등 상태 색상이 토큰화되지 않고 하드코딩(`emerald-600`, `amber-400` 등)으로 흩어져 있음
- 다크 모드 노드 배경 opacity(0.20)가 일부 색상에서 대비 부족 (특히 `instance` 0.15)
- `--accent`와 `--primary`가 동일 값 -- accent가 별도 역할을 하지 않음

### 1.2 타이포그래피

**폰트 스택**:
- **Sans**: Outfit (Google Fonts) + system fallback
- **Mono**: JetBrains Mono (Google Fonts) + system fallback

**현재 사용 중인 사이즈** (Tailwind 클래스 기준):

| 클래스 | px | 사용처 |
|--------|-----|-------|
| `text-[9px]` | 9 | 인스턴스 노드 라벨 (name 모드) |
| `text-[10px]` | 10 | 섹션 라벨, 배지, 줌 퍼센트, 힌트 |
| `text-[11px]` | 11 | CommitBar 텍스트, 변경 내역 |
| `text-xs` (12px) | 12 | 트리 아이템, 버튼 라벨, 노드 라벨 |
| `text-sm` (14px) | 14 | 도구 이름, 로고 텍스트 |
| `text-base` (16px) | 16 | EmptyState 제목 |

**감사 소견**:
- Outfit 폰트는 기하학적이고 현대적이어서 도구 앱에 적합
- 사이즈 스케일이 `9px ~ 16px` 범위로 **매우 촘촘하게** 사용 -- 9/10/11/12/14/16 총 6단계
- 9px, 10px는 가독성 한계선이며, 특히 한국어 텍스트에서 문제 소지
- `font-semibold`가 거의 모든 라벨에 사용되어 시각적 위계 구분이 약함
- Heading 체계(h1~h4)가 정의되지 않음 -- 모든 곳에서 임의 사이즈 사용

### 1.3 여백/간격

**현재 패턴** (인라인 값 위주):

| 위치 | 값 | 비고 |
|------|-----|------|
| Explorer 패널 너비 | `260px` | 고정 |
| Right Panel 너비 | `320px` | 고정 |
| Toolbar 높이 | `46px` | 고정 |
| CommitBar 높이 | `38px` | 고정 |
| 패널 내부 패딩 | `px-3~4, py-2~3` | 비일관 |
| 트리 인덴트 | `depth * 18 + 8px` | 인라인 계산 |
| 노드 간격 (ELK) | layered 알고리즘 자동 | - |

**감사 소견**:
- Tailwind 기본 4px 그리드(spacing scale)를 사용하지만, **컴포넌트 간 간격에 일관된 규칙이 없음**
- 패널 너비가 하드코딩되어 반응형 불가 (1280px 미만 화면에서 캔버스 공간 부족)
- 섹션 간 여백이 `py-1`, `py-2`, `py-2.5`, `py-3` 등 미세하게 달라 시각적 리듬 불규칙

### 1.4 컴포넌트 인벤토리

**shadcn/ui 컴포넌트 (27개 설치)**:
accordion, alert-dialog, avatar, badge, button, card, checkbox, collapsible, command, dialog, dropdown-menu, file-upload, form, input, label, popover, scroll-area, select, separator, sheet, skeleton, table, tabs, textarea, toast, toaster, tooltip

**커스텀 컴포넌트**:
- `ClassNode` -- 원형 노드 (3단계 LOD: dot/name/full)
- `InstanceNode` -- 소형 원형 노드 (3단계 LOD)
- `ExplorerPanel` -- 좌측 트리 패널 (framer-motion 슬라이드)
- `RightPanel` -- 우측 상세 패널 (탭 3개)
- `Toolbar` -- 상단 도구 모음
- `CommitBar` -- 하단 커밋 바
- `EmptyState` -- 빈 캔버스 안내
- `NewNodePopover` -- LLM 연동 노드 생성 (3단계 흐름)
- `RelationPopover`, `HierarchyPopover`, `DeleteConfirmDialog`
- Neo4j 시리즈: `NeoConfirmSheet`, `CypherPreview`, `PushProgress`, `PushResult`, `PushSummary`
- 스켈레톤 3종: `CanvasSkeleton`, `ExplorerSkeleton`, `RightPanelSkeleton`

**감사 소견**:
- shadcn/ui 컴포넌트는 거의 기본 스타일 그대로 사용 -- 커스터마이징 최소
- Button의 `variant`/`size` 조합 외에 앱 고유 variant(예: `ai`, `success`)가 없음
- Badge도 기본 `outline`/`secondary` 외에 노드 타입별 variant 미정의
- 반복되는 UI 패턴(섹션 헤더 + count + 접기/추가 버튼)이 `CollapsibleSection`으로 부분 추상화되었으나, 일관성 부족

### 1.5 애니메이션 현황

**현재 사용 중인 애니메이션**:

| 요소 | 방식 | 파라미터 | 비고 |
|------|------|---------|------|
| 노드 등장 | framer-motion `spring` | damping:15, stiffness:300 | ClassNode |
| 인스턴스 등장 | framer-motion `spring` | damping:12, stiffness:280, delay:0.1 | InstanceNode |
| 패널 슬라이드 | framer-motion variants | spring, damping:24, stiffness:260 | Explorer, RightPanel |
| 트리 접기/펼치기 | framer-motion `height` | duration:0.15s | AnimatePresence |
| 포커스 링 | CSS keyframe | 1.5s ease-out | `node-focus-ring` |
| 변경 표시 dot | Tailwind `animate-pulse` | 기본값 | CommitBar |
| 로딩 스피너 | Tailwind `animate-spin` | 기본값 | Loader2 아이콘 |
| 스켈레톤 진입 | Tailwind `animate-in fade-in` | 150ms | CanvasSkeleton |
| 호버 스케일 | Tailwind transition | `hover:scale-[1.05]` | ClassNode full/name |
| 빈 상태 핑 | CSS `animate-ping` | 3s duration | EmptyState 아이콘 |

**감사 소견**:
- framer-motion과 Tailwind CSS 애니메이션이 혼재 -- 일관된 이징/타이밍 체계 없음
- spring 파라미터가 컴포넌트마다 미세하게 다름 (damping 12~24, stiffness 260~300)
- 엣지 연결, 노드 삭제, 관계 생성 등 **핵심 인터랙션에 시각적 피드백 부재**
- 드래그 중 시각적 힌트(ghost node, drop zone 하이라이트) 없음
- 페이지 전환 애니메이션 없음 (SPA이므로 탭 전환 정도)

---

## 2. v3 디자인 시스템 제안

### 2.1 컬러 팔레트 (라이트/다크)

#### 2.1.1 기본 색상 -- 현행 유지 + Semantic 확장

기존 shadcn/ui 기반 토큰은 유지하되, **Semantic Color Token** 레이어를 추가한다.

```css
:root {
  /* === Semantic Status Colors === */
  --success: 142 71% 45%;           /* #22c55e */
  --success-foreground: 0 0% 100%;
  --success-light: 142 76% 95%;     /* #f0fdf4 */

  --warning: 38 92% 50%;            /* #f59e0b */
  --warning-foreground: 0 0% 100%;
  --warning-light: 48 96% 95%;      /* #fefce8 */

  --info: 217 91% 60%;              /* #3b82f6 */
  --info-foreground: 0 0% 100%;
  --info-light: 214 95% 96%;        /* #eff6ff */

  /* === AI Interaction === */
  --ai-primary: 263 70% 50.4%;      /* primary와 동일하되 의미 구분 */
  --ai-glow: 263 70% 50.4% / 0.15;
  --ai-surface: 263 83% 97%;

  /* === Surface Hierarchy === */
  --surface-0: var(--background);     /* 앱 배경 */
  --surface-1: var(--card);           /* 패널, 카드 */
  --surface-2: 240 4.8% 95.9%;       /* 입력 필드, 드롭다운 */
  --surface-3: 240 5% 92%;           /* 호버, 활성 상태 */
  --surface-overlay: 0 0% 0% / 0.5;  /* 오버레이 배경 */
}
```

#### 2.1.2 노드 색상 -- 확장 팔레트

기존 7색 유지 + **3색 추가**로 도메인 확장성 확보:

| 키 | 라이트 | 다크 | 용도 |
|----|--------|------|------|
| `concept` | `#6366f1` (indigo) | `#818cf8` | 추상 개념 |
| `process` | `#14b8a6` (teal) | `#2dd4bf` | 프로세스/워크플로 |
| `artifact` | `#8b5cf6` (violet) | `#a78bfa` | 산출물/문서 |

#### 2.1.3 Accent 분리

`--accent`를 `--primary`에서 독립시켜 **보조 강조색**으로 사용:

```css
:root {
  --accent: 217 91% 60%;            /* Blue -- 링크, 보조 CTA */
  --accent-foreground: 0 0% 100%;
  --accent-light: 214 95% 96%;
}
```

### 2.2 타이포그래피 스케일

#### 2.2.1 폰트 -- Outfit 유지 + 한국어 보강

Outfit은 라틴 전용이므로, 한국어 폴백을 명시적으로 체인한다:

```css
--font-sans: var(--font-outfit), 'Pretendard Variable', 'Apple SD Gothic Neo',
             ui-sans-serif, system-ui, sans-serif;
```

> **Pretendard** 추천 이유: Geometric sans 계열로 Outfit과 x-height/자간이 유사하며, 한국어 가독성 최적화.

#### 2.2.2 사이즈 스케일 (5단계로 정리)

| 토큰 | rem | px | 용도 | Weight |
|------|-----|-----|------|--------|
| `--text-caption` | 0.6875 | 11 | 메타 정보, 타임스탬프, 배지 | regular(400) |
| `--text-body-sm` | 0.75 | 12 | 트리 아이템, 버튼 라벨, 노드 라벨 | medium(500) |
| `--text-body` | 0.8125 | 13 | 본문 텍스트, 입력 필드 | regular(400) |
| `--text-heading-sm` | 0.875 | 14 | 섹션 제목, 패널 헤더 | semibold(600) |
| `--text-heading` | 1.125 | 18 | 페이지/모달 제목 | bold(700) |

> 최소 사이즈를 **11px**로 상향 (현행 9px, 10px 제거). 한국어 자소 판독 최소 기준.

#### 2.2.3 행간/자간

```css
--leading-tight: 1.3;    /* 노드 라벨, 배지 */
--leading-normal: 1.5;   /* 본문 텍스트 */
--leading-relaxed: 1.6;  /* 설명 텍스트 */

--tracking-tight: -0.01em;   /* 헤딩 */
--tracking-normal: 0;         /* 본문 */
--tracking-wide: 0.05em;      /* 섹션 라벨 (uppercase) */
```

### 2.3 스페이싱 스케일

**4px 기준 그리드 유지**, 컴포넌트별 일관된 규칙 정의:

| 토큰 | px | Tailwind | 용도 |
|------|-----|---------|------|
| `--space-xs` | 4 | `1` | 아이콘-텍스트 간격 |
| `--space-sm` | 8 | `2` | 인라인 요소 간격, 아이콘 그룹 |
| `--space-md` | 12 | `3` | 컴포넌트 내부 패딩 |
| `--space-lg` | 16 | `4` | 패널 패딩, 섹션 간격 |
| `--space-xl` | 24 | `6` | 섹션 그룹 간격 |
| `--space-2xl` | 32 | `8` | 주요 영역 간격 |

**패널 패딩 규칙**:
- 수평 패딩: `--space-lg` (16px) -- 모든 패널 공통
- 섹션 간 수직 간격: `--space-md` (12px)
- 섹션 내 아이템 간격: `--space-xs` (4px)

### 2.4 Elevation 체계

**4단계 그림자 + 보더 조합**:

| 레벨 | 그림자 | 보더 | 용도 |
|------|--------|------|------|
| `elevation-0` | none | `1px solid var(--border)` | 인라인 요소, 입력 필드 |
| `elevation-1` | `0 1px 3px rgba(0,0,0,0.06)` | `1px solid var(--border)` | 카드, 패널 |
| `elevation-2` | `0 4px 16px rgba(0,0,0,0.08)` | `1px solid var(--border)` | 팝오버, 드롭다운 |
| `elevation-3` | `0 8px 32px rgba(0,0,0,0.12)` | none | 모달, 시트 |
| `elevation-ai` | `0 0 20px hsl(var(--ai-glow))` | `1px solid hsl(var(--ai-suggestion-border))` | AI 관련 요소 |

다크 모드에서는 그림자 opacity를 2x로 증가시키고, 보더를 `--border` 대신 약간 밝은 톤 사용.

**Border Radius 체계**:

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--radius-sm` | 6px | 배지, 태그, 소형 버튼 |
| `--radius` | 10px | 카드, 입력, 버튼 (현행 유지) |
| `--radius-lg` | 14px | 팝오버, 시트, 모달 |
| `--radius-full` | 9999px | 노드, 아바타, 필 태그 |

### 2.5 아이콘 가이드

**현행**: lucide-react 전면 사용 -- 유지.

**사이즈 규칙**:

| 컨텍스트 | 사이즈 | Tailwind |
|---------|--------|---------|
| 인라인 텍스트 옆 | 14px | `w-3.5 h-3.5` |
| 버튼 내부 | 16px | `w-4 h-4` |
| 패널 헤더 | 18px | `w-4.5 h-4.5` |
| EmptyState 히어로 | 36px | `w-9 h-9` |
| 대형 상태 아이콘 | 48px | `w-12 h-12` |

**색상 규칙**:
- 기본: `text-muted-foreground` (비활성 상태)
- 호버/활성: `text-foreground`
- 강조: `text-primary`
- 위험: `text-destructive`
- 비활성: `text-muted-foreground/50`

### 2.6 애니메이션 가이드라인

#### 2.6.1 통합 이징/타이밍 토큰

```css
:root {
  /* Duration */
  --duration-instant: 100ms;   /* 호버 상태 변화 */
  --duration-fast: 150ms;      /* 버튼 피드백, 토글 */
  --duration-normal: 250ms;    /* 패널 전환, 접기/펼치기 */
  --duration-slow: 400ms;      /* 모달/시트 진입 */
  --duration-emphasis: 600ms;  /* 히어로 애니메이션 */

  /* Easing */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);    /* 진입 */
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1); /* 상태 변화 */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* 바운스 */
}
```

#### 2.6.2 framer-motion 통합 프리셋

```typescript
export const motionPresets = {
  // 패널 슬라이드 (Explorer, RightPanel)
  panelSlide: {
    type: 'spring' as const,
    damping: 22,
    stiffness: 280,
  },
  // 노드 등장 (ClassNode, InstanceNode 공통)
  nodeEnter: {
    type: 'spring' as const,
    damping: 14,
    stiffness: 300,
  },
  // 트리 접기/펼치기
  collapse: {
    duration: 0.2,
    ease: [0.16, 1, 0.3, 1],
  },
  // 팝오버/모달
  overlay: {
    duration: 0.25,
    ease: [0.16, 1, 0.3, 1],
  },
};
```

#### 2.6.3 Reduced Motion 대응

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 3. UI 개선안

### 3.1 그래프 캔버스 비주얼 개선

#### 3.1.1 노드 디자인 리뉴얼

**현재 문제**:
- 원형 노드만 존재해 클래스/인스턴스 구분이 색상에만 의존
- 노드 라벨이 truncate되어 긴 이름이 잘림
- 빈 클래스(opacity 0.35)가 너무 희미하여 탐색 어려움

**개선안**:
1. **ClassNode**: 원형 유지 + **아이콘 뱃지** 추가 (상단 우측에 타입 아이콘)
   - root: `Crown` 아이콘
   - mid: `Layers` 아이콘
   - leaf: `Leaf` 아이콘
   - person/place/event: 해당 의미 아이콘
2. **InstanceNode**: 원형 -> **둥근 사각형**(rounded-lg)으로 변경하여 형태적 구분
3. **빈 클래스**: opacity 0.35 -> 0.55 + dashed border 유지 + "비어있음" 작은 라벨
4. **노드 호버**: `scale(1.05)` + 그림자 증가 + 연결된 엣지 하이라이트
5. **선택 노드**: 외곽 glow ring을 **더블 링**(inner solid + outer glow)으로 강화
6. **노드 라벨**: full 모드에서 `max-w-[72px]` -> `max-w-[100px]`, 2줄까지 허용 (`line-clamp-2`)

#### 3.1.2 엣지 디자인 개선

**현재 문제**:
- 모든 엣지가 `smoothstep` 타입으로 동일한 시각적 처리
- is-a, instance-of, relation 구분이 strokeDasharray 유무로만 차이
- 엣지 라벨(관계명)이 9.5px JetBrains Mono로 가독성 부족

**개선안**:
1. **is-a 엣지**: 실선 + 끝점에 삼각형 화살표 (상속 의미)
2. **instance-of 엣지**: 점선 유지 + 끝점에 빈 삼각형 (인스턴스화 의미)
3. **relation 엣지**: 실선 + 끝점에 채운 화살표 + **라벨을 캡슐 배지**로 표현
4. **엣지 호버**: 연결된 두 노드를 함께 하이라이트 + 엣지 위에 관계 정보 툴팁
5. **엣지 라벨 사이즈**: 9.5px -> 11px, 배경색 추가 (캡슐 형태)

#### 3.1.3 캔버스 배경 개선

- 도트 그리드 유지하되, 줌 레벨에 따라 그리드 밀도 동적 조정
- 캔버스 좌측 상단에 **미니 브레드크럼** 표시 (현재 뷰의 컨텍스트)
- 줌 컨트롤을 하단 우측에서 **하단 중앙 바 통합**으로 이동 (힌트바 + 줌바 합침)

### 3.2 패널 레이아웃 개선

#### 3.2.1 리사이저블 패널

**현재**: Explorer 260px, RightPanel 320px 고정.
**개선**: 패널 경계에 **드래그 리사이저** 추가.

- 최소: Explorer 200px, RightPanel 280px
- 최대: Explorer 400px, RightPanel 480px
- 더블클릭으로 기본값 복귀
- 리사이저 호버 시 `cursor-col-resize` + 1px 파란 라인 피드백

#### 3.2.2 패널 접기/펼치기

- 각 패널 상단에 접기 버튼 (chevron 아이콘)
- 접힌 상태: 아이콘만 표시하는 슬림 바 (40px 폭)
- 키보드 단축키: `Ctrl+B` (Explorer 토글), `Ctrl+J` (RightPanel 토글)
- 애니메이션: `--duration-normal` (250ms) + `--ease-out`

#### 3.2.3 RightPanel 탭 개선

**현재**: 상세/관계/AI 3탭.
**개선**:
- 탭 아이콘 추가 (텍스트만 -> 아이콘 + 텍스트)
- AI 탭: "미구현" toast 대신 **준비 중 상태 UI** (일러스트 + 설명)
- 탭 전환 시 컨텐츠 **crossfade 애니메이션** (framer-motion)

### 3.3 마이크로인터랙션 추가

#### 3.3.1 노드 CRUD 피드백

| 액션 | 현재 | 개선 |
|------|------|------|
| 노드 생성 | scale spring 진입 | spring 진입 + **confetti particle** (3~5개 도트) |
| 노드 삭제 | 즉시 사라짐 | **shrink + fade out** (150ms) |
| 노드 이동 확정 | 없음 | 짧은 **snap 바운스** (50ms) |
| 관계 연결 | 없음 | 엣지가 **드로잉 애니메이션**으로 나타남 (stroke-dashoffset) |
| 커밋 성공 | toast만 | toast + CommitBar **초록 플래시** (200ms) |

#### 3.3.2 드래그 인터랙션

- 노드 드래그 시작: 노드에 **elevation-3 그림자** 적용 + `scale(1.02)`
- 드래그 중 겹침 감지: 대상 노드에 **dashed border + pulse 효과**
- 드롭 취소: 원위치로 **spring 복귀 애니메이션**

#### 3.3.3 포커스/접근성

- 키보드 Tab 포커스 시 **2px primary ring** (현행 ring 유지 + ring-offset 추가)
- 포커스 이동 간 **부드러운 스크롤** (ScrollArea 내 `scrollIntoView smooth`)
- 선택된 노드: Explorer 트리에서 해당 항목으로 자동 스크롤

### 3.4 로딩/상태 피드백 개선

#### 3.4.1 스켈레톤 개선

**현재**: 단순 Loader2 스피너만 표시.
**개선**:
- Explorer: 트리 구조를 모방한 **계층적 스켈레톤 바** (3단계 인덴트)
- Canvas: 노드와 엣지를 모방한 **유령 그래프 스켈레톤** (원+선이 shimmer)
- RightPanel: 폼 레이아웃을 모방한 **필드 스켈레톤** (라벨+입력 쌍)

#### 3.4.2 진행 상태

- LLM 파싱 진행: 현행 5단계 텍스트 -> **프로그레스 바 + 단계 아이콘** 조합
- Neo4j 푸시: 현행 유지하되, 단계별 **체크마크 애니메이션** 추가
- API 동기화 실패: toast 외에 CommitBar에 **경고 아이콘 + 재시도 버튼** 상시 표시

#### 3.4.3 빈 상태(Empty State) 개선

- 현행 EmptyState는 잘 설계되어 있으나, **일러스트레이션** 추가 권장
- 그래프 아이콘(Box) 대신 **추상적 노드-엣지 일러스트** (SVG)
- "더블클릭" 힌트에 **마우스 커서 애니메이션** (CSS로 커서 아이콘이 더블클릭 동작)

---

## 4. 브랜딩 제안

### 4.1 앱 아이덴티티

**현재**: Box 아이콘(lucide) + "Ontology Studio" 텍스트.

**개선 제안**:

1. **로고 마크**: 연결된 3개 노드가 삼각형을 이루는 미니멀 아이콘
   - 색상: `--primary` (violet) 그라데이션 -> 조금 밝은 violet
   - 배경: `--primary/10` 라운드 사각형
   - 의미: "지식의 관계를 연결한다"

2. **워드마크**: "Ontology" (Outfit Bold) + "Studio" (Outfit Regular)
   - "Ontology"만 `--primary` 색상, "Studio"는 `--foreground`

3. **파비콘**: 로고 마크의 16x16 단순화 버전 (3개 점 + 2개 선)

4. **스플래시/로딩**: 로고 마크가 노드-엣지로 조립되는 **2초 인트로 애니메이션** (첫 방문 시만)

### 4.2 컬러 아이덴티티

Violet(#7c3aed)을 주 브랜드 색상으로 유지. 이유:
- "지식 구조화" 도구로서 **창의성 + 체계성**의 이중 의미
- Figma(검정), Miro(노랑), Notion(흰검), Linear(보라/파랑)과 차별화
- 그래프 편집기(yEd 회색, draw.io 파랑, Excalidraw 자유)와도 차별화

**그라데이션 시그니처**:
```css
--brand-gradient: linear-gradient(135deg, hsl(263 70% 50%) 0%, hsl(217 91% 60%) 100%);
```
- violet -> blue 그라데이션은 "깊이(심층) -> 확장(탐색)"의 시각적 은유
- 로딩 바, AI 관련 요소, 핵심 CTA에 선택적 적용

### 4.3 톤 & 보이스

| 영역 | 톤 | 예시 |
|------|-----|------|
| 빈 상태 안내 | 친근하고 격려적 | "빈 공간을 더블클릭하여 지식을 입력하세요" (현행 good) |
| 에러 메시지 | 간결하고 해결 중심 | "연결 실패 -- 재시도" (현행 "다시 시도해주세요" 개선 가능) |
| 성공 피드백 | 짧고 확인적 | "커밋 완료" (현행 good) |
| AI 관련 | 미래지향적이지만 과장 없이 | "AI가 구조를 분석합니다" |

---

## 5. 벤치마킹 레퍼런스

### 5.1 그래프 편집기

| 도구 | 참고 포인트 | Ontology Studio 적용 |
|------|-----------|---------------------|
| **Excalidraw** | 손그림 느낌의 엣지, 극도의 미니멀리즘, 빠른 반응 | 엣지 핸드드로잉 스타일은 과하나, **미니멀 UI + 빠른 피드백** 참고 |
| **draw.io** | 풍부한 커넥터 타입, 엣지 라벨 배치 | **엣지 타입 시각 구분** (화살표 형태), 라벨 캡슐 배치 참고 |
| **yEd** | 자동 레이아웃 다양성, 그룹화 | **레이아웃 옵션 확장** (tree/radial/force), 그룹 노드 개념 |
| **Neo4j Browser** | 노드 크기 = 연결 수, 관계 방향 시각화 | **노드 크기 동적화**, 엣지 방향 화살표 강화 |

### 5.2 지식 관리/SaaS 도구

| 도구 | 참고 포인트 | Ontology Studio 적용 |
|------|-----------|---------------------|
| **Figma** | 좌측 레이어 패널, 우측 속성 패널, 캔버스 중심 | 현행 레이아웃과 일치 -- **패널 접기/리사이즈** 참고 |
| **Linear** | 키보드 퍼스트, 커맨드 팔레트(Cmd+K), 부드러운 전환 | **커맨드 팔레트** 도입 (빠른 노드 검색/이동/생성) |
| **Notion** | 블록 기반 편집, 슬래시 명령어, 여백 활용 | AI 입력 시 **슬래시 커맨드** 패턴 |
| **Miro** | 무한 캔버스, 프레임, 스티커 노트 | 캔버스 자유도는 이미 유사 -- **프레임/그룹화** 참고 |
| **Obsidian Graph View** | 노드 크기=링크수, force 레이아웃, 줌 시 라벨 fade | 현행 LOD 시스템과 유사 -- **force 레이아웃 옵션** 추가 |

### 5.3 최신 SaaS 디자인 트렌드 (2025~2026)

| 트렌드 | 설명 | 적용 여부 |
|--------|------|---------|
| **Bento Grid 레이아웃** | 대시보드를 그리드 카드로 구성 | 설정/통계 페이지에 적용 가능 |
| **Glassmorphism 절제** | backdrop-blur를 카드 배경에 미세 적용 | Toolbar, CommitBar에 이미 적용 (`backdrop-blur-sm`) -- 유지 |
| **Subtle Gradient** | 단색 대신 미세 그라데이션 배경 | EmptyState, AI 탭 배경에 `--brand-gradient` 미세 적용 |
| **Command Palette** | Cmd+K 검색/실행 통합 | 필수 도입 -- 노드 검색, 빠른 액션, 설정 접근 |
| **Spring Animation** | framer-motion spring이 표준 | 이미 적용 중 -- **프리셋 통일** 필요 |
| **Progressive Disclosure** | 기능을 단계적으로 노출 | RightPanel의 섹션 접기/펼치기에 이미 적용 -- 강화 |

---

## 6. 구현 우선순위

### Phase 1: 기반 (1~2주) -- 디자인 토큰 정비

| 번호 | 항목 | 난이도 | 영향도 |
|------|------|--------|--------|
| D1-1 | Semantic color 토큰 추가 (`success/warning/info`) | 낮음 | 높음 |
| D1-2 | 타이포그래피 최소 사이즈 11px 상향 + 스케일 정리 | 낮음 | 높음 |
| D1-3 | 애니메이션 프리셋 통합 (`motionPresets` 상수) | 낮음 | 중간 |
| D1-4 | Elevation 체계 CSS 변수화 | 낮음 | 중간 |
| D1-5 | `prefers-reduced-motion` 대응 | 낮음 | 중간 |

### Phase 2: 핵심 UI (2~3주) -- 캔버스 + 패널

| 번호 | 항목 | 난이도 | 영향도 |
|------|------|--------|--------|
| D2-1 | ClassNode 아이콘 뱃지 + 라벨 확장 | 중간 | 높음 |
| D2-2 | InstanceNode 형태 변경 (원형 -> 둥근 사각형) | 중간 | 높음 |
| D2-3 | 엣지 타입별 시각 구분 (화살표, 라벨 캡슐) | 중간 | 높음 |
| D2-4 | 패널 리사이저 + 접기/펼치기 | 중간 | 높음 |
| D2-5 | 커맨드 팔레트 (Cmd+K) | 중간 | 높음 |
| D2-6 | 하단 바 통합 (줌바 + 힌트바 합체) | 낮음 | 중간 |

### Phase 3: 인터랙션 (2~3주) -- 마이크로인터랙션 + 브랜딩

| 번호 | 항목 | 난이도 | 영향도 |
|------|------|--------|--------|
| D3-1 | 노드 생성/삭제 애니메이션 강화 | 중간 | 중간 |
| D3-2 | 엣지 드로잉 애니메이션 | 중간 | 중간 |
| D3-3 | 드래그 시각 피드백 (그림자, 겹침 감지) | 중간 | 중간 |
| D3-4 | 스켈레톤 리뉴얼 (계층/유령 그래프) | 낮음 | 낮음 |
| D3-5 | 로고 마크 + 파비콘 디자인 | 낮음 | 중간 |
| D3-6 | 브랜드 그라데이션 적용 | 낮음 | 낮음 |

### Phase 4: 폴리시 (1~2주) -- 세부 조정

| 번호 | 항목 | 난이도 | 영향도 |
|------|------|--------|--------|
| D4-1 | Pretendard 폰트 한국어 폴백 추가 | 낮음 | 중간 |
| D4-2 | AI 탭 "준비 중" 상태 UI | 낮음 | 낮음 |
| D4-3 | LLM 파싱 프로그레스 바 개선 | 낮음 | 낮음 |
| D4-4 | 접근성 감사 (키보드 포커스, aria-label) | 중간 | 중간 |
| D4-5 | 반응형 레이아웃 (1280px 미만 대응) | 중간 | 중간 |

---

> **총 예상 기간**: 6~10주 (병렬 작업 가정 시 4~6주)
> **핵심 원칙**: 현행 shadcn/ui + Tailwind + framer-motion 스택 100% 활용, 새 의존성 최소화.
> **가장 임팩트 높은 3가지**: (1) 타이포그래피 정리, (2) 엣지 시각 구분, (3) 커맨드 팔레트 도입.
