'use client';

// C-1 PoC (임시) — Cytoscape.js 적합성 검증. PRD-C C-5에서 삭제.
// 목적: 실데이터 형태(~50노드, 한국어 라벨, is-a/instance-of/has-a/relation)로
// fcose(force) / dagre(계층) 자동배치 + 클릭 이벤트 + 다크모드 토큰 렌더 + 체감 성능 확인.

import { useEffect, useRef, useState, useCallback } from 'react';
import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';
import fcose from 'cytoscape-fcose';
import dagre from 'cytoscape-dagre';
import { useTheme } from 'next-themes';
import { NODE_COLORS } from '@/features/ontology/constants/colors';

// 확장 1회 등록 (HMR 재등록 방지)
function registerOnce() {
  const c = cytoscape as unknown as { __pocRegistered?: boolean };
  if (c.__pocRegistered) return;
  try {
    cytoscape.use(fcose);
    cytoscape.use(dagre);
  } catch {
    /* already registered (HMR) */
  }
  c.__pocRegistered = true;
}

// ── 반도체 플라즈마 스트립 도메인 샘플 (~40노드) ─────────────────────────────
type SampleClass = { id: string; name: string; parentId: string | null; colorKey: keyof typeof NODE_COLORS; count: number };
type SampleEdge = { id: string; source: string; target: string; kind: 'isa' | 'instanceof' | 'hasa' | 'relation'; label?: string };

const CLASSES: SampleClass[] = [
  { id: 'eq', name: '장비', parentId: null, colorKey: 'root', count: 0 },
  { id: 'chamber', name: '챔버', parentId: 'eq', colorKey: 'mid', count: 0 },
  { id: 'hw', name: '하드웨어', parentId: 'eq', colorKey: 'mid', count: 0 },
  { id: 'chuck', name: 'Chuck', parentId: 'hw', colorKey: 'artifact', count: 2 },
  { id: 'baffle', name: 'Baffle', parentId: 'hw', colorKey: 'artifact', count: 1 },
  { id: 'toplid', name: 'Top-Lid', parentId: 'hw', colorKey: 'artifact', count: 1 },
  { id: 'oring', name: 'O-ring', parentId: 'hw', colorKey: 'artifact', count: 3 },
  { id: 'matcher', name: 'RF Matcher', parentId: 'hw', colorKey: 'artifact', count: 1 },
  { id: 'cable', name: 'Signal Cable', parentId: 'hw', colorKey: 'artifact', count: 2 },
  { id: 'clamp', name: 'Window Clamp', parentId: 'hw', colorKey: 'artifact', count: 1 },
  { id: 'electrode', name: 'PLATE_ELECTRODE', parentId: 'hw', colorKey: 'artifact', count: 1 },
  { id: 'process', name: '공정', parentId: null, colorKey: 'process', count: 0 },
  { id: 'strip', name: 'Plasma Strip', parentId: 'process', colorKey: 'process', count: 0 },
  { id: 'descum', name: 'Descum', parentId: 'process', colorKey: 'process', count: 0 },
  { id: 'param', name: '공정 파라미터', parentId: 'process', colorKey: 'concept', count: 0 },
  { id: 'rfbias', name: 'RF Bias', parentId: 'param', colorKey: 'concept', count: 0 },
  { id: 'mwpower', name: 'MW Power', parentId: 'param', colorKey: 'concept', count: 0 },
  { id: 'ignition', name: 'Source ignition time', parentId: 'param', colorKey: 'concept', count: 0 },
  { id: 'pindown', name: 'Pin down time', parentId: 'param', colorKey: 'concept', count: 0 },
  { id: 'symptom', name: '증상', parentId: null, colorKey: 'event', count: 0 },
  { id: 'particle', name: '파티클 증가', parentId: 'symptom', colorKey: 'event', count: 0 },
  { id: 'damage', name: 'Part damage', parentId: 'symptom', colorKey: 'event', count: 0 },
  { id: 'cause', name: '원인', parentId: null, colorKey: 'place', count: 0 },
  { id: 'localplasma', name: 'PM Local plasma', parentId: 'cause', colorKey: 'place', count: 0 },
  { id: 'oringwear', name: 'O-ring 마모', parentId: 'cause', colorKey: 'place', count: 0 },
  { id: 'action', name: '조치', parentId: null, colorKey: 'person', count: 0 },
  { id: 'replace', name: '부품 교체', parentId: 'action', colorKey: 'person', count: 0 },
  { id: 'clean', name: '챔버 클리닝', parentId: 'action', colorKey: 'person', count: 0 },
];

const INSTANCES = [
  { id: 'i_kc655', name: 'KC0330655', classId: 'electrode' },
  { id: 'i_kc656', name: 'KC0330656', classId: 'clamp' },
  { id: 'i_chuckA', name: 'Chuck-A', classId: 'chuck' },
  { id: 'i_chuckB', name: 'Chuck-B', classId: 'chuck' },
  { id: 'i_oring1', name: 'O-ring #1', classId: 'oring' },
];

const REL_EDGES: SampleEdge[] = [
  { id: 'r1', source: 'chamber', target: 'chuck', kind: 'hasa', label: '구성요소' },
  { id: 'r2', source: 'chamber', target: 'baffle', kind: 'hasa', label: '구성요소' },
  { id: 'r3', source: 'chamber', target: 'toplid', kind: 'hasa', label: '구성요소' },
  { id: 'r4', source: 'strip', target: 'rfbias', kind: 'relation', label: '영향받음' },
  { id: 'r5', source: 'strip', target: 'mwpower', kind: 'relation', label: '영향받음' },
  { id: 'r6', source: 'strip', target: 'ignition', kind: 'relation', label: '영향받음' },
  { id: 'r7', source: 'particle', target: 'localplasma', kind: 'relation', label: '원인' },
  { id: 'r8', source: 'damage', target: 'localplasma', kind: 'relation', label: '원인' },
  { id: 'r9', source: 'localplasma', target: 'replace', kind: 'relation', label: '조치' },
  { id: 'r10', source: 'oringwear', target: 'replace', kind: 'relation', label: '조치' },
  { id: 'r11', source: 'electrode', target: 'damage', kind: 'relation', label: '발생' },
];

function buildElements(): ElementDefinition[] {
  const nodes: ElementDefinition[] = [
    ...CLASSES.map((c) => ({
      data: { id: c.id, label: c.name, kind: 'class', colorKey: c.colorKey, size: Math.max(44, Math.min(80, 44 + c.count * 4)) },
    })),
    ...INSTANCES.map((i) => ({ data: { id: i.id, label: i.name, kind: 'instance', colorKey: 'instance' } })),
  ];
  const edges: ElementDefinition[] = [
    ...CLASSES.filter((c) => c.parentId).map((c) => ({ data: { id: `isa-${c.id}`, source: c.parentId as string, target: c.id }, classes: 'isa' })),
    ...INSTANCES.map((i) => ({ data: { id: `inst-${i.id}`, source: i.classId, target: i.id }, classes: 'instanceof' })),
    ...REL_EDGES.map((e) => ({ data: { id: e.id, source: e.source, target: e.target, label: e.label ?? '' }, classes: e.kind })),
  ];
  return [...nodes, ...edges];
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `hsl(${v})` : fallback;
}

function buildStylesheet(): cytoscape.StylesheetJson {
  const muted = cssVar('--muted-foreground', '#64748b');
  const border = cssVar('--border', '#e2e8f0');
  const card = cssVar('--card', '#ffffff');
  const fg = cssVar('--foreground', '#0f172a');
  const primary = cssVar('--primary', '#2563eb');

  const colorSelectors = (Object.keys(NODE_COLORS) as (keyof typeof NODE_COLORS)[]).map((k) => ({
    selector: `node[colorKey = "${k}"]`,
    style: { 'background-color': NODE_COLORS[k], 'border-color': NODE_COLORS[k] },
  }));

  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        color: fg,
        'font-size': 11,
        'font-weight': 600,
        'text-valign': 'center',
        'text-halign': 'center',
        'text-wrap': 'wrap',
        'text-max-width': '90px',
        'background-opacity': 0.18,
        'border-width': 1.5,
        'min-zoomed-font-size': 7,
      },
    },
    { selector: 'node[kind = "class"]', style: { shape: 'ellipse', width: 'data(size)', height: 'data(size)' } },
    { selector: 'node[kind = "instance"]', style: { shape: 'round-rectangle', width: 72, height: 40, 'border-width': 2 } },
    ...colorSelectors,
    { selector: 'node:selected', style: { 'border-color': primary, 'border-width': 3, 'overlay-color': primary, 'overlay-opacity': 0.12, 'overlay-padding': 8 } },
    {
      selector: 'edge',
      style: {
        width: 1.5,
        'line-color': border,
        'target-arrow-color': muted,
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        label: 'data(label)',
        'font-size': 10,
        color: fg,
        'text-background-color': card,
        'text-background-opacity': 1,
        'text-background-padding': '3px',
        'min-zoomed-font-size': 8,
      },
    },
    { selector: 'edge.isa', style: { width: 2, 'line-color': muted, 'target-arrow-color': muted, label: '' } },
    { selector: 'edge.instanceof', style: { width: 1, 'line-style': 'dotted', 'line-color': border, 'target-arrow-shape': 'triangle-tee', label: '' } },
    { selector: 'edge.hasa', style: { width: 1.5, 'line-style': 'dashed', 'target-arrow-shape': 'diamond' } },
    { selector: 'edge.relation', style: { width: 1.5 } },
  ];
}

const FCOSE_OPTS = { name: 'fcose', quality: 'default', animate: true, animationDuration: 350, randomize: true, nodeSeparation: 75, idealEdgeLength: 100, nodeRepulsion: 4500, padding: 40, fit: true } as const;
const DAGRE_OPTS = { name: 'dagre', rankDir: 'TB', nodeSep: 40, rankSep: 80, animate: true, animationDuration: 350, padding: 40, fit: true } as const;

export default function CytoscapePocPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const { resolvedTheme } = useTheme();
  const [layout, setLayout] = useState<'fcose' | 'dagre'>('fcose');
  const [selected, setSelected] = useState<string | null>(null);
  const [stats, setStats] = useState<{ nodes: number; edges: number; layoutMs: number }>({ nodes: 0, edges: 0, layoutMs: 0 });

  useEffect(() => {
    registerOnce();
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      elements: buildElements(),
      style: buildStylesheet(),
      wheelSensitivity: 0.2,
      minZoom: 0.2,
      maxZoom: 3,
    });
    cyRef.current = cy;

    cy.on('tap', 'node', (e) => setSelected(`${e.target.data('label')} (${e.target.data('kind')})`));
    cy.on('tap', (e) => {
      if (e.target === cy) setSelected(null);
    });

    setStats((s) => ({ ...s, nodes: cy.nodes().length, edges: cy.edges().length }));
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // 테마 변경 → 스타일시트 재적용
  useEffect(() => {
    cyRef.current?.style(buildStylesheet() as cytoscape.StylesheetJson);
  }, [resolvedTheme]);

  const runLayout = useCallback((name: 'fcose' | 'dagre') => {
    const cy = cyRef.current;
    if (!cy) return;
    const t0 = performance.now();
    const l = cy.layout((name === 'fcose' ? FCOSE_OPTS : DAGRE_OPTS) as cytoscape.LayoutOptions);
    l.one('layoutstop', () => setStats((s) => ({ ...s, layoutMs: Math.round(performance.now() - t0) })));
    l.run();
  }, []);

  useEffect(() => {
    runLayout(layout);
  }, [layout, runLayout]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="flex items-center gap-3 border-b border-border p-3 text-sm">
        <span className="font-semibold">Cytoscape PoC (임시)</span>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            onClick={() => setLayout('fcose')}
            className={`rounded-md px-3 py-1 ${layout === 'fcose' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
          >
            fcose (force)
          </button>
          <button
            onClick={() => setLayout('dagre')}
            className={`rounded-md px-3 py-1 ${layout === 'dagre' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
          >
            dagre (계층)
          </button>
        </div>
        <button onClick={() => runLayout(layout)} className="rounded-md border border-border px-3 py-1 hover:bg-muted">
          레이아웃 정리
        </button>
        <span className="text-muted-foreground">
          노드 {stats.nodes} · 엣지 {stats.edges} · 레이아웃 {stats.layoutMs}ms
        </span>
        {selected && <span className="ml-auto rounded-md bg-primary/10 px-3 py-1 text-primary">선택: {selected}</span>}
      </div>
      <div ref={containerRef} className="flex-1" />
    </div>
  );
}
