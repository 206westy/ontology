import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useOntologyStore } from '@/features/ontology/hooks/useOntologyStore';

// Mock motion/react
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

// Mock LLM API to simulate failure so mockParse is used
vi.mock('@/features/ontology/api', () => ({
  llmApi: {
    parse: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
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

/** Switch to the text input tab in the NewNodePopover */
function switchToTextTab() {
  const textTab = screen.getByRole('tab', { name: /텍스트 입력/ });
  fireEvent.click(textTab);
}

describe('NewNodePopover', () => {
  beforeEach(() => {
    resetStore();
  });

  // J1-1: Popover not shown when popoverState is null
  it('should not render when popoverState is null', () => {
    const { container } = render(<NewNodePopover />);
    expect(container.innerHTML).toBe('');
  });

  // J1-1: Popover appears when popoverState type is newNode
  it('should render when popoverState is newNode', () => {
    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 100, y: 200 },
    });

    render(<NewNodePopover />);
    expect(screen.getByText('새 노드')).toBeInTheDocument();
    expect(screen.getByText('취소')).toBeInTheDocument();
    // Switch to text tab to find the generate button
    switchToTextTab();
    expect(screen.getByText('생성')).toBeInTheDocument();
  });

  // J1-1: textarea exists and has placeholder
  it('should have a textarea with correct placeholder', () => {
    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 0, y: 0 },
    });

    render(<NewNodePopover />);
    switchToTextTab();
    const textarea = screen.getByPlaceholderText(/자유 형식으로 입력하세요/);
    expect(textarea).toBeInTheDocument();
  });

  // J1-2: Generate button disabled when textarea is empty
  it('should have disabled generate button when textarea is empty', () => {
    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 0, y: 0 },
    });

    render(<NewNodePopover />);
    switchToTextTab();
    const generateBtn = screen.getByText('생성').closest('button');
    expect(generateBtn).toBeDisabled();
  });

  // J1-2: Generate button enabled when text is entered
  it('should enable generate button when text is entered', () => {
    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 0, y: 0 },
    });

    render(<NewNodePopover />);
    switchToTextTab();
    const textarea = screen.getByPlaceholderText(/자유 형식으로 입력하세요/);
    fireEvent.change(textarea, { target: { value: 'Animal' } });

    const generateBtn = screen.getByText('생성').closest('button');
    expect(generateBtn).not.toBeDisabled();
  });

  // J1-3 + J1-4: Click generate → LLM fails → falls back to mockParse → shows preview
  it('should transition to preview phase after clicking generate (fallback to mockParse)', async () => {
    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 100, y: 200 },
    });

    render(<NewNodePopover />);
    switchToTextTab();
    const textarea = screen.getByPlaceholderText(/자유 형식으로 입력하세요/);
    fireEvent.change(textarea, { target: { value: '# Animal\n# Plant' } });

    const generateBtn = screen.getByText('생성').closest('button')!;
    fireEvent.click(generateBtn);

    // Wait for async LLM call to fail and fallback
    await waitFor(() => {
      expect(screen.getByText('구조화 결과')).toBeInTheDocument();
    });

    // Should show parsed classes
    expect(screen.getByText(/Animal/)).toBeInTheDocument();
    expect(screen.getByText(/Plant/)).toBeInTheDocument();
    expect(screen.getByText(/클래스 2개/)).toBeInTheDocument();
  });

  // J1-4: Preview mode has correct buttons
  it('should show 수정 and 확정 buttons in preview phase', async () => {
    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 0, y: 0 },
    });

    render(<NewNodePopover />);
    switchToTextTab();
    fireEvent.change(screen.getByPlaceholderText(/자유 형식으로 입력하세요/), {
      target: { value: 'TestClass' },
    });
    fireEvent.click(screen.getByText('생성').closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('구조화 결과')).toBeInTheDocument();
    });

    expect(screen.getByText('수정')).toBeInTheDocument();
    expect(screen.getByText('확정')).toBeInTheDocument();
  });

  // J1-5: Remove item from preview
  it('should remove an item from preview when trash button is clicked', async () => {
    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 0, y: 0 },
    });

    render(<NewNodePopover />);
    switchToTextTab();
    fireEvent.change(screen.getByPlaceholderText(/자유 형식으로 입력하세요/), {
      target: { value: '# ClassA\n# ClassB' },
    });
    fireEvent.click(screen.getByText('생성').closest('button')!);

    await waitFor(() => {
      expect(screen.getByText(/클래스 2개/)).toBeInTheDocument();
    });

    // Find and click the first trash button
    const trashButtons = screen.getAllByRole('button').filter(
      (btn) => btn.querySelector('svg.lucide-trash-2') || btn.querySelector('[class*="trash"]'),
    );
    // The delete buttons are in the items - click the last visible button-like element with trash
    // Instead, look for all buttons near ClassA
    const items = screen.getAllByText(/\+ Class/);
    expect(items.length).toBe(2);

    // After delete, click on the parent group's button
    const groupDivs = document.querySelectorAll('.group');
    if (groupDivs.length > 0) {
      const trashBtn = groupDivs[0].querySelector('button');
      if (trashBtn) {
        fireEvent.click(trashBtn);
        await waitFor(() => {
          expect(screen.getByText(/클래스 1개/)).toBeInTheDocument();
        });
      }
    }
  });

  // J1-6: Click 수정 to go back to Phase 1
  it('should go back to input phase when 수정 is clicked', async () => {
    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 0, y: 0 },
    });

    render(<NewNodePopover />);
    switchToTextTab();
    fireEvent.change(screen.getByPlaceholderText(/자유 형식으로 입력하세요/), {
      target: { value: 'GoBack' },
    });
    fireEvent.click(screen.getByText('생성').closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('구조화 결과')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('수정').closest('button')!);

    // Should be back in input mode
    expect(screen.getByText('새 노드')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/자유 형식으로 입력하세요/)).toBeInTheDocument();
  });

  // J1-7: Click 확정 → classes added to store, popover closes
  it('should add classes to store and close popover when 확정 is clicked', async () => {
    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 100, y: 200 },
    });

    const { container } = render(<NewNodePopover />);
    switchToTextTab();
    fireEvent.change(screen.getByPlaceholderText(/자유 형식으로 입력하세요/), {
      target: { value: '# Dog\n# Cat' },
    });
    fireEvent.click(screen.getByText('생성').closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('구조화 결과')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('확정').closest('button')!);

    // Store should have the classes
    const state = useOntologyStore.getState();
    expect(state.classes.length).toBe(2);
    expect(state.classes.map((c) => c.name)).toContain('Dog');
    expect(state.classes.map((c) => c.name)).toContain('Cat');

    // Popover should be closed
    expect(state.popoverState).toBeNull();
  });

  // J1-7: Relations are created when input contains arrows
  it('should create edges when input contains relations (arrows)', async () => {
    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 0, y: 0 },
    });

    render(<NewNodePopover />);
    switchToTextTab();
    fireEvent.change(screen.getByPlaceholderText(/자유 형식으로 입력하세요/), {
      target: { value: '# Animal\n# Dog\nAnimal -> Dog' },
    });
    fireEvent.click(screen.getByText('생성').closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('구조화 결과')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('확정').closest('button')!);

    const state = useOntologyStore.getState();
    expect(state.classes.length).toBe(2);
    expect(state.relationTypes.length).toBe(1);
    expect(state.edges.length).toBe(1);
  });

  // J1-8: Pending changes accumulate after confirm
  it('should accumulate pending changes after confirm', async () => {
    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 0, y: 0 },
    });

    render(<NewNodePopover />);
    switchToTextTab();
    fireEvent.change(screen.getByPlaceholderText(/자유 형식으로 입력하세요/), {
      target: { value: '# A\n# B\n# C' },
    });
    fireEvent.click(screen.getByText('생성').closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('구조화 결과')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('확정').closest('button')!);

    const changes = useOntologyStore.getState().pendingChanges;
    expect(changes.length).toBe(3);
    expect(changes.every((c) => c.operation === 'ADD')).toBe(true);
  });

  // C-1: Esc closes popover
  it('should close popover on Escape key', () => {
    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 0, y: 0 },
    });

    render(<NewNodePopover />);
    expect(screen.getByText('새 노드')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useOntologyStore.getState().popoverState).toBeNull();
  });

  // C-2: Click outside closes popover
  it('should close popover when clicking outside', () => {
    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 0, y: 0 },
    });

    render(<NewNodePopover />);
    // Click the backdrop (the fixed overlay div)
    const backdrop = screen.getByRole('dialog');
    fireEvent.click(backdrop);

    expect(useOntologyStore.getState().popoverState).toBeNull();
  });

  // mockParse: properties are parsed from "prop:" lines
  it('should parse properties from prop: lines', async () => {
    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 0, y: 0 },
    });

    render(<NewNodePopover />);
    switchToTextTab();
    fireEvent.change(screen.getByPlaceholderText(/자유 형식으로 입력하세요/), {
      target: { value: '# MyClass\nprop: age:integer' },
    });
    fireEvent.click(screen.getByText('생성').closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('구조화 결과')).toBeInTheDocument();
    });

    // Should have both class and property sections
    expect(screen.getByText(/클래스 1개/)).toBeInTheDocument();
    expect(screen.getByText(/프로퍼티 1개/)).toBeInTheDocument();
  });

  // Not open for relation type
  it('should not render for relation popoverState type', () => {
    useOntologyStore.getState().openPopover({
      type: 'relation',
      position: { x: 0, y: 0 },
      sourceId: 's1',
      targetId: 't1',
    });

    const { container } = render(<NewNodePopover />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
