import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

import RelationPopover from '@/features/ontology/components/RelationPopover';

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

describe('RelationPopover — Iteration 2 (C-1: targetId-less opening)', () => {
  beforeEach(() => {
    resetStore();
  });

  // C-1: Open without targetId → shows target selection UI
  it('should show target selection when opened without targetId', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Source' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'PossibleTarget' });
    useOntologyStore.getState().openPopover({
      type: 'relation',
      position: { x: 0, y: 0 },
      sourceId: 'c1',
      // No targetId
    });

    render(<RelationPopover />);
    expect(screen.getByText('관계 설정')).toBeInTheDocument();
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('대상 선택...')).toBeInTheDocument();
    expect(screen.getByText('대상 노드 선택:')).toBeInTheDocument();
  });

  // C-1: Target candidates exclude source
  it('should not show source in target candidates', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Source' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'Target' });
    useOntologyStore.getState().openPopover({
      type: 'relation',
      position: { x: 0, y: 0 },
      sourceId: 'c1',
    });

    render(<RelationPopover />);
    // Target list should show Target but not Source
    expect(screen.getByText('Target')).toBeInTheDocument();
    // Source appears only in the header, not as a candidate button
    const sourceElements = screen.getAllByText('Source');
    expect(sourceElements.length).toBe(1); // Only the header
  });

  // C-1: Target search filters candidates
  it('should filter target candidates by search', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Source' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'Alpha' });
    useOntologyStore.getState().addClass({ id: 'c3', name: 'Beta' });
    useOntologyStore.getState().openPopover({
      type: 'relation',
      position: { x: 0, y: 0 },
      sourceId: 'c1',
    });

    render(<RelationPopover />);
    const searchInput = screen.getByPlaceholderText('노드 검색...');
    fireEvent.change(searchInput, { target: { value: 'Alp' } });

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
  });

  // C-1: Select target, then relation, then connect
  it('should allow selecting target then connecting', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Source' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'Target' });
    useOntologyStore.getState().openPopover({
      type: 'relation',
      position: { x: 0, y: 0 },
      sourceId: 'c1',
    });

    render(<RelationPopover />);

    // Click target candidate
    fireEvent.click(screen.getByText('Target'));

    // Now relation input should appear
    const relInput = screen.getByPlaceholderText('관계 이름 입력...');
    fireEvent.change(relInput, { target: { value: 'depends_on' } });

    fireEvent.click(screen.getByText('연결').closest('button')!);

    const state = useOntologyStore.getState();
    expect(state.edges).toHaveLength(1);
    expect(state.edges[0].sourceId).toBe('c1');
    expect(state.edges[0].targetId).toBe('c2');
    expect(state.relationTypes[0].name).toBe('depends_on');
    expect(state.popoverState).toBeNull();
  });

  // C-1: Connect button disabled when no target selected
  it('should disable connect when no target is selected', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'S' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'T' });
    useOntologyStore.getState().openPopover({
      type: 'relation',
      position: { x: 0, y: 0 },
      sourceId: 'c1',
    });

    render(<RelationPopover />);
    const connectBtn = screen.getByText('연결').closest('button');
    expect(connectBtn).toBeDisabled();
  });

  // C-1: "변경" button lets you re-select target
  it('should allow re-selecting target via 변경 button', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'S' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'T1' });
    useOntologyStore.getState().addClass({ id: 'c3', name: 'T2' });
    useOntologyStore.getState().openPopover({
      type: 'relation',
      position: { x: 0, y: 0 },
      sourceId: 'c1',
    });

    render(<RelationPopover />);
    // Select first target
    fireEvent.click(screen.getByText('T1'));
    expect(screen.getByText('변경')).toBeInTheDocument();

    // Click 변경 to go back to selection
    fireEvent.click(screen.getByText('변경'));
    expect(screen.getByText('대상 노드 선택:')).toBeInTheDocument();
  });

  // Show empty message when no targets available
  it('should show empty message when only source exists', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Alone' });
    useOntologyStore.getState().openPopover({
      type: 'relation',
      position: { x: 0, y: 0 },
      sourceId: 'c1',
    });

    render(<RelationPopover />);
    expect(screen.getByText('대상 노드가 없습니다')).toBeInTheDocument();
  });
});
