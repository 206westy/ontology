import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useOntologyStore } from '@/features/ontology/hooks/useOntologyStore';

vi.mock('motion/react', () => ({
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
    axioms: [],
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

  // A-3: LLM returns instances → instances are created in store
  it('should create instances from LLM parse result (A-3)', async () => {
    mockLlmParse.mockResolvedValue({
      classes: [{ name: 'Equipment', description: 'Semi equipment', color: '#2563eb', parentName: null }],
      properties: [],
      relations: [],
      instances: [
        { className: 'Equipment', name: 'SUPRA' },
        { className: 'Equipment', name: 'GENEVA' },
      ],
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

    // Preview should show instances
    expect(screen.getByText(/인스턴스 2개/)).toBeInTheDocument();

    // Click confirm
    fireEvent.click(screen.getByText('확정').closest('button')!);

    const state = useOntologyStore.getState();
    expect(state.classes).toHaveLength(1);
    expect(state.classes[0].name).toBe('Equipment');
    expect(state.instances).toHaveLength(2);
    expect(state.instances.map((i) => i.name)).toContain('SUPRA');
    expect(state.instances.map((i) => i.name)).toContain('GENEVA');
    // Each instance should be linked to the Equipment class
    expect(state.instances[0].classId).toBe(state.classes[0].id);
    expect(state.instances[1].classId).toBe(state.classes[0].id);
  });

  // A-3: Instance preview shows className in parentheses
  it('should show instance className in preview (A-3)', async () => {
    mockLlmParse.mockResolvedValue({
      classes: [{ name: 'Animal', description: '', color: null, parentName: null }],
      properties: [],
      relations: [],
      instances: [{ className: 'Animal', name: 'Buddy' }],
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

    expect(screen.getByText('(Animal)')).toBeInTheDocument();
  });

  // B-7: parentName is present in LLM result but NOT used to set parentId
  it('should NOT set parentId from parentName (B-7 gap)', async () => {
    // Pre-existing class in store
    useOntologyStore.getState().addClass({ id: 'existing-equip', name: 'Equipment' });

    mockLlmParse.mockResolvedValue({
      classes: [{ name: 'DryAsher', description: 'Subtype of Equipment', color: '#2563eb', parentName: 'Equipment' }],
      properties: [],
      relations: [],
      instances: [],
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

    fireEvent.click(screen.getByText('확정').closest('button')!);

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
      classes: [{ name: 'NewClass', description: '', color: null, parentName: null }],
      properties: [],
      relations: [],
      instances: [],
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
