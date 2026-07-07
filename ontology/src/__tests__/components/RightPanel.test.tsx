import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

import RightPanel from '@/features/ontology/components/RightPanel';

function resetStore() {
  useOntologyStore.setState({
    classes: [],
    instances: [],
    properties: [],
    relationTypes: [],
    edges: [],
    axioms: [],
    instanceValues: [],
    selectedNodeId: null,
    selectedNodeType: null,
    pendingChanges: [],
    popoverState: null,
    expandedNodes: new Set<string>(),
    focusNodeId: null,
  });
}

describe('RightPanel', () => {
  beforeEach(() => {
    resetStore();
  });

  it('should show empty state when no node is selected', () => {
    render(<RightPanel />);
    expect(screen.getByText('노드를 선택하면 정보가 표시됩니다')).toBeInTheDocument();
  });

  it('should show "속성 패널" header in empty state', () => {
    render(<RightPanel />);
    expect(screen.getByText('속성 패널')).toBeInTheDocument();
  });

  it('should show class name when a class is selected', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Person' });
    useOntologyStore.getState().selectNode('c1', 'class');

    render(<RightPanel />);
    expect(screen.getByText('Person')).toBeInTheDocument();
    expect(screen.getByText('CLASS')).toBeInTheDocument();
  });

  it('should show INSTANCE badge when an instance is selected', () => {
    const classId = useOntologyStore.getState().addClass({ id: 'c1', name: 'Animal' });
    useOntologyStore.getState().addInstance({ id: 'i1', name: 'Buddy', classId });
    useOntologyStore.getState().selectNode('i1', 'instance');

    render(<RightPanel />);
    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText('INSTANCE')).toBeInTheDocument();
  });

  it('should show properties for selected class', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Person' });
    useOntologyStore.getState().addProperty({ name: 'age', classId: 'c1', dataType: 'integer' });
    useOntologyStore.getState().addProperty({ name: 'email', classId: 'c1', dataType: 'string' });
    useOntologyStore.getState().selectNode('c1', 'class');

    render(<RightPanel />);
    expect(screen.getByText('age')).toBeInTheDocument();
    expect(screen.getByText('email')).toBeInTheDocument();
  });

  it('should show subclasses for selected class', () => {
    useOntologyStore.getState().addClass({ id: 'parent', name: 'Vehicle' });
    useOntologyStore.getState().addClass({ id: 'child', name: 'Car', parentId: 'parent' });
    useOntologyStore.getState().selectNode('parent', 'class');

    render(<RightPanel />);
    expect(screen.getByText('Car')).toBeInTheDocument();
  });

  it('should show instances for selected class', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Animal' });
    useOntologyStore.getState().addInstance({ name: 'Dog', classId: 'c1' });
    useOntologyStore.getState().addInstance({ name: 'Cat', classId: 'c1' });
    useOntologyStore.getState().selectNode('c1', 'class');

    render(<RightPanel />);
    // Instances section is collapsed by default, but the count should show
    expect(screen.getByText('(2)')).toBeInTheDocument();
  });

  it('should show tabs: 상세, 관계, AI, Cypher', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Test' });
    useOntologyStore.getState().selectNode('c1', 'class');

    render(<RightPanel />);
    expect(screen.getByText('상세')).toBeInTheDocument();
    expect(screen.getByText('관계')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByText('Cypher')).toBeInTheDocument();
  });
});
