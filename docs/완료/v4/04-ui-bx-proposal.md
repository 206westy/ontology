# Ontology Studio v4 UI/BX 개선안

> 벤치마킹 분석 + 구체적 개선 제안 + Tailwind/CSS 구현 가이드

---

## E11. 브랜딩

### 로고 디자인 컨셉

**"연결된 3노드 삼각형"** -- 온톨로지의 핵심인 "관계로 연결된 개체"를 3개의 노드가 삼각형으로 연결된 형태로 표현한다.

```
구조:
    (A)
   / \
 (B)---(C)

- 3개의 원형 노드 (6px stroke)
- 3개의 연결선 (2px stroke)
- Violet-to-Blue 그라데이션 적용
- 좌측 노드(B)가 약간 크게 (계층 암시)
```

**SVG 로고 가이드**:
- 아이콘 마크: 28x28px (Toolbar용), 32x32px (스플래시용), 16x16px (Favicon)
- 색상: `linear-gradient(135deg, #7c3aed, #3b82f6)`
- 배경: 투명 또는 `rounded-lg bg-gradient-brand`

**현재 구현** (`ExplorerPanel.tsx:241-243`):
```tsx
<div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
  <Box className="w-4 h-4 text-primary-foreground" />
</div>
```

**v4 개선**: Box 아이콘을 커스텀 SVG 로고로 교체. 그라데이션 배경 적용.

```tsx
// v4 로고 컴포넌트
<div className="w-7 h-7 rounded-lg gradient-brand flex items-center justify-center">
  <OntologyLogo className="w-4 h-4 text-white" />
</div>
```

### 시그니처 컬러 적용 위치

| 요소 | 현재 | v4 |
|------|------|-----|
| ExplorerPanel 로고 | `bg-primary` 단색 | `gradient-brand` 그라데이션 |
| Toolbar 타이틀 | 일반 텍스트 | `text-transparent bg-clip-text gradient-brand` (그라데이션 텍스트) |
| 빈 상태 Sparkles 아이콘 | `text-primary/60` | `gradient-brand` 적용 |
| AI 기능 아이콘 | `text-primary` | `gradient-brand` + 글로우 |
| 저장 완료 인디케이터 | 없음 | `gradient-brand` 체크마크 애니메이션 |

### Favicon 디자인

- 16x16 / 32x32 SVG
- 삼각형 3노드 마크의 단순화 버전
- 배경: 투명, 노드 색상: white, 그라데이션 스트로크

### 로딩/스플래시 화면

**현재** (`page.tsx:27-33`): Loader2 스피너 + "온톨로지 로딩 중..." 텍스트

**v4 개선**:

```tsx
<div className="h-screen w-screen flex items-center justify-center bg-background">
  <div className="flex flex-col items-center gap-4">
    {/* 로고 마크 + 펄스 애니메이션 */}
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', damping: 12, stiffness: 200 }}
      className="relative"
    >
      <div className="absolute inset-0 rounded-2xl gradient-brand-subtle animate-ping"
           style={{ animationDuration: '2s' }} />
      <div className="w-16 h-16 rounded-2xl gradient-brand flex items-center justify-center">
        <OntologyLogo className="w-8 h-8 text-white" />
      </div>
    </motion.div>

    {/* 브랜드 텍스트 */}
    <div className="text-center">
      <h1 className="text-heading font-bold bg-clip-text text-transparent gradient-brand">
        Ontology Studio
      </h1>
      <p className="text-caption text-muted-foreground mt-1">Loading workspace...</p>
    </div>

    {/* 프로그레스 바 */}
    <div className="w-32 h-0.5 bg-muted rounded-full overflow-hidden">
      <motion.div
        className="h-full gradient-brand rounded-full"
        initial={{ width: '0%' }}
        animate={{ width: '100%' }}
        transition={{ duration: 2, ease: 'easeInOut' }}
      />
    </div>
  </div>
</div>
```

---

## 그래프 캔버스 개선

### 노드 디자인 리파인

**현재 분석** (`ClassNode.tsx`):
- 원형 노드, 직경 44~80px (인스턴스 개수에 비례)
- 1.5px solid border, tinted background (12% opacity)
- 선택 시: glow ring (3px spread + 12px blur)
- 호버: `hover:scale-[1.05]` + `hover:shadow-lg`
- 빈 노드: dashed border + opacity 0.55

**v4 개선**:

```
1. 호버 효과 정제
   - scale 1.05 -> 1.03 (과도한 확대 억제)
   - shadow-lg -> elevation-2 (일관된 시스템 사용)
   - 호버 시 border-width 1.5px -> 2px 증가 (미묘한 강조)

2. 선택 상태 강화
   - 외부 링: primary 색상 2px ring + 노드 색상 glow
   - 연관 노드: 관계가 있는 노드도 opacity 1.0 유지
   - 비관련 노드: opacity 0.35로 dim 처리 (포커스 모드)

3. 노드 내부 콘텐츠 개선
   - 속성 카운트 표시: 노드 내부에 작은 점으로 속성 수 힌트
   - 미리보기: 호버 시 300ms 후 속성 툴팁 표시

4. 상태 인디케이터
   - 미저장 변경: 노드 좌상단에 작은 amber dot (4px)
   - 유효성 오류: 노드 테두리를 destructive 색상으로 변경
   - AI 제안 노드: ai-glow 그림자 + dashed border
```

**구현 CSS 변수**:
```css
/* 노드 호버 */
.class-node:hover {
  transform: scale(1.03);
  box-shadow: var(--elevation-2);
  border-width: 2px;
  transition: all var(--duration-fast) var(--ease-out);
}

/* 노드 선택 */
.class-node.selected {
  box-shadow: 0 0 0 var(--node-selected-glow-spread) hsl(var(--node-COLOR) / var(--node-selected-glow-opacity)),
              0 0 var(--node-selected-glow-blur) hsl(var(--node-COLOR) / 0.15);
}
```

### 엣지 디자인

**현재** (`GraphCanvas.tsx:98~`):
- is-a 엣지: solid line + triangle marker (상속)
- relation 엣지: 일반 선 + 텍스트 레이블
- 엣지 레이블: capsule 배지 (`react-flow__edge-textbg`)

**v4 개선**:

```
1. 엣지 유형별 시각적 분화
   - is-a (상속): solid, 2px, 삼각형 화살표 (채워진 형태)
   - has-a (속성): dashed, 1.5px, 다이아몬드 마커
   - relation (커스텀): solid, 1.5px, 화살표 마커
   - instance-of: dotted, 1px, 열린 삼각형

2. 엣지 곡선 개선
   - 직선 -> smoothstep 또는 bezier 곡선
   - 겹치는 엣지: 자동 간격 조절 (3px offset)

3. 엣지 호버/선택
   - 호버: stroke-width 1.5 -> 3px, 색상 진하게
   - 호버 시 레이블 강조 (opacity 1.0, bold)
   - 선택: primary 색상으로 하이라이트

4. 방향 표시
   - 모든 엣지에 방향 화살표 (arrowhead)
   - 양방향 관계: 양쪽 화살표
   - 화살표 크기: 8x6px (겹침 최소화)
```

### 미니맵 디자인

**현재** (`globals.css:316~320`):
```css
.react-flow__minimap {
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: var(--shadow-card);
}
```

**v4 개선**:
```css
.react-flow__minimap {
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--elevation-2);
  border: 1px solid hsl(var(--border));
  background: hsl(var(--surface-1)) !important;
  opacity: 0.9;
  transition: opacity var(--duration-fast) var(--ease-out);
}

.react-flow__minimap:hover {
  opacity: 1;
}
```

위치: 우측 하단 -> 좌측 하단으로 변경 (RightPanel과 겹침 방지).

---

## 패널 디자인

### ExplorerPanel 트리뷰 디자인

**현재 분석** (`ExplorerPanel.tsx`):
- 260px 고정 폭, `border-r border-border bg-card`
- 트리 항목: color dot + name + instance count
- 접기/펼치기: `ChevronRight` 아이콘 + rotate-90

**v4 개선**:

```
1. 리사이즈 핸들
   - 우측 경계에 드래그 핸들 (3px hover zone -> 1px line)
   - 커서 col-resize, 드래그 중 min 220px / max 400px

2. 트리 항목 인터랙션
   - 드래그앤드롭 재배치 (dnd-kit 활용)
   - 우클릭 컨텍스트 메뉴
   - 인라인 이름 변경 (더블클릭)

3. 섹션 구분 강화
   - "클래스 트리" 레이블을 sticky header로
   - 카운트 배지: (5 classes, 12 instances) 상세 표시

4. 빈 상태 개선
   - 빈 트리: 일러스트 + "캔버스를 더블클릭하여 시작하세요" 안내
   - 검색 결과 없음: 인라인 생성 옵션 제공
```

**Tailwind 구현**:
```tsx
// 리사이즈 핸들
<div
  className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize
             hover:bg-primary/20 active:bg-primary/40
             transition-colors duration-100"
  onMouseDown={handleResizeStart}
/>

// Sticky 섹션 헤더
<div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm px-2 py-2 border-b border-border/50">
  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
    클래스 트리
  </span>
</div>
```

### RightPanel 프로퍼티 에디터 디자인

**현재 분석** (`RightPanel.tsx`):
- 320px 고정 폭, spring 슬라이드 애니메이션
- Tabs: 속성/AI 어시스턴트
- CollapsibleSection 패턴
- InlineEditableText 패턴

**v4 개선**:

```
1. 탭 디자인 리뉴얼
   - 현재: shadcn TabsList (기본)
   - v4: underline 스타일 탭 (Figma 참고)
     - 선택된 탭: primary 색상 underline (2px)
     - 미선택 탭: muted-foreground 텍스트
     - 탭 전환 시 underline 슬라이딩 애니메이션

2. 속성 에디터 레이아웃
   - 속성명 | 타입 | 값 — 3열 그리드
   - 인라인 편집: 클릭 시 즉시 편집 모드 (별도 모달 불필요)
   - 속성 추가: 마지막 행에 "+" 버튼 (ghost 스타일)

3. 관계 시각화
   - 들어오는/나가는 관계를 화살표로 시각적 구분
   - 관계 클릭 시 해당 노드로 포커스 이동 + 캔버스 팬

4. 빈 상태
   - 노드 미선택: 중앙에 "노드를 선택하세요" + 마우스 클릭 일러스트
   - 속성 없음: "첫 번째 속성을 추가하세요" + Plus 아이콘
```

### CommitBar 상태 표시 디자인

**현재 분석** (`CommitBar.tsx`):
- 38px 높이, `bg-card/80 backdrop-blur-sm`
- 좌측: amber 펄스 dot + 변경사항 카운트 + ADD/MOD/DEL 컬러 텍스트
- 우측: 되돌리기, 변경내역, 저장, 반영 버튼

**v4 개선**:

```
1. 상태 표시 시각화
   - 변경 없음: 비활성 상태, 텍스트 dim
   - 변경 있음: amber dot 펄스 + 카운트 강조
   - 저장 중: primary 프로그레스 바 (하단 2px)
   - 저장 완료: success 체크 아이콘 (1.5초 후 fade out)

2. 레이아웃 정리
   - 좌측: [상태 인디케이터] [변경 요약]
   - 중앙: [프로그레스 바 / 상태 텍스트]
   - 우측: [되돌리기] [변경내역] | [저장] [반영]
   - 저장/반영 버튼 간 시각적 분리 (Separator)

3. 자동 저장 모드 (v4 신규 D6)
   - CommitBar 좌측에 자동저장 토글
   - 활성 시: "자동 저장 켜짐" + 초록 dot
   - 수동 저장은 그대로 유지 (명시적 커밋)
```

---

## 컨텍스트 메뉴 디자인 (D8)

### 메뉴 스타일

```tsx
// 캔버스 우클릭 컨텍스트 메뉴
<ContextMenu>
  <ContextMenuContent className="w-56 rounded-lg shadow-elevation-2 border border-border bg-popover p-1">
    <ContextMenuItem className="flex items-center gap-2 rounded-md px-2 py-1.5 text-body-sm cursor-pointer
                                hover:bg-muted/60 focus:bg-muted/60 transition-colors">
      <Plus className="w-4 h-4 text-muted-foreground" />
      <span>새 클래스 추가</span>
      <ContextMenuShortcut className="ml-auto text-caption text-muted-foreground font-mono">
        더블클릭
      </ContextMenuShortcut>
    </ContextMenuItem>
    ...
  </ContextMenuContent>
</ContextMenu>
```

### 컨텍스트별 메뉴 항목

| 컨텍스트 | 메뉴 항목 |
|---------|----------|
| 캔버스 빈 공간 | 새 클래스 추가, 붙여넣기, 전체 선택, 레이아웃 정리 |
| 클래스 노드 | 이름 변경, 색상 변경, 관계 추가, 인스턴스 추가, 계층 설정, 복제, 삭제 |
| 인스턴스 노드 | 이름 변경, 클래스 이동, 복제, 삭제 |
| 엣지 | 관계 유형 변경, 방향 반전, 삭제 |
| 트리 항목 | 이름 변경, 캔버스에서 찾기, 하위 항목 추가, 삭제 |

### 서브메뉴 인터랙션

```
- 메인 메뉴 항목에 ChevronRight 아이콘으로 서브메뉴 존재 표시
- 호버 200ms 후 서브메뉴 표시 (우측으로 슬라이드)
- 서브메뉴 배경: surface-raised + elevation-2
- 메뉴 간 전환: 150ms fade
```

---

## Text2Cypher 패널 디자인

### 입력 영역 스타일

```tsx
<div className="flex flex-col h-full">
  {/* 입력 */}
  <div className="p-4 border-b border-border">
    <div className="relative">
      <Textarea
        placeholder="자연어로 질의하세요... (예: '장비를 관리하는 모든 엔지니어를 찾아줘')"
        className="min-h-[80px] text-body resize-none rounded-lg border-border
                   bg-surface-1 shadow-elevation-1
                   focus:shadow-elevation-2 focus:border-primary/30
                   transition-all placeholder:text-muted-foreground/50"
      />
      <Button
        size="sm"
        className="absolute right-2 bottom-2 h-8 w-8 p-0 rounded-lg gradient-brand text-white"
      >
        <ArrowRight className="w-4 h-4" />
      </Button>
    </div>
  </div>

  {/* 생성된 Cypher 코드 */}
  <div className="px-4 py-3 bg-surface-2 border-b border-border">
    <pre className="font-mono text-body-sm text-foreground leading-relaxed">
      <code>MATCH (e:Engineer)-[:MANAGES]->(eq:Equipment) RETURN e, eq</code>
    </pre>
    <div className="flex items-center gap-2 mt-2">
      <Button variant="ghost" size="xs">복사</Button>
      <Button variant="ghost" size="xs">편집</Button>
      <Button variant="outline" size="xs" className="ml-auto">실행</Button>
    </div>
  </div>

  {/* 결과 영역 */}
  <div className="flex-1 overflow-auto p-4">
    {/* 테이블 뷰 또는 그래프 뷰 토글 */}
  </div>
</div>
```

### 결과 테이블/그래프 뷰

```
- 탭 전환: [테이블] [그래프] [원시 JSON]
- 테이블: 고정 헤더, 교차 행 배경 (surface-2 / surface-1)
- 그래프: 미니 React Flow 캔버스 (읽기 전용)
- 원시 JSON: 코드 블록 (JetBrains Mono, syntax highlight)
```

### 쿼리 히스토리 UI

```
- 사이드 드로어 또는 드롭다운 형태
- 각 항목: [시간] [자연어 요약] [결과 수]
- 클릭 시 해당 쿼리 복원
- 최근 20개 유지, 스크롤 가능
```

---

## 필터/포커스 모드 UI (D7)

### 필터 칩 디자인

```tsx
// Toolbar 또는 Canvas 상단에 필터 바
<div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-1/90 backdrop-blur-sm
                border-b border-border/50 overflow-x-auto">
  {/* 타입 필터 칩 */}
  <button className="flex items-center gap-1 h-6 px-2 rounded-full text-caption
                     bg-surface-2 hover:bg-surface-3 border border-border/50
                     transition-colors whitespace-nowrap">
    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#7c3aed' }} />
    <span>루트 클래스</span>
    <X className="w-2.5 h-2.5 text-muted-foreground ml-0.5" />
  </button>

  {/* 활성 필터 표시 */}
  <button className="flex items-center gap-1 h-6 px-2 rounded-full text-caption
                     bg-primary/10 text-primary border border-primary/20
                     transition-colors whitespace-nowrap">
    <span>사람 타입만</span>
    <X className="w-2.5 h-2.5" />
  </button>

  {/* 필터 추가 드롭다운 */}
  <button className="h-6 px-2 rounded-full text-caption text-muted-foreground
                     hover:bg-surface-2 border border-dashed border-border/50
                     transition-colors">
    <Plus className="w-3 h-3" />
  </button>
</div>
```

### 포커스 모드 시각적 상태

```
활성화 시:
1. 선택된 노드 + 1-hop 관계 노드: opacity 1.0, 정상 렌더링
2. 나머지 노드: opacity 0.15 (--focus-dim-opacity)
3. 관련 엣지: 정상 색상
4. 나머지 엣지: opacity 0.08 (거의 안 보임)
5. 캔버스 배경에 미묘한 vignette 효과 (선택 영역 강조)

전환 애니메이션:
- 진입: 250ms ease-in-out (focusTransition 프리셋)
- 퇴장: 200ms ease-out
- 노드별로 약간의 stagger (20ms 간격)

UI 인디케이터:
- Toolbar에 "포커스 모드" 토글 버튼
- 활성 시: 버튼 배경 primary/10, 아이콘 primary
- Tooltip: "Esc로 해제"
```

---

## 자동 저장 인디케이터 (D6)

### 저장 상태 표시

| 상태 | 인디케이터 | 텍스트 | 색상 |
|------|-----------|--------|------|
| 변경 없음 | 없음 | "저장됨" | muted-foreground |
| 변경 감지 | amber dot (pulse) | "변경 있음" | warning |
| 자동 저장 중 | 스피너 (12px) | "저장 중..." | muted-foreground |
| 저장 완료 | check 아이콘 (fade 1.5s) | "저장됨" | success |
| 저장 실패 | error 아이콘 | "저장 실패" | destructive |

### 위치와 스타일

```tsx
// CommitBar 좌측, 변경사항 카운트 옆
<div className="flex items-center gap-1.5">
  {/* 상태 dot */}
  <motion.div
    className={cn(
      "w-1.5 h-1.5 rounded-full",
      status === 'saved' && "bg-success",
      status === 'unsaved' && "bg-warning animate-pulse",
      status === 'saving' && "bg-muted-foreground",
      status === 'error' && "bg-destructive",
    )}
    layout
  />

  {/* 상태 텍스트 */}
  <AnimatePresence mode="wait">
    <motion.span
      key={status}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      className="text-caption text-muted-foreground"
    >
      {statusText}
    </motion.span>
  </AnimatePresence>
</div>
```

---

## 벤치마킹 분석

### Figma에서 차용할 패턴

| 패턴 | 적용 방법 |
|------|----------|
| **무한 캔버스 + 줌 LOD** | 현재 3단계 LOD 구현 완료 (dot/name/full). 추가: zoom 레벨에 따른 엣지 레이블 표시/숨김 |
| **좌측 레이어 패널** | ExplorerPanel의 트리뷰와 동일 구조. 차이점: Figma는 드래그 재배치 지원 -> v4에 추가 |
| **우측 디자인 패널** | RightPanel과 동일. Figma의 섹션 접기 패턴 + 인라인 편집 이미 적용 |
| **플로팅 Toolbar** | 현재 고정 Toolbar -> v4에서 옵션으로 플로팅 모드 제공 고려 |
| **Selection colors** | Figma의 파란색 선택 링을 참고하여 primary 색상 ring 적용 |

### Linear에서 차용할 패턴

| 패턴 | 적용 방법 |
|------|----------|
| **미니멀 UI** | 불필요한 border/shadow 최소화. 현재 잘 되어 있음 |
| **Cmd+K 커맨드 팔레트** | 이미 구현 (`CommandPalette.tsx`). 개선: 최근 사용 명령 상단 고정 |
| **키보드 중심 UX** | 현재 Ctrl+Z/Y, Ctrl+F, Del 등 구현. 추가: Tab으로 노드 간 이동, Enter로 편집 |
| **라이트 애니메이션** | Linear의 빠르고 미묘한 트랜지션 -> duration-fast (150ms) 기본 유지 |
| **상태 아이콘 + 색상** | 커밋 상태를 Linear 이슈 상태처럼 아이콘+색상 조합으로 표현 |

### Notion에서 차용할 패턴

| 패턴 | 적용 방법 |
|------|----------|
| **슬래시 명령** | 캔버스에서 `/` 입력 시 명령 팔레트 (노드 생성, 관계 추가 등) |
| **인라인 편집** | 이미 RightPanel에서 InlineEditableText로 구현. 확장: 노드 라벨 직접 더블클릭 편집 |
| **블록 드래그** | 트리뷰 항목의 드래그앤드롭 재배치 |
| **템플릿** | 이미 TemplatePopover로 구현. 확장: 사용자 정의 템플릿 저장 |

### Neo4j Bloom에서 차용할 패턴

| 패턴 | 적용 방법 |
|------|----------|
| **시맨틱 검색** | Text2Cypher 패널에서 자연어 쿼리 (이미 계획됨) |
| **노드 확장** | 노드 더블클릭 시 관련 노드 펼치기 (1-hop 확장) |
| **경로 하이라이트** | 두 노드 간 최단 경로 하이라이트 |
| **노드 그루핑** | 시각적 그룹 (background rectangle) 으로 관련 노드 묶기 |
| **검색 결과 하이라이트** | Cmd+K 검색 결과 노드에 포커스 링 + 캔버스 팬 (이미 구현) |

### Obsidian에서 차용할 패턴

| 패턴 | 적용 방법 |
|------|----------|
| **그래프 뷰 물리 시뮬레이션** | 선택적 force-directed 레이아웃 모드 (ELK 대안) |
| **로컬 그래프** | 포커스 모드 = 선택 노드 중심 로컬 그래프 (D7) |
| **백링크 패널** | RightPanel 관계 섹션 = 들어오는 관계 (backlink 개념) |
| **핀 고정** | 노드를 캔버스에 고정하여 레이아웃 정리 시 이동 방지 |

---

## 2025~2026 디자인 트렌드 반영

### 적용 가능한 트렌드

| 트렌드 | 적용 방법 |
|--------|----------|
| **Bento Grid 레이아웃** | 대시보드/통계 뷰에서 카드 격자 배치 |
| **Glassmorphism (절제된)** | Toolbar/CommitBar의 `backdrop-blur-sm` 이미 적용. 과하지 않게 유지 |
| **Micro-interactions** | 노드 생성/삭제 시 파티클, 저장 완료 체크 애니메이션 |
| **AI-native UI** | AI 제안을 인라인으로 표시, 수락/거절 원클릭 |
| **Spatial UI** | 캔버스 자체가 spatial UI. 미니맵 + 줌 LOD 강화 |
| **Dark-first design** | 개발 도구 특성상 Dark 모드를 기본값으로 설정 고려 |
| **Variable fonts** | Pretendard Variable 이미 사용. weight axis 활용하여 동적 강조 |
| **Motion design tokens** | 이미 `motion-presets.ts`로 체계화. v4에서 확장 |

### Graph Editor 특화 패턴

```
1. Semantic Zoom (LOD)
   - 현재 3단계 (dot / name / full) 구현 완료
   - v4 추가: zoom 0.3 이하에서 노드 클러스터링 (영역 표시)

2. Edge Bundling
   - 다수의 엣지가 같은 방향일 때 번들링하여 시각적 복잡도 감소

3. Layout Algorithms
   - 현재: ELK 기반 레이아웃
   - v4 추가: 선택 가능한 레이아웃 (계층형, 방사형, force-directed)

4. Progressive Disclosure
   - 노드 세부 정보는 선택/호버 시에만 표시
   - 속성 수, 관계 수 등은 배지로 힌트만 제공

5. Spatial Bookmarks
   - 특정 캔버스 위치/줌을 북마크하여 빠른 이동
```

---

## 구현 우선순위

| 우선순위 | 항목 | 난이도 | 영향도 |
|---------|------|--------|--------|
| P0 | 브랜딩 (로고, 그라데이션) | 낮음 | 높음 |
| P0 | 노드 선택/호버 상태 리파인 | 낮음 | 높음 |
| P0 | 자동저장 인디케이터 | 중간 | 높음 |
| P1 | 컨텍스트 메뉴 | 중간 | 높음 |
| P1 | 필터/포커스 모드 | 중간 | 높음 |
| P1 | 패널 리사이즈 | 중간 | 중간 |
| P1 | 엣지 디자인 개선 | 중간 | 중간 |
| P2 | Text2Cypher 패널 UI | 높음 | 높음 |
| P2 | 스플래시/로딩 화면 | 낮음 | 중간 |
| P2 | 트리뷰 드래그앤드롭 | 높음 | 중간 |
| P3 | 노드 클러스터링 | 높음 | 중간 |
| P3 | Edge bundling | 높음 | 낮음 |
| P3 | Spatial bookmarks | 중간 | 낮음 |
