import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useOntologyStore } from '@/features/ontology/hooks/useOntologyStore';

// Mock motion/react to render plain elements
vi.mock('motion/react', () => ({
  motion: new Proxy({}, {
    get: (_target, prop: string) => {
      return ({ children, ...props }: Record<string, unknown>) => {
        const Component = prop as keyof JSX.IntrinsicElements;
        return <Component {...props}>{children}</Component>;
      };
    },
  }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
}));

// Mock API
vi.mock('@/features/ontology/api', () => ({
  commitsApi: {
    create: vi.fn(),
    unpushed: vi.fn().mockResolvedValue({ ids: [], count: 0 }),
  },
  embeddingsApi: { process: vi.fn().mockResolvedValue({}) },
}));

// Mock NeoConfirmSheet to avoid complex deps
vi.mock('@/features/ontology/components/neo4j/NeoConfirmSheet', () => ({
  default: () => null,
}));

// Mock Sheet to avoid Radix Presence issues
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: Record<string, unknown>) => <>{children}</>,
  SheetContent: () => null,
  SheetHeader: ({ children }: Record<string, unknown>) => <div>{children as React.ReactNode}</div>,
  SheetTitle: ({ children }: Record<string, unknown>) => <div>{children as React.ReactNode}</div>,
  SheetDescription: ({ children }: Record<string, unknown>) => <div>{children as React.ReactNode}</div>,
}));

// Mock ScrollArea
vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, ...props }: Record<string, unknown>) => <div {...props}>{children as React.ReactNode}</div>,
  ScrollBar: () => null,
}));

// Must import after mock
import CommitBar from '@/features/ontology/components/CommitBar';

// useQuery(미반영 카운트)를 위해 QueryClientProvider 로 감싼다.
function renderBar() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CommitBar />
    </QueryClientProvider>,
  );
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
  });
}

describe('CommitBar', () => {
  beforeEach(() => {
    resetStore();
  });

  it('should show 0 changes when no pending changes', () => {
    renderBar();
    // PRD-K M3: 카운트가 펄스 애니메이션용 별도 요소로 분리됨
    expect(screen.getByTestId('status-sentence')).toBeInTheDocument();
    expect(screen.getByTestId('pending-count')).toHaveTextContent('0');
  });

  it('should show change count after adding classes', () => {
    useOntologyStore.getState().addClass({ name: 'A' });
    useOntologyStore.getState().addClass({ name: 'B' });

    renderBar();
    expect(screen.getByTestId('pending-count')).toHaveTextContent('2');
  });

  it('should show summary with class count', () => {
    useOntologyStore.getState().addClass({ name: 'X' });

    renderBar();
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('should disable buttons when no changes', () => {
    renderBar();

    const undoBtn = screen.getByText('전체 취소').closest('button');
    const changeListBtn = screen.getByText('변경 내역').closest('button');
    const pushBtn = screen.getByTestId('neo4j-push-btn');

    expect(undoBtn).toBeDisabled();
    expect(changeListBtn).toBeDisabled();
    expect(pushBtn).toBeDisabled();
  });

  it('should enable buttons when there are changes', () => {
    useOntologyStore.getState().addClass({ name: 'EnableTest' });

    renderBar();

    const undoBtn = screen.getByText('전체 취소').closest('button');
    const changeListBtn = screen.getByText('변경 내역').closest('button');
    const pushBtn = screen.getByTestId('neo4j-push-btn');

    expect(undoBtn).not.toBeDisabled();
    expect(changeListBtn).not.toBeDisabled();
    expect(pushBtn).not.toBeDisabled();
  });

  it('should show summary with multiple item types', () => {
    const classId = useOntologyStore.getState().addClass({ name: 'C1' });
    useOntologyStore.getState().addProperty({ name: 'p1', classId });
    useOntologyStore.getState().addInstance({ name: 'i1', classId });

    renderBar();
    // All three are ADD operations, so summary shows +3
    expect(screen.getByText('+3')).toBeInTheDocument();
  });

  // A-5: ADD/MOD/DEL separate display with colors
  it('should show ADD count in emerald', () => {
    useOntologyStore.getState().addClass({ name: 'A' });
    useOntologyStore.getState().addClass({ name: 'B' });

    renderBar();
    const addSpan = screen.getByText('+2');
    expect(addSpan.className).toContain('emerald');
  });

  it('should show MOD count in amber', () => {
    const id = useOntologyStore.getState().addClass({ name: 'Old' });
    useOntologyStore.getState().updateClass(id, { name: 'New' });

    renderBar();
    const modSpan = screen.getByText('~1');
    expect(modSpan.className).toContain('amber');
  });

  it('should show DEL count in red', () => {
    const id = useOntologyStore.getState().addClass({ name: 'Gone' });
    useOntologyStore.getState().removeClass(id);

    renderBar();
    const delSpan = screen.getByText('-1');
    expect(delSpan.className).toContain('red');
  });

  it('should show mixed ADD/MOD/DEL counts (A-5)', () => {
    const id1 = useOntologyStore.getState().addClass({ name: 'Keep' });
    const id2 = useOntologyStore.getState().addClass({ name: 'Edit' });
    useOntologyStore.getState().updateClass(id2, { name: 'Edited' });
    useOntologyStore.getState().removeClass(id1);

    renderBar();
    expect(screen.getByText('+2')).toBeInTheDocument(); // 2 ADDs
    expect(screen.getByText('~1')).toBeInTheDocument(); // 1 MOD
    expect(screen.getByText('-1')).toBeInTheDocument(); // 1 DEL
  });

  // Push button opens NeoConfirmSheet
  it('should have push button that does not clear changes directly', () => {
    useOntologyStore.getState().addClass({ name: 'Test' });
    renderBar();
    const pushBtn = screen.getByTestId('neo4j-push-btn');
    expect(pushBtn).not.toBeDisabled();
    const changesBefore = useOntologyStore.getState().pendingChanges.length;
    pushBtn!.click();
    const changesAfter = useOntologyStore.getState().pendingChanges.length;
    expect(changesAfter).toBe(changesBefore);
  });
});
