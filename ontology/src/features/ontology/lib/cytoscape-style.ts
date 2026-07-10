'use client';

// Cytoscape 스타일시트 — 기존 React Flow 노드(ClassNode/InstanceNode)·엣지 디자인을 canvas 스타일로 근사.
// 색은 전부 resolveThemeColors()가 CSS 변수에서 해석한 hex(토큰 기반, 하드코딩 금지).
// 다크모드 전환 시 buildStylesheet를 재생성해 cy.style(...)로 재적용한다(요소 데이터 불변).

import type { StylesheetJson } from 'cytoscape';
import { NODE_COLORS, type ResolvedThemeColors } from '../constants/colors';

export function buildStylesheet(c: ResolvedThemeColors): StylesheetJson {
  // colorKey별 노드 색 셀렉터 (테두리=진한 색, 배경=같은 색 저투명)
  const colorSelectors: StylesheetJson = (Object.keys(NODE_COLORS) as (keyof typeof NODE_COLORS)[]).map((k) => ({
    selector: `node[colorKey = "${k}"]`,
    style: { 'background-color': c.node[k], 'border-color': c.node[k] },
  }));

  return [
    // ── 노드 공통 ──
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        color: c.foreground,
        'font-family': 'Pretendard, system-ui, -apple-system, sans-serif',
        'font-size': 11,
        'font-weight': 600,
        'text-valign': 'center',
        'text-halign': 'center',
        'text-wrap': 'wrap',
        'text-max-width': '92px',
        'background-opacity': 0.18,
        'border-width': 1.5,
        'min-zoomed-font-size': 7,
        // opacity 트랜지션으로 호버 focus+context 디밍이 부드럽게 페이드
        'transition-property': 'opacity, border-width, background-opacity, width, height',
        'transition-duration': 120,
      },
    },
    // 클래스: 큰 원 + 이름(있으면 둘째 줄에 인스턴스 개수). 형태만으로 "유형"을 읽게.
    { selector: 'node[kind = "class"]', style: { shape: 'ellipse', width: 'data(size)', height: 'data(size)', label: 'data(displayLabel)' } },
    {
      // 인스턴스: 작은 채운 점(dot). 라벨은 평상시 숨김(대량에서 라벨 폭발 방지) — 호버/선택 시 노출.
      selector: 'node[kind = "instance"]',
      style: {
        shape: 'ellipse',
        width: 14,
        height: 14,
        label: '',
        'border-width': 1.5,
        'background-opacity': 0.95,
        'transition-property': 'opacity, width, height, background-opacity, border-width',
        'transition-duration': 120,
      },
    },
    ...colorSelectors,
    // 군집 색(Louvain 커뮤니티) — 의미 없던 타입색을 대체. colorSelectors 뒤에 두어 우선 적용.
    // 관련(같은 군집) 노드는 같은 색, 인접 군집은 골든앵글로 뚜렷이 다른 색.
    { selector: 'node[clusterColor]', style: { 'background-color': 'data(clusterColor)', 'border-color': 'data(clusterColor)' } },
    // 색각 대비용 비색상 2차 채널 — 군집별 테두리 패턴(클래스 노드). 빈 클래스(dashed)는 아래에서 우선.
    { selector: 'node[clusterBorder = "dashed"]', style: { 'border-style': 'dashed' } },
    { selector: 'node[clusterBorder = "dotted"]', style: { 'border-style': 'dotted', 'border-width': 2 } },
    // 인스턴스 라벨: 호버하면 이름이 뜬다("이게 뭔지" 즉시 확인). 살짝 커지며 위로.
    // 채도 높은 군집색 위에서도 읽히도록 카드색 텍스트 배경 부여(대비 확보 — WCAG).
    {
      selector: 'node[kind = "instance"].hover-focus',
      style: {
        label: 'data(label)', 'font-size': 10, width: 20, height: 20, 'background-opacity': 0.95, 'z-index': 99,
        'text-background-color': c.card, 'text-background-opacity': 0.92, 'text-background-padding': '2px', 'text-background-shape': 'roundrectangle',
      },
    },
    // 인스턴스 선택(클릭→속성 패널) 시에도 이름 유지.
    {
      selector: 'node[kind = "instance"]:selected',
      style: {
        label: 'data(label)', 'font-size': 10, 'z-index': 99,
        'text-background-color': c.card, 'text-background-opacity': 0.92, 'text-background-padding': '2px', 'text-background-shape': 'roundrectangle',
      },
    },
    // 접힌 인스턴스(대량 클래스 기본 접힘) — display:none 이라 렌더·물리(cola)에서 함께 제외된다.
    { selector: 'node.collapsed', style: { display: 'none' } },
    // 빈 클래스 (인스턴스·자식 없음) — 점선 + 흐리게
    { selector: 'node.empty', style: { 'border-style': 'dashed', opacity: 0.55 } },

    // ── 선택 / 포커스 / 호버 / 디밍 ──
    // 선택: 퍼플 stroke + glow (퍼플은 선택/강조 전용 예약)
    {
      selector: 'node:selected',
      style: { 'border-color': c.primary, 'border-width': 3, 'overlay-color': c.primary, 'overlay-opacity': 0.14, 'overlay-padding': 8 },
    },
    { selector: 'node.pulse', style: { 'border-color': c.primary, 'border-width': 3, 'overlay-color': c.primary, 'overlay-opacity': 0.25, 'overlay-padding': 10 } },
    // 호버 focus+context: 호버 노드 본인 강조(테두리 굵게), 이웃은 기본 유지, 비이웃은 dimmed
    { selector: 'node.hover-focus', style: { 'border-width': 2.5, 'background-opacity': 0.3 } },
    // 디밍: 비이웃 노드/엣지 — PRD §3 (투명도 0.1대로 죽이되 사라지진 않음)
    { selector: 'node.dimmed', style: { opacity: 0.1 } },
    { selector: 'edge.dimmed', style: { opacity: 0.05 } },
    // 필터 숨김 (요소 제거 아님 → 위치 보존)
    { selector: '.hidden', style: { display: 'none' } },
    // 줌 LOD: 줌아웃 시 비허브 라벨 숨김(허브는 onZoom에서 zdot 제외 → 라벨 유지)
    { selector: 'node.zdot', style: { label: '', 'border-width': 1 } },

    // ── 엣지 공통 (평상시 전체 투명도 낮춤 → 퍼플 선택 경로만 도드라지게) ──
    {
      selector: 'edge',
      style: {
        width: 1,
        opacity: 0.4,
        'line-color': c.border,
        'target-arrow-color': c.mutedForeground,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.75,
        'curve-style': 'bezier',
        label: 'data(label)',
        'font-family': 'Pretendard, system-ui, -apple-system, sans-serif',
        'font-size': 10,
        color: c.mutedForeground,
        'text-background-color': c.card,
        'text-background-opacity': 1,
        'text-background-padding': '3px',
        'text-background-shape': 'roundrectangle',
        'min-zoomed-font-size': 8,
        'transition-property': 'opacity, line-color, width',
        'transition-duration': 120,
      },
    },
    // is-a (계층): 점선 muted + 채운 삼각, 라벨 없음 — 계층은 또렷하게(0.6)
    { selector: 'edge.isa', style: { width: 1.5, opacity: 0.6, 'line-style': 'dashed', 'line-color': c.mutedForeground, 'target-arrow-color': c.mutedForeground, label: '' } },
    // instance-of: 점선 가늘게 + 빈 화살, 약하게(참조성)
    { selector: 'edge.instanceof', style: { width: 1, opacity: 0.3, 'line-style': 'dotted', 'line-color': c.border, 'target-arrow-shape': 'triangle-tee', 'target-arrow-color': c.border, label: '' } },
    // has-a (구성/속성): 파선 + 다이아몬드, 구조 관계
    { selector: 'edge.hasa', style: { width: 1.25, opacity: 0.5, 'line-style': 'dashed', 'target-arrow-shape': 'diamond' } },
    // relation (일반 관계): 실선, 구조 관계
    { selector: 'edge.relation', style: { width: 1.25, opacity: 0.5 } },
    // 호버 이웃 엣지 강조 — 퍼플 아님(퍼플은 선택 전용), 전경색으로 또렷하게
    { selector: 'edge.hover-edge', style: { opacity: 0.95, width: 1.75, 'line-color': c.foreground, 'target-arrow-color': c.foreground, color: c.foreground } },
    // 선택 노드에 연결된 엣지 강조(선택 경로 = 퍼플)
    { selector: 'edge.connected', style: { 'line-color': c.primary, 'target-arrow-color': c.primary, width: 2.5, opacity: 0.95, color: c.foreground } },

    // ── PRD-B B-3: 구획 간 bridge 엣지 — 굵은 파선 + primary 색으로 구분 (클릭 시 대상 구획 전환) ──
    {
      selector: 'edge.bridge',
      style: {
        'line-style': 'dashed',
        'line-dash-pattern': [8, 4],
        'line-color': c.primary,
        'target-arrow-color': c.primary,
        width: 3,
        opacity: 0.85,
      },
    },
    // 구획 색 훅(선택): B가 node[partitionColor] 매핑을 추가할 수 있음.
    //   { selector: 'node[partitionColor]', style: { 'border-color': 'data(partitionColor)' } }
  ];
}
