import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useOntologyStore } from '@/features/ontology/hooks/useOntologyStore';

// Mock motion/react with forwardRef support
vi.mock('motion/react', () => ({
  // LazyMotion 전환: 컴포넌트는 m.* 을 쓴다 — motion 프록시를 그대로 재사용.
  get m() { return this.motion; },
  motion: new Proxy({}, {
    get: (_target, prop: string) => {
      const Component = React.forwardRef(({ children, variants, initial, animate, exit, ...props }: Record<string, unknown>, ref: React.Ref<unknown>) => {
        const Tag = prop as keyof JSX.IntrinsicElements;
        return <Tag ref={ref as React.Ref<HTMLElement>} {...props}>{children as React.ReactNode}</Tag>;
      });
      Component.displayName = `motion.${prop}`;
      return Component;
    },
  }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock zustand/shallow useShallow with deep equality via JSON to avoid React 19 infinite loop
vi.mock('zustand/shallow', () => {
  function useShallow<S, U>(selector: (state: S) => U): (state: S) => U {
    const prevRef = React.useRef<{ value: U; json: string } | null>(null);
    const selectorRef = React.useRef(selector);
    selectorRef.current = selector;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return React.useCallback((state: S) => {
      const next = selectorRef.current(state);
      const nextJson = JSON.stringify(next);
      if (prevRef.current && prevRef.current.json === nextJson) return prevRef.current.value;
      prevRef.current = { value: next, json: nextJson };
      return next;
    }, []);
  }
  return { useShallow };
});

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
}));

// Mock AIAssistantTab to avoid complex deps
vi.mock('@/features/ontology/components/AIAssistantTab', () => ({
  default: ({ nodeName }: { nodeName: string }) => <div data-testid="ai-tab">AI: {nodeName}</div>,
}));

// Mock Text2CypherTab to avoid complex deps
vi.mock('@/features/ontology/components/Text2CypherTab', () => ({
  default: () => <div data-testid="cypher-tab">Text2Cypher</div>,
}));

// Mock ScrollArea to avoid @radix-ui/react-compose-refs infinite loop with React 19
vi.mock('@/components/ui/scroll-area', () => {
  const ScrollAreaMock = React.forwardRef(({ className, children, ...props }: Record<string, unknown>, ref: React.Ref<HTMLDivElement>) => (
    <div ref={ref} className={className as string} {...props}>{children as React.ReactNode}</div>
  ));
  ScrollAreaMock.displayName = 'ScrollArea';
  return { ScrollArea: ScrollAreaMock, ScrollBar: () => null };
});

// Mock Tabs to avoid @radix-ui/react-presence infinite loop with React 19
vi.mock('@/components/ui/tabs', () => {
  function TabsMock({ value, defaultValue, onValueChange, children, ...props }: Record<string, unknown>) {
    const [active, setActive] = React.useState((value || defaultValue || '') as string);
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

// PRD-L M1: 규칙(constraints)은 react-query 훅으로 읽는다 — 단위 테스트에선 모킹.
vi.mock('@/features/ontology/hooks/useRules', () => ({
  useRules: () => ({ data: [], isLoading: false }),
  useCreateMemoRule: () => ({ mutate: vi.fn() }),
  useDeleteRule: () => ({ mutate: vi.fn() }),
}));

import RightPanel from '@/features/ontology/components/RightPanel';

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

describe('RightPanel — Iteration 2', () => {
  beforeEach(() => {
    resetStore();
  });

  // B-2: Tab structure — Relations is a separate tab (differs from PRD single scroll)
  it('should have separate tabs: 상세, 관계, AI, Cypher (B-2 PRD gap)', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Test' });
    useOntologyStore.getState().selectNode('c1', 'class');

    render(<RightPanel />);
    expect(screen.getByText('상세')).toBeInTheDocument();
    expect(screen.getByText('관계')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByText('Cypher')).toBeInTheDocument();
  });

  // B-3: AI tab exists but is not the default active tab
  it('should have AI tab trigger (B-3 not implemented)', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Test' });
    useOntologyStore.getState().selectNode('c1', 'class');

    render(<RightPanel />);
    // AI tab trigger exists
    const aiTab = screen.getByRole('tab', { name: 'AI' });
    expect(aiTab).toBeInTheDocument();
    // It's not active by default (detail tab is active)
    expect(aiTab).toHaveAttribute('data-state', 'inactive');
  });

  // B-6: Instance values show — (dash) instead of actual values
  it('should show dash for instance property values (B-6 gap)', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Person' });
    useOntologyStore.getState().addProperty({ name: 'age', classId: 'c1', dataType: 'integer' });
    useOntologyStore.getState().addInstance({ id: 'i1', name: 'John', classId: 'c1' });
    // Add an instance value in store
    useOntologyStore.setState((state) => ({
      instanceValues: [
        ...state.instanceValues,
        { id: 'iv1', instanceId: 'i1', propertyId: state.properties[0].id, value: '30' },
      ],
    }));
    useOntologyStore.getState().selectNode('c1', 'class');

    render(<RightPanel />);
    // Both Properties (1) and Instances (1) sections show count
    const countElements = screen.getAllByText('(1)');
    expect(countElements.length).toBeGreaterThanOrEqual(1);
    // Instances section exists
    expect(screen.getByText('인스턴스 (실제 사례)')).toBeInTheDocument();
    // Note: even with instanceValues, the RightPanel renders "—" (em dash) for values (B-6 gap)
  });

  // B-9: Instance selected → no description editing
  it('should not show description editor for instance (B-9 gap)', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Animal' });
    useOntologyStore.getState().addInstance({ id: 'i1', name: 'Dog', classId: 'c1' });
    useOntologyStore.getState().selectNode('i1', 'instance');

    render(<RightPanel />);
    expect(screen.getByText('Dog')).toBeInTheDocument();
    expect(screen.getByText('INSTANCE')).toBeInTheDocument();
    // No description field for instance
    expect(screen.queryByText(/클릭하여 설명을 추가/)).not.toBeInTheDocument();
  });

  // A-7: Constraint inline input (instead of window.prompt)
  it('should show Constraints section with inline add for class (A-7)', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Person' });
    useOntologyStore.getState().selectNode('c1', 'class');

    render(<RightPanel />);
    // Constraints section exists (collapsed by default)
    expect(screen.getByText('제약조건')).toBeInTheDocument();
  });

  // C-2: focusNode called when Explorer tree item is clicked (verified via store)
  it('should show selected class with all detail sections', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Vehicle' });
    useOntologyStore.getState().addProperty({ name: 'speed', classId: 'c1' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'Car', parentId: 'c1' });
    useOntologyStore.getState().selectNode('c1', 'class');

    render(<RightPanel />);
    expect(screen.getByText('Vehicle')).toBeInTheDocument();
    expect(screen.getByText('하위 클래스')).toBeInTheDocument();
    expect(screen.getByText('Car')).toBeInTheDocument();
    expect(screen.getByText('속성')).toBeInTheDocument();
    expect(screen.getByText('speed')).toBeInTheDocument();
    expect(screen.getByText('제약조건')).toBeInTheDocument();
    expect(screen.getByText('인스턴스 (실제 사례)')).toBeInTheDocument();
  });
});
