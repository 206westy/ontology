# Ontology Studio v4 Design System

> 현재 v3 디자인 토큰 분석 + v4 개선안을 포함한 완전한 디자인 시스템 문서

---

## 1. Color System

### 1-1. Primary Palette (Signature Gradient)

Ontology Studio의 시그니처 컬러는 **Violet-to-Blue 그라데이션**이다. Primary(Violet)는 CTA/브랜딩, Accent(Blue)는 링크/보조 인터랙션에 사용한다.

| Token | Light | Dark | Hex (Light) | 용도 |
|-------|-------|------|-------------|------|
| `--primary` | `263 70% 50.4%` | `263 70% 58%` | `#7c3aed` | CTA, 브랜딩, 포커스링 |
| `--accent` | `217 91% 60%` | `217 91% 65%` | `#3b82f6` | 링크, 보조 CTA, 정보 강조 |
| `--ring` | `263 70% 50.4%` | `263 70% 58%` | `#7c3aed` | 포커스 아웃라인 |

**v4 개선: 그라데이션 유틸리티 추가**

```css
/* globals.css에 추가 */
.gradient-brand {
  background: linear-gradient(135deg, hsl(263 70% 50.4%), hsl(217 91% 60%));
}
.gradient-brand-subtle {
  background: linear-gradient(135deg, hsl(263 70% 50.4% / 0.08), hsl(217 91% 60% / 0.08));
}
/* 다크모드 */
.dark .gradient-brand {
  background: linear-gradient(135deg, hsl(263 70% 58%), hsl(217 91% 65%));
}
.dark .gradient-brand-subtle {
  background: linear-gradient(135deg, hsl(263 70% 58% / 0.12), hsl(217 91% 65% / 0.12));
}
```

### 1-2. Semantic Colors (Status)

| Token | Light | Dark | Hex (Light) | 용도 |
|-------|-------|------|-------------|------|
| `--success` | `142 71% 45%` | `142 60% 40%` | `#22c55e` | 성공, 저장 완료, 유효 |
| `--warning` | `38 92% 50%` | `38 80% 45%` | `#f59e0b` | 경고, 미저장 변경 |
| `--destructive` | `0 84.2% 60.2%` | `0 62.8% 30.6%` | `#ef4444` | 삭제, 오류, 위험 작업 |
| `--info` | `217 91% 60%` | `217 80% 55%` | `#3b82f6` | 정보, 힌트 |

각 상태색에는 `foreground`(텍스트)와 `light`(배경 tint) 변형이 함께 제공된다:
- `--success-light`: `142 76% 95%` / `142 40% 12%`
- `--warning-light`: `48 96% 95%` / `38 40% 12%`
- `--info-light`: `214 95% 96%` / `217 40% 12%`

### 1-3. Surface & Background Hierarchy

4단계 Surface 위계로 시각적 깊이를 표현한다.

| Token | Light | Dark | 용도 |
|-------|-------|------|------|
| `--surface-0` | `0 0% 98%` (#fafafa) | `240 10% 3.9%` (#0a0a0f) | 앱 배경 |
| `--surface-1` | `0 0% 100%` (#ffffff) | `240 10% 5.9%` (#0f0f17) | 패널, 카드 |
| `--surface-2` | `240 4.8% 95.9%` (#f4f4f5) | `240 3.7% 15.9%` (#27272a) | 입력필드, 드롭다운 |
| `--surface-3` | `240 5% 92%` (#e9e9ec) | `240 4% 20%` (#303033) | 호버, 활성 상태 |
| `--surface-overlay` | `0 0% 0% / 0.5` | `0 0% 0% / 0.7` | 모달/팝오버 배경 |

**v4 개선: surface-raised 추가**

```css
--surface-raised: 0 0% 100%;        /* Light: card와 동일하나 elevation-2 적용 */
--surface-raised: 240 10% 7.5%;     /* Dark */
```

팝오버/드롭다운/컨텍스트 메뉴처럼 "떠 있는" 요소에 `surface-raised + elevation-2` 조합 사용.

### 1-4. Node Colors

10종류의 노드 타입별 고유 색상. Light/Dark 모드에서 border 색상은 유지하고 배경 opacity만 조절한다 (Light: 12%, Dark: 20%).

| Key | Light Border | Dark Border | Hex (Light) | 의미 |
|-----|-------------|-------------|-------------|------|
| `root` | `263 70% 50.4%` | `263 67% 65%` | `#7c3aed` | 루트 클래스 |
| `mid` | `221 83% 53%` | `217 91% 60%` | `#2563eb` | 중간 클래스 |
| `leaf` | `192 91% 36%` | `189 94% 43%` | `#0891b2` | 하위 클래스 |
| `instance` | `142 77% 73%` | `142 69% 58%` | `#86efac` | 인스턴스 |
| `person` | `38 92% 50%` | `38 93% 57%` | `#d97706` | 사람 |
| `place` | `0 72% 51%` | `0 91% 71%` | `#dc2626` | 장소 |
| `event` | `330 81% 60%` | `330 81% 60%` | `#db2777` | 이벤트 |
| `concept` | `239 84% 67%` | `239 84% 75%` | `#6366f1` | 개념 |
| `process` | `167 85% 40%` | `167 80% 55%` | `#14b8a6` | 프로세스 |
| `artifact` | `263 70% 50.4%` | `263 70% 70%` | `#8b5cf6` | 산출물 |

**v4 개선: 노드 선택 상태 강화**

```css
/* 선택된 노드의 glow ring */
--node-selected-glow-spread: 3px;
--node-selected-glow-blur: 12px;
--node-selected-glow-opacity: 0.25;

/* 연관 노드 하이라이트 (선택 노드와 관계가 있는 노드) */
--node-related-opacity: 0.85;
--node-unrelated-opacity: 0.35;   /* dim 처리 */
```

### 1-5. AI Interaction Colors

| Token | Light | Dark | 용도 |
|-------|-------|------|------|
| `--ai-primary` | `263 70% 50.4%` | `263 70% 58%` | AI 기능 아이콘/텍스트 |
| `--ai-glow` | `263 70% 50.4% / 0.15` | `263 70% 58% / 0.20` | AI 관련 요소 글로우 |
| `--ai-surface` | `263 83% 97%` | `263 30% 12%` | AI 채팅 배경, 제안 카드 |
| `--ai-suggestion-bg` | `263 83% 97%` | `263 30% 12%` | AI 제안 배경 |
| `--ai-suggestion-border` | `263 70% 70%` | `263 50% 40%` | AI 제안 테두리 |

### 1-6. Dark/Light Mode 전환 규칙

| 원칙 | 설명 |
|------|------|
| 배경 반전 | Surface: 밝음 -> 어두움, 대비 유지 |
| 텍스트 반전 | `foreground` <-> `background` 상호 교환 |
| Border 약화 | Dark에서 border 대비를 낮춰 시각적 노이즈 감소 |
| 노드 bg opacity 증가 | Light 12% -> Dark 20% (어두운 배경에서 가독성) |
| Shadow 강화 | Dark에서 shadow opacity 2배 (구조적 깊이 유지) |
| Primary 밝기 상향 | `50.4%` -> `58%` (어두운 배경 대비) |

---

## 2. Typography

### 2-1. Font Family

| 용도 | 폰트 | 변수 |
|------|------|------|
| 본문 (한글+영문) | **Pretendard Variable** | `--font-sans` |
| 영문 보조 | **Outfit** (Google Fonts) | `--font-outfit` |
| 코드/모노 | **JetBrains Mono** (Google Fonts) | `--font-mono` |

**현재 구현**: `layout.tsx`에서 Pretendard를 CDN으로 로드, Outfit/JetBrains Mono는 `next/font/google`로 로드.
- Font stack: `Pretendard Variable, var(--font-outfit), ui-sans-serif, system-ui, sans-serif`

**v4 개선: Inter 추가 고려**

영문 UI 라벨이 많은 도구 특성상 **Inter**를 Outfit 대신 사용하는 것을 권장. Inter는 소형 텍스트에서 가독성이 뛰어나고 tabular figures를 지원하여 노드 카운트/통계 표시에 적합하다. 단, Pretendard는 그대로 유지 (한글 최적화).

```typescript
// layout.tsx 변경안
import { Inter, JetBrains_Mono } from 'next/font/google';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});
```

### 2-2. Type Scale

5단계 타이포그래피 스케일 (현재 v3 구현 완료):

| Token | Size | Line Height | Weight | Tailwind Class | 용도 |
|-------|------|-------------|--------|---------------|------|
| `--text-caption` | 11px | 1.3 | 400 | `text-caption` | 보조 텍스트, 배지, 타임스탬프 |
| `--text-body-sm` | 12px | 1.5 | 400 | `text-body-sm` | 노드 라벨, 트리 항목 |
| `--text-body` | 13px | 1.5 | 400 | `text-body` | 본문 텍스트, 입력필드 |
| `--text-heading-sm` | 14px | 1.3 | 600 | `text-heading-sm` | 섹션 제목, 패널 헤더 |
| `--text-heading` | 18px | 1.3 | 700 | `text-heading` | 페이지 제목, 다이얼로그 타이틀 |

**v4 개선: display 단계 추가**

```css
--text-display: 1.5rem;     /* 24px — 빈 상태 안내문, 온보딩 */
--text-display-lg: 2rem;    /* 32px — 스플래시, 대형 헤딩 */
```

### 2-3. Letter Spacing & Line Height

| Token | Value | 적용 대상 |
|-------|-------|----------|
| `--tracking-tight` | `-0.01em` | heading, heading-sm |
| `--tracking-normal` | `0` | body, body-sm, caption |
| `--tracking-wide` | `0.05em` | 대문자 섹션 레이블 (e.g., "클래스 트리") |
| `--leading-tight` | `1.3` | heading 계열 |
| `--leading-normal` | `1.5` | body 계열 |
| `--leading-relaxed` | `1.6` | 긴 설명 텍스트 |

---

## 3. Spacing & Layout

### 3-1. Spacing Scale (4px Base Grid)

| Token | Value | 용도 |
|-------|-------|------|
| `space-xs` | 4px | 아이콘-텍스트 간격, 밀집 배치 |
| `space-sm` | 8px | 버튼 내부 패딩, 리스트 항목 간격 |
| `space-md` | 12px | 섹션 내부 패딩 |
| `space-lg` | 16px | 패널 패딩, 카드 패딩 |
| `space-xl` | 24px | 섹션 간 간격 |
| `space-2xl` | 32px | 대형 간격, 페이지 마진 |

**v4 개선: 3xl, 4xl 추가**

```css
--space-3xl: 48px;   /* 큰 섹션 분리 */
--space-4xl: 64px;   /* 페이지 레벨 여백 */
```

### 3-2. Panel & Layout Dimensions

| 요소 | 현재 값 | v4 제안 | 비고 |
|------|--------|---------|------|
| ExplorerPanel 너비 | 260px | 260px (min) ~ 360px (resizable) | 드래그 리사이즈 추가 |
| RightPanel 너비 | 320px | 320px (min) ~ 440px (resizable) | 드래그 리사이즈 추가 |
| Toolbar 높이 | 46px | 44px | Linear 참고, 1px 절감 |
| CommitBar 높이 | 38px | 36px | 더 컴팩트하게 |
| 트리 항목 높이 | ~30px (py-1.5) | 32px (py-2) | 터치 타겟 개선 |
| 트리 들여쓰기 | 18px/depth | 20px/depth | 시각적 위계 강화 |

### 3-3. Border Radius Scale

| Token | Value | 용도 |
|-------|-------|------|
| `--radius-sm` | 6px | 배지, 작은 버튼, 입력 필드 |
| `--radius` (md) | 10px | 카드, 팝오버, 일반 버튼 |
| `--radius-lg` | 14px | 다이얼로그, 패널, 큰 컨테이너 |
| `--radius-full` | 9999px | 원형 노드, 원형 배지, 필 |

---

## 4. Component Tokens

### 4-1. Button Variants

| Variant | Background | Text | Border | 호버 | 용도 |
|---------|-----------|------|--------|------|------|
| `default` (primary) | `primary` | `primary-foreground` | none | darken 10% | 주요 CTA |
| `secondary` | `secondary` | `secondary-foreground` | none | `surface-3` | 도구 모드 활성 |
| `outline` | transparent | `foreground` | `border` | `accent/5` | 보조 액션 |
| `ghost` | transparent | `foreground` | none | `muted/60` | 도구 버튼 |
| `destructive` | `destructive` | `destructive-foreground` | none | darken 10% | 삭제 |
| `ai` (v4 신규) | `gradient-brand` | white | none | glow effect | AI 관련 CTA |

**현재 사이즈**: `h-6`(CommitBar), `h-7`(Toolbar), `h-8`(패널), `h-9`(EmptyState)

**v4 개선: 일관된 size 토큰**

| Size | Height | Padding X | Font Size | Icon Size | 용도 |
|------|--------|-----------|-----------|-----------|------|
| `xs` | 24px (h-6) | px-2 | 11px | 12px (w-3) | CommitBar, 밀집 UI |
| `sm` | 28px (h-7) | px-2.5 | 12px | 14px (w-3.5) | Toolbar |
| `md` | 32px (h-8) | px-3 | 13px | 16px (w-4) | 패널, 폼 |
| `lg` | 36px (h-9) | px-4 | 13px | 16px (w-4) | EmptyState, 모달 CTA |

### 4-2. Input Fields

```
Height: h-8 (32px) 기본, h-9 (36px) 확장
Background: surface-2 또는 muted/50
Border: border 색상, focus시 primary/30 ring
Border Radius: radius-sm (6px)
Font: text-body-sm (12px) 또는 text-body (13px)
Padding: pl-8 (아이콘 포함시), px-3 (일반)
```

**v4 개선**: focus 상태에서 `elevation-1` shadow 추가로 "떠오르는" 피드백 제공.

### 4-3. Popover / Dialog

| 속성 | 현재 | v4 개선 |
|------|------|---------|
| Background | `popover` (white/#0f0f17) | 동일 |
| Border | `border` | `border` + `elevation-2` shadow |
| Radius | `radius-lg` (14px) | 동일 |
| Animation | spring (damping:25, stiffness:350) | 동일, exit는 더 빠르게 (120ms) |
| Overlay | `surface-overlay` (50%/70%) | 동일 |
| Width | 340px~360px (popover별 상이) | 통일: 360px 기본, 480px 확장 |

### 4-4. Card / Panel

```
Background: surface-1 (card)
Border: border-r / border-l / border-b (위치별 단면 border)
Shadow: 패널 자체는 shadow 없음 (border로 분리), 떠 있는 카드는 elevation-1
Radius: 패널은 0 (전체 높이), 내부 카드는 radius-md
```

### 4-5. Badge / Tag

| Variant | 현재 구현 | 용도 |
|---------|----------|------|
| `secondary` | `bg-secondary text-xs` | 버전 배지 (`v0.1 draft`) |
| `outline` | `border + text-xs font-mono` | OP 배지 (ADD/MOD/DEL) |
| 노드 타입 배지 | 노드 색상 기반 pill | 트리뷰/패널 타입 표시 |

**v4 개선: 상태별 배지 색상 통일**

```
ADD: bg-success-light text-success border-success/30
MOD: bg-warning-light text-warning border-warning/30
DEL: bg-destructive/10 text-destructive border-destructive/30
```

### 4-6. Toast / Notification

현재 `sonner` 라이브러리 사용. 4종류 상태:
- `toast.success()`: 초록 아이콘 + 성공 메시지
- `toast.error()`: 빨강 아이콘 + 오류 메시지
- `toast.warning()`: 노랑 아이콘 + 경고 메시지
- `toast.info()`: 파랑 아이콘 + 정보 메시지

**v4 개선**: 토스트 위치를 `bottom-right`에서 `bottom-center`로 이동 (CommitBar와 겹침 방지).

---

## 5. Animation & Motion

### 5-1. Duration Tokens

| Token | Value | 용도 |
|-------|-------|------|
| `--duration-instant` | 100ms | 호버, 포커스, 토글 |
| `--duration-fast` | 150ms | 버튼 클릭, 작은 트랜지션 |
| `--duration-normal` | 250ms | 패널 전환, 팝오버 열기 |
| `--duration-slow` | 400ms | 페이지 전환, 대형 애니메이션 |
| `--duration-emphasis` | 600ms | 온보딩, 주의 끌기 |

### 5-2. Easing Tokens

| Token | Value | 성격 |
|-------|-------|------|
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | 빠른 시작, 부드러운 착지 |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | 대칭적 가감속 |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 바운스 느낌 |

### 5-3. Motion Presets (motion/react)

| Preset | Type | Config | 용도 |
|--------|------|--------|------|
| `panelSlide` | spring | damping:22, stiffness:280 | ExplorerPanel/RightPanel 슬라이드 |
| `nodeEnter` | spring | damping:14, stiffness:300 | 노드 생성 시 scale-up |
| `collapse` | tween | 200ms, ease-out | 트리 항목 접기/펼치기 |
| `overlay` | tween | 250ms, ease-out | 팝오버/모달 오버레이 |
| `nodeExit` | tween | 150ms, ease-out | 노드 삭제 시 shrink+fade |
| `snapBounce` | spring | damping:20, stiffness:400 | 노드 드래그 놓기 |

**v4 개선: 추가 프리셋**

```typescript
/** 엣지 연결 시 경로 드로잉 애니메이션 */
export const edgeDraw = {
  type: 'tween' as const,
  duration: 0.3,
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
};

/** 필터 모드 dim/highlight 전환 */
export const focusTransition = {
  duration: 0.25,
  ease: [0.65, 0, 0.35, 1] as [number, number, number, number],
};

/** 자동저장 인디케이터 펄스 */
export const savePulse = {
  type: 'tween' as const,
  duration: 0.4,
  ease: 'easeInOut',
};

/** AI 스트리밍 글로우 */
export const aiGlow = {
  type: 'tween' as const,
  duration: 1.5,
  ease: 'easeInOut',
  repeat: Infinity,
  repeatType: 'reverse' as const,
};
```

### 5-4. Reduced Motion 지원

현재 구현 완료:
- CSS: `@media (prefers-reduced-motion: reduce)` 에서 모든 애니메이션 0.01ms로 축소
- JS: `prefersReducedMotion()` 헬퍼 + `safeTransition()` 래퍼

### 5-5. 그래프 관련 애니메이션 상세

| 인터랙션 | 현재 | v4 개선 |
|---------|------|---------|
| 노드 생성 | scale 0.5->1, opacity 0->1 (spring) | 동일 + 잔물결(ripple) 효과 |
| 노드 삭제 | scale 1->0.8, opacity 1->0 (150ms) | 동일 |
| 노드 호버 | scale 1.05 (CSS transition) | scale 1.03 + elevation-2 shadow |
| 노드 선택 | glow ring (즉시) | glow ring + 연관노드 하이라이트 (250ms) |
| 엣지 연결 | 즉시 렌더 | SVG path stroke-dashoffset 드로잉 |
| 엣지 호버 | stroke 변경 (150ms) | stroke-width 증가 + 레이블 팝업 |
| 레이아웃 정리 | 즉시 재배치 | 500ms spring 트랜지션으로 노드 이동 |
| 줌 변경 | 즉시 | 200ms ease-out 트랜지션 |

---

## 6. Iconography

### 6-1. Icon Library

**lucide-react** 사용 (현재 v3 구현 완료).

### 6-2. Icon Size Scale

| Context | Size | Tailwind | 예시 |
|---------|------|----------|------|
| 밀집 UI (CommitBar) | 12px | `w-3 h-3` | Undo2, List |
| Toolbar 도구 | 14px | `w-3.5 h-3.5` | ZoomIn, Hand |
| 패널 헤더/버튼 | 16px | `w-4 h-4` | Plus, Search |
| EmptyState/온보딩 | 24px | `w-6 h-6` | Sparkles, MousePointerClick |
| EmptyState 메인 | 28px | `w-7 h-7` | Sparkles (중앙) |
| 노드 배지 아이콘 | 10px | `w-2.5 h-2.5` | Crown, Leaf, User |

### 6-3. Icon + Text 조합 규칙

```
버튼: [Icon 14px] [gap-1 ~ gap-1.5] [Text]
배지: [Icon 10~12px] [gap-1] [Text]
리스트: [Icon 14px] [gap-1.5~2] [Text] ... [Meta 우측 정렬]
노드:  Icon은 배지로 노드 모서리에 배치 (20x20px 원형)
```

**v4 개선: stroke-width 규칙**
- 기본: `strokeWidth={2}` (lucide 기본값)
- 14px 이하 아이콘: `strokeWidth={1.5}` (세밀한 디테일 유지)
- 24px 이상 아이콘: `strokeWidth={1.5}` (과도한 두께 방지)

---

## 7. Elevation System

4단계 + AI 전용 elevation:

| Level | Light Shadow | Dark Shadow | 용도 |
|-------|-------------|-------------|------|
| `elevation-0` | none | none | 인라인 요소 |
| `elevation-1` | `0 1px 3px rgba(0,0,0,0.06)` | `0 1px 3px rgba(0,0,0,0.12)` | 카드, 배지 |
| `elevation-2` | `0 4px 16px rgba(0,0,0,0.08)` | `0 4px 16px rgba(0,0,0,0.16)` | 팝오버, 드롭다운 |
| `elevation-3` | `0 8px 32px rgba(0,0,0,0.12)` | `0 8px 32px rgba(0,0,0,0.24)` | 모달, 다이얼로그 |
| `elevation-ai` | `0 0 20px primary/15` | `0 0 20px primary/20` | AI 인터랙션 글로우 |

---

## 8. Responsive & Accessibility

### 8-1. 최소 화면 지원

Ontology Studio는 데스크톱 전용 도구. 최소 화면: **1280x720**.

| Breakpoint | 동작 |
|-----------|------|
| < 1280px | ExplorerPanel 접기, RightPanel 오버레이 모드 |
| 1280~1600px | 기본 레이아웃 |
| > 1600px | 넓은 패널 너비 허용 |

### 8-2. Focus & Keyboard

- 모든 인터랙티브 요소에 `focus-visible` 링 (`ring-primary/30`)
- Tab 순서: ExplorerPanel -> Toolbar -> Canvas -> RightPanel -> CommitBar
- 현재 포커스 링 애니메이션: `node-focus-ring` keyframe (1.5s pulsing)

### 8-3. Color Contrast

- 모든 텍스트는 WCAG AA 이상 대비를 유지 (4.5:1 이상)
- 노드 라벨: `text-foreground` on tinted background -> 충분한 대비
- Muted text: `muted-foreground` on `background` -> AA 충족 확인 필요

---

## 9. v4 신규 토큰 요약

```css
:root {
  /* Gradient */
  --gradient-brand-from: 263 70% 50.4%;
  --gradient-brand-to: 217 91% 60%;

  /* Surface */
  --surface-raised: 0 0% 100%;

  /* Typography */
  --text-display: 1.5rem;
  --text-display-lg: 2rem;

  /* Spacing */
  --space-3xl: 48px;
  --space-4xl: 64px;

  /* Node interaction */
  --node-selected-glow-spread: 3px;
  --node-selected-glow-blur: 12px;
  --node-selected-glow-opacity: 0.25;
  --node-related-opacity: 0.85;
  --node-unrelated-opacity: 0.35;

  /* Focus mode */
  --focus-dim-opacity: 0.15;
  --focus-highlight-ring: 2px;

  /* Auto-save indicator */
  --autosave-dot-size: 6px;
}
```
