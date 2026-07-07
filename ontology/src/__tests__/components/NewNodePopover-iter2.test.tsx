import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useOntologyStore } from '@/features/ontology/hooks/useOntologyStore';

vi.mock('motion/react', () => ({
  // LazyMotion 전환: 컴포넌트는 m.* 을 쓴다 — motion 프록시를 그대로 재사용.
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

// Mock LLM API -- return instances and parentName in the response
const mockLlmParse = vi.fn();
vi.mock('@/features/ontology/api', () => ({
  llmApi: {
    parse: (...args: unknown[]) => mockLlmParse(...args),
  },
  enrichApi: {
    detect: vi.fn().mockResolvedValue({ gaps: [] }),
  },
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

// Mock Tabs to avoid @radix-ui/react-presence infinite loop with React 19
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

// Mock Select to avoid Radix Presence issues
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, ...props }: Record<string, unknown>) => <div {...props}>{children as React.ReactNode}</div>,
  SelectTrigger: ({ children, ...props }: Record<string, unknown>) => <button {...props}>{children as React.ReactNode}</button>,
  SelectContent: ({ children }: Record<string, unknown>) => <div>{children as React.ReactNode}</div>,
  SelectItem: ({ children, value, ...props }: Record<string, unknown>) => <option value={value as string} {...props}>{children as React.ReactNode}</option>,
  SelectValue: ({ placeholder }: Record<string, unknown>) => <span>{placeholder as string}</span>,
}));

import NewNodePopover from '@/features/ontology/components/NewNodePopover';

/** Switch to the text input tab in the NewNodePopover */
function switchToTextTab() {
  const textTab = screen.getByRole('tab', { name: /텍스트 입력/ });
  fireEvent.click(textTab);
}

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

describe('NewNodePopover — Iteration 2', () => {
  beforeEach(() => {
    resetStore();
    mockLlmParse.mockReset();
  });

  // A-1: multi-stage parse — entities become classes parented by their type
  it('should create type-parented classes from entities (A-1)', async () => {
    mockLlmParse.mockResolvedValue({
      entities: [
        { name: 'SUPRA', type: 'Equipment', evidence: 'SUPRA is equipment' },
        { name: 'GENEVA', type: 'Equipment', evidence: 'GENEVA is equipment' },
      ],
      relations: [],
    });

    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 100, y: 200 },
    });

    render(<NewNodePopover />);
    switchToTextTab();
    fireEvent.change(screen.getByPlaceholderText(/자유 형식으로 입력하세요/), {
      target: { value: 'Equipment: SUPRA, GENEVA' },
    });
    fireEvent.click(screen.getByText('생성').closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('구조화 결과')).toBeInTheDocument();
    });

    // Click confirm
    fireEvent.click(screen.getByRole('button', { name: '확정' }));

    const state = useOntologyStore.getState();
    const byName = new Map(state.classes.map((c) => [c.name, c]));
    expect(byName.has('Equipment')).toBe(true);
    expect(byName.has('SUPRA')).toBe(true);
    expect(byName.has('GENEVA')).toBe(true);
    // Entities are parented by their type category.
    expect(byName.get('SUPRA')!.parentId).toBe(byName.get('Equipment')!.id);
    expect(byName.get('GENEVA')!.parentId).toBe(byName.get('Equipment')!.id);
  });

  // A-1: entity name + its type both appear in the preview tree
  it('should show entity and its type in preview (A-1)', async () => {
    mockLlmParse.mockResolvedValue({
      entities: [{ name: 'Buddy', type: 'Animal', evidence: 'Buddy is an animal' }],
      relations: [],
    });

    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 0, y: 0 },
    });

    render(<NewNodePopover />);
    switchToTextTab();
    fireEvent.change(screen.getByPlaceholderText(/자유 형식으로 입력하세요/), {
      target: { value: 'test' },
    });
    fireEvent.click(screen.getByText('생성').closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('구조화 결과')).toBeInTheDocument();
    });

    expect(screen.getByText(/Buddy/)).toBeInTheDocument();
    expect(screen.getByText(/Animal/)).toBeInTheDocument();
  });

  // S4: Critic 검수 패널 — 기존 노드와 근접한(오타) 새 노드를 자문으로 표시하고,
  // [무시]로 숨길 수 있다(읽기전용, 확정 차단 안 함).
  it('shows a Critic review issue for a near-duplicate and lets the user ignore it (S4)', async () => {
    useOntologyStore.getState().addClass({ id: 'eq', name: 'Equipment' });
    mockLlmParse.mockResolvedValue({
      entities: [{ name: 'Equipmnt', type: '장비', evidence: 'typo of Equipment' }],
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

    // The 검수 section and the near-duplicate issue are surfaced.
    expect(screen.getByText('검수')).toBeInTheDocument();
    expect(screen.getByText(/매우 유사/)).toBeInTheDocument();

    // Ignoring the issue removes it from the panel.
    fireEvent.click(screen.getByText('무시'));
    expect(screen.queryByText(/매우 유사/)).not.toBeInTheDocument();
    // Confirm is NOT blocked — the 확정 button remains available.
    expect(screen.getByRole('button', { name: '확정' })).toBeInTheDocument();
  });

  // A-2 (foundation): entity type matching an existing class resolves to its parentId
  it('should resolve entity type to an existing class as parentId (A-1/A-2)', async () => {
    // Pre-existing class in store
    useOntologyStore.getState().addClass({ id: 'existing-equip', name: 'Equipment' });

    mockLlmParse.mockResolvedValue({
      entities: [{ name: 'DryAsher', type: 'Equipment', evidence: 'DryAsher is a type of Equipment' }],
      relations: [],
    });

    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 0, y: 0 },
    });

    render(<NewNodePopover />);
    switchToTextTab();
    fireEvent.change(screen.getByPlaceholderText(/자유 형식으로 입력하세요/), {
      target: { value: 'DryAsher is a type of Equipment' },
    });
    fireEvent.click(screen.getByText('생성').closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('구조화 결과')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '확정' }));

    const state = useOntologyStore.getState();
    const dryAsher = state.classes.find((c) => c.name === 'DryAsher');
    expect(dryAsher).toBeDefined();
    // B-7 was fixed: parentName 'Equipment' now resolves to existing class parentId
    expect(dryAsher!.parentId).toBe('existing-equip');
  });

  // A-6: Popover uses calcPopoverPosition (position is set via style)
  it('should position popover using calcPopoverPosition (A-6)', () => {
    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 300, y: 400 },
    });

    render(<NewNodePopover />);
    // The popover div should have style with left and top
    const dialog = screen.getByRole('dialog');
    const popoverInner = dialog.querySelector('[style]');
    expect(popoverInner).not.toBeNull();
    const style = popoverInner!.getAttribute('style');
    expect(style).toContain('left');
    expect(style).toContain('top');
  });

  // LLM context: existingClasses are passed to LLM API
  it('should pass existing class names to LLM API', async () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'ExistingClass' });

    mockLlmParse.mockResolvedValue({
      entities: [{ name: 'NewClass', type: 'Thing', evidence: 'x' }],
      relations: [],
    });

    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 0, y: 0 },
    });

    render(<NewNodePopover />);
    switchToTextTab();
    fireEvent.change(screen.getByPlaceholderText(/자유 형식으로 입력하세요/), {
      target: { value: 'some text' },
    });
    fireEvent.click(screen.getByText('생성').closest('button')!);

    await waitFor(() => {
      expect(mockLlmParse).toHaveBeenCalled();
    });

    const callArgs = mockLlmParse.mock.calls[0][0];
    expect(callArgs.existingClasses).toContain('ExistingClass');
  });
});
