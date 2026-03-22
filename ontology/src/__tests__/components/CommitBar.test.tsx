import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useOntologyStore } from '@/features/ontology/hooks/useOntologyStore';

// Mock framer-motion to render plain elements
vi.mock('framer-motion', () => ({
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

// Must import after mock
import CommitBar from '@/features/ontology/components/CommitBar';

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
    render(<CommitBar />);
    expect(screen.getByText('변경사항 0건')).toBeInTheDocument();
  });

  it('should show change count after adding classes', () => {
    useOntologyStore.getState().addClass({ name: 'A' });
    useOntologyStore.getState().addClass({ name: 'B' });

    render(<CommitBar />);
    expect(screen.getByText('변경사항 2건')).toBeInTheDocument();
  });

  it('should show summary with class count', () => {
    useOntologyStore.getState().addClass({ name: 'X' });

    render(<CommitBar />);
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('should disable buttons when no changes', () => {
    render(<CommitBar />);

    const undoBtn = screen.getByText('되돌리기').closest('button');
    const changeListBtn = screen.getByText('변경 내역').closest('button');
    const pushBtn = screen.getByText('Neo4j 푸시').closest('button');

    expect(undoBtn).toBeDisabled();
    expect(changeListBtn).toBeDisabled();
    expect(pushBtn).toBeDisabled();
  });

  it('should enable buttons when there are changes', () => {
    useOntologyStore.getState().addClass({ name: 'EnableTest' });

    render(<CommitBar />);

    const undoBtn = screen.getByText('되돌리기').closest('button');
    const changeListBtn = screen.getByText('변경 내역').closest('button');
    const pushBtn = screen.getByText('Neo4j 푸시').closest('button');

    expect(undoBtn).not.toBeDisabled();
    expect(changeListBtn).not.toBeDisabled();
    expect(pushBtn).not.toBeDisabled();
  });

  it('should show summary with multiple item types', () => {
    const classId = useOntologyStore.getState().addClass({ name: 'C1' });
    useOntologyStore.getState().addProperty({ name: 'p1', classId });
    useOntologyStore.getState().addInstance({ name: 'i1', classId });

    render(<CommitBar />);
    // All three are ADD operations, so summary shows +3
    expect(screen.getByText('+3')).toBeInTheDocument();
  });

  // A-5: ADD/MOD/DEL separate display with colors
  it('should show ADD count in emerald', () => {
    useOntologyStore.getState().addClass({ name: 'A' });
    useOntologyStore.getState().addClass({ name: 'B' });

    render(<CommitBar />);
    const addSpan = screen.getByText('+2');
    expect(addSpan.className).toContain('emerald');
  });

  it('should show MOD count in amber', () => {
    const id = useOntologyStore.getState().addClass({ name: 'Old' });
    useOntologyStore.getState().updateClass(id, { name: 'New' });

    render(<CommitBar />);
    const modSpan = screen.getByText('~1');
    expect(modSpan.className).toContain('amber');
  });

  it('should show DEL count in red', () => {
    const id = useOntologyStore.getState().addClass({ name: 'Gone' });
    useOntologyStore.getState().removeClass(id);

    render(<CommitBar />);
    const delSpan = screen.getByText('-1');
    expect(delSpan.className).toContain('red');
  });

  it('should show mixed ADD/MOD/DEL counts (A-5)', () => {
    const id1 = useOntologyStore.getState().addClass({ name: 'Keep' });
    const id2 = useOntologyStore.getState().addClass({ name: 'Edit' });
    useOntologyStore.getState().updateClass(id2, { name: 'Edited' });
    useOntologyStore.getState().removeClass(id1);

    render(<CommitBar />);
    expect(screen.getByText('+2')).toBeInTheDocument(); // 2 ADDs
    expect(screen.getByText('~1')).toBeInTheDocument(); // 1 MOD
    expect(screen.getByText('-1')).toBeInTheDocument(); // 1 DEL
  });

  // B-4: Neo4j push button has no onClick handler
  it('should have Neo4j push button without click handler (B-4 gap)', () => {
    useOntologyStore.getState().addClass({ name: 'Test' });
    render(<CommitBar />);
    const pushBtn = screen.getByText('Neo4j 푸시').closest('button');
    expect(pushBtn).not.toBeDisabled();
    // Button exists and is enabled but has no onClick — clicking should not change state
    const changesBefore = useOntologyStore.getState().pendingChanges.length;
    pushBtn!.click();
    const changesAfter = useOntologyStore.getState().pendingChanges.length;
    expect(changesAfter).toBe(changesBefore);
  });
});
