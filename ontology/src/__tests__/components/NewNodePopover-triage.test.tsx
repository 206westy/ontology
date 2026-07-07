import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { useOntologyStore } from '@/features/ontology/hooks/useOntologyStore';

// PRD-L M5: 트리아지 확정 화면 — 저신뢰 표면화 + 고신뢰 접힘 그룹 렌더 검증.

vi.mock('motion/react', () => ({
  get m() { return this.motion; },
  motion: new Proxy({}, {
    get: (_target, prop: string) => {
      return ({ children, variants, initial, animate, exit, ...props }: Record<string, unknown>) => {
        const Component = prop as keyof JSX.IntrinsicElements;
        return <Component {...props}>{children}</Component>;
      };
    },
  }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockLlmParse = vi.fn();
vi.mock('@/features/ontology/api', () => ({
  llmApi: { parse: (...args: unknown[]) => mockLlmParse(...args) },
  enrichApi: { detect: vi.fn().mockResolvedValue({ gaps: [] }) },
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('@/components/ui/tabs', () => {
  function TabsMock({ value, defaultValue, onValueChange, children, ...props }: Record<string, unknown>) {
    const [active, setActive] = React.useState((value || defaultValue || 'quick') as string);
    React.useEffect(() => { if (value != null) setActive(value as string); }, [value]);
    const ctx = React.useMemo(() => ({ active, setActive: (v: string) => { setActive(v); if (onValueChange) (onValueChange as (v: string) => void)(v); } }), [active, onValueChange]);
    return <div data-testid="tabs" {...props}>{React.Children.map(children as React.ReactElement[], (child) => {
      if (!React.isValidElement(child)) return child;
      return React.cloneElement(child as React.ReactElement, { _tabsCtx: ctx } as Record<string, unknown>);
    })}</div>;
  }
  function TabsListMock({ children, _tabsCtx, ...props }: Record<string, unknown>) {
    return <div role="tablist" {...props}>{React.Children.map(children as React.ReactElement[], (child) => {
      if (!React.isValidElement(child)) return child;
      return React.cloneElement(child as React.ReactElement, { _tabsCtx } as Record<string, unknown>);
    })}</div>;
  }
  function TabsTriggerMock({ value, children, _tabsCtx, ...props }: Record<string, unknown>) {
    const ctx = _tabsCtx as { active: string; setActive: (v: string) => void } | undefined;
    return <button role="tab" data-state={ctx?.active === value ? 'active' : 'inactive'} onClick={() => ctx?.setActive(value as string)} {...props}>{children as React.ReactNode}</button>;
  }
  function TabsContentMock({ value, children, _tabsCtx, ...props }: Record<string, unknown>) {
    const ctx = _tabsCtx as { active: string } | undefined;
    if (ctx?.active !== value) return null;
    return <div role="tabpanel" {...props}>{children as React.ReactNode}</div>;
  }
  return { Tabs: TabsMock, TabsList: TabsListMock, TabsTrigger: TabsTriggerMock, TabsContent: TabsContentMock };
});

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, ...props }: Record<string, unknown>) => <div {...props}>{children as React.ReactNode}</div>,
  SelectTrigger: ({ children, ...props }: Record<string, unknown>) => <button {...props}>{children as React.ReactNode}</button>,
  SelectContent: ({ children }: Record<string, unknown>) => <div>{children as React.ReactNode}</div>,
  SelectItem: ({ children, value, ...props }: Record<string, unknown>) => <option value={value as string} {...props}>{children as React.ReactNode}</option>,
  SelectValue: ({ placeholder }: Record<string, unknown>) => <span>{placeholder as string}</span>,
}));

import NewNodePopover from '@/features/ontology/components/NewNodePopover';

function resetStore() {
  useOntologyStore.setState({
    classes: [],
    instances: [],
    properties: [],
    relationTypes: [],
    edges: [],
    instanceValues: [],
    selectedNodeId: null,
    selectedNodeType: null,
    pendingChanges: [],
    popoverState: null,
    expandedNodes: new Set<string>(),
    focusNodeId: null,
    toolMode: 'select' as const,
    zoomAction: null,
  });
}

function switchToTextTab() {
  fireEvent.click(screen.getByRole('tab', { name: /텍스트 입력/ }));
}

// 저신뢰 1개(Animl ≈ 기존 Animal, Critic 근접중복) + 고신뢰 1개(Robot)로 파싱을 고정.
async function renderPreviewWithMixedConfidence() {
  useOntologyStore.getState().addClass({ id: 'animal', name: 'Animal' });
  mockLlmParse.mockResolvedValue({
    entities: [
      { name: 'Animl', type: null, nodeKind: 'class', parentType: null, evidence: 'typo', description: null, properties: [] },
      { name: 'Robot', type: null, nodeKind: 'class', parentType: null, evidence: 'clean', description: null, properties: [] },
    ],
    relations: [],
  });

  useOntologyStore.getState().openPopover({ type: 'newNode', position: { x: 0, y: 0 } });
  render(<NewNodePopover />);
  switchToTextTab();
  fireEvent.change(screen.getByPlaceholderText(/자유 형식으로 입력하세요/), {
    target: { value: 'test' },
  });
  fireEvent.click(screen.getByText('생성').closest('button')!);

  await waitFor(() => {
    expect(screen.getByText('구조화 결과')).toBeInTheDocument();
  });
}

describe('NewNodePopover — 트리아지 확정 (PRD-L M5)', () => {
  beforeEach(() => {
    resetStore();
    mockLlmParse.mockReset();
  });

  it('shows a triage summary band with auto and review counts', async () => {
    await renderPreviewWithMixedConfidence();

    const band = screen.getByTestId('triage-summary');
    expect(band).toHaveTextContent('자동 반영 1개');
    expect(band).toHaveTextContent('검토 필요 1개');
  });

  it('surfaces the low-confidence item with a reason badge, always expanded', async () => {
    await renderPreviewWithMixedConfidence();

    const review = screen.getByTestId('triage-review');
    expect(within(review).getByText(/Animl/)).toBeInTheDocument();
    // 사유 배지(Critic 지적)가 검토 표면에 노출된다.
    expect(within(review).getByText('Critic 지적')).toBeInTheDocument();
  });

  it('collapses high-confidence items into a group that expands on click', async () => {
    await renderPreviewWithMixedConfidence();

    // 접힘 상태: 토글은 보이고 고신뢰 묶음 본문은 아직 렌더되지 않는다.
    const toggle = screen.getByTestId('triage-auto-toggle');
    expect(toggle).toHaveTextContent('자동 반영 예정 1개');
    expect(toggle).toHaveTextContent('펼쳐서 검토');
    expect(screen.queryByTestId('triage-auto-body')).not.toBeInTheDocument();

    // 펼치면 고신뢰 묶음이 기존 체크박스 리스트 그대로 나타난다(본문 안에 Robot 노출).
    fireEvent.click(toggle);
    const body = screen.getByTestId('triage-auto-body');
    expect(within(body).getByText(/Robot/)).toBeInTheDocument();
  });

  it('reflects triage in the confirm button label', async () => {
    await renderPreviewWithMixedConfidence();

    // 2개 반영(검토 1개 포함) — 트리아지는 자동 제외가 아니므로 review 도 반영 대상.
    expect(
      screen.getByRole('button', { name: /확정 · 2개 반영 \(검토 1개 포함\)/ }),
    ).toBeInTheDocument();
  });

  it('keeps confirm working — review items are still applied (not auto-excluded)', async () => {
    await renderPreviewWithMixedConfidence();

    fireEvent.click(screen.getByRole('button', { name: /확정/ }));

    const state = useOntologyStore.getState();
    const names = state.classes.map((c) => c.name);
    // 기존 Animal + 신규 Animl(검토) + Robot(자동) = 3
    expect(names).toContain('Animl');
    expect(names).toContain('Robot');
  });
});
