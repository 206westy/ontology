import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  });
}

describe('RelationPopover', () => {
  beforeEach(() => {
    resetStore();
  });

  it('should not render when popoverState is null', () => {
    const { container } = render(<RelationPopover />);
    expect(container.innerHTML).toBe('');
  });

  it('should not render when popoverState type is not relation', () => {
    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 0, y: 0 },
    });
    const { container } = render(<RelationPopover />);
    expect(container.innerHTML).toBe('');
  });

  // J3-2: Shows popover with source and target names
  it('should show source and target node names', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Animal' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'Plant' });
    useOntologyStore.getState().openPopover({
      type: 'relation',
      position: { x: 0, y: 0 },
      sourceId: 'c1',
      targetId: 'c2',
    });

    render(<RelationPopover />);
    expect(screen.getByText('Animal')).toBeInTheDocument();
    expect(screen.getByText('Plant')).toBeInTheDocument();
    expect(screen.getByText('관계 설정')).toBeInTheDocument();
  });

  // J3-2: Has cancel and connect buttons
  it('should have 취소 and 연결 buttons', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'A' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'B' });
    useOntologyStore.getState().openPopover({
      type: 'relation',
      position: { x: 0, y: 0 },
      sourceId: 'c1',
      targetId: 'c2',
    });

    render(<RelationPopover />);
    expect(screen.getByText('취소')).toBeInTheDocument();
    expect(screen.getByText('연결')).toBeInTheDocument();
  });

  // J3-2: Connect button disabled when nothing selected
  it('should disable connect button when no relation selected or entered', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'A' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'B' });
    useOntologyStore.getState().openPopover({
      type: 'relation',
      position: { x: 0, y: 0 },
      sourceId: 'c1',
      targetId: 'c2',
    });

    render(<RelationPopover />);
    const connectBtn = screen.getByText('연결').closest('button');
    expect(connectBtn).toBeDisabled();
  });

  // J3-3: Select existing relation type via radio
  it('should enable connect button when existing relation is selected', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'A' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'B' });
    useOntologyStore.getState().addRelationType({ id: 'rt1', name: 'has_part' });
    useOntologyStore.getState().openPopover({
      type: 'relation',
      position: { x: 0, y: 0 },
      sourceId: 'c1',
      targetId: 'c2',
    });

    render(<RelationPopover />);
    expect(screen.getByText('has_part')).toBeInTheDocument();

    const radio = screen.getByRole('radio');
    fireEvent.click(radio);

    const connectBtn = screen.getByText('연결').closest('button');
    expect(connectBtn).not.toBeDisabled();
  });

  // J3-4: Enter new relation name
  it('should enable connect button when new relation name is entered', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'A' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'B' });
    useOntologyStore.getState().openPopover({
      type: 'relation',
      position: { x: 0, y: 0 },
      sourceId: 'c1',
      targetId: 'c2',
    });

    render(<RelationPopover />);
    const input = screen.getByPlaceholderText('관계 이름 입력...');
    fireEvent.change(input, { target: { value: 'new_relation' } });

    const connectBtn = screen.getByText('연결').closest('button');
    expect(connectBtn).not.toBeDisabled();
  });

  // J3-4: New relation name deselects radio
  it('should deselect radio when new relation name is entered', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'A' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'B' });
    useOntologyStore.getState().addRelationType({ id: 'rt1', name: 'existing' });
    useOntologyStore.getState().openPopover({
      type: 'relation',
      position: { x: 0, y: 0 },
      sourceId: 'c1',
      targetId: 'c2',
    });

    render(<RelationPopover />);

    // Select existing
    fireEvent.click(screen.getByRole('radio'));
    expect(screen.getByRole('radio')).toBeChecked();

    // Type new name
    const input = screen.getByPlaceholderText('관계 이름 입력...');
    fireEvent.change(input, { target: { value: 'brand_new' } });

    // Radio should be unchecked
    expect(screen.getByRole('radio')).not.toBeChecked();
  });

  // J3-5: Click connect with existing relation → creates edge
  it('should create edge when connect is clicked with existing relation', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'A' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'B' });
    useOntologyStore.getState().addRelationType({ id: 'rt1', name: 'has_part' });
    useOntologyStore.getState().openPopover({
      type: 'relation',
      position: { x: 0, y: 0 },
      sourceId: 'c1',
      targetId: 'c2',
    });

    render(<RelationPopover />);
    fireEvent.click(screen.getByRole('radio'));
    fireEvent.click(screen.getByText('연결').closest('button')!);

    const state = useOntologyStore.getState();
    expect(state.edges).toHaveLength(1);
    expect(state.edges[0].sourceId).toBe('c1');
    expect(state.edges[0].targetId).toBe('c2');
    expect(state.edges[0].relationTypeId).toBe('rt1');
    expect(state.popoverState).toBeNull();
  });

  // J3-5: Click connect with new relation → creates relation type + edge
  it('should create new relation type and edge when connect is clicked with new name', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'A' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'B' });
    useOntologyStore.getState().openPopover({
      type: 'relation',
      position: { x: 0, y: 0 },
      sourceId: 'c1',
      targetId: 'c2',
    });

    render(<RelationPopover />);
    const input = screen.getByPlaceholderText('관계 이름 입력...');
    fireEvent.change(input, { target: { value: 'uses' } });
    fireEvent.click(screen.getByText('연결').closest('button')!);

    const state = useOntologyStore.getState();
    expect(state.relationTypes).toHaveLength(1);
    expect(state.relationTypes[0].name).toBe('uses');
    expect(state.edges).toHaveLength(1);
    expect(state.edges[0].sourceKind).toBe('class');
    expect(state.edges[0].targetKind).toBe('class');
    expect(state.popoverState).toBeNull();
  });

  // C-1: Esc closes popover
  it('should close on Escape key', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'A' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'B' });
    useOntologyStore.getState().openPopover({
      type: 'relation',
      position: { x: 0, y: 0 },
      sourceId: 'c1',
      targetId: 'c2',
    });

    render(<RelationPopover />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useOntologyStore.getState().popoverState).toBeNull();
  });

  // C-2: Click outside closes
  it('should close on backdrop click', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'A' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'B' });
    useOntologyStore.getState().openPopover({
      type: 'relation',
      position: { x: 0, y: 0 },
      sourceId: 'c1',
      targetId: 'c2',
    });

    render(<RelationPopover />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(useOntologyStore.getState().popoverState).toBeNull();
  });

  // Shows "관계 이름:" label when no existing relation types
  it('should show "관계 이름:" when there are no existing relation types', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'A' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'B' });
    useOntologyStore.getState().openPopover({
      type: 'relation',
      position: { x: 0, y: 0 },
      sourceId: 'c1',
      targetId: 'c2',
    });

    render(<RelationPopover />);
    expect(screen.getByText('관계 이름:')).toBeInTheDocument();
  });

  // Shows "또는 새로 입력:" when existing relation types exist
  it('should show "또는 새로 입력:" when existing relation types exist', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'A' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'B' });
    useOntologyStore.getState().addRelationType({ id: 'rt1', name: 'test' });
    useOntologyStore.getState().openPopover({
      type: 'relation',
      position: { x: 0, y: 0 },
      sourceId: 'c1',
      targetId: 'c2',
    });

    render(<RelationPopover />);
    expect(screen.getByText('또는 새로 입력:')).toBeInTheDocument();
  });

  // Enter key on input triggers connect — verify input value is reflected then click connect
  it('should allow connecting after typing new relation and clicking connect', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'A' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'B' });
    useOntologyStore.getState().openPopover({
      type: 'relation',
      position: { x: 0, y: 0 },
      sourceId: 'c1',
      targetId: 'c2',
    });

    render(<RelationPopover />);
    const input = screen.getByPlaceholderText('관계 이름 입력...');
    fireEvent.change(input, { target: { value: 'enter_rel' } });

    // Verify connect button is now enabled and click it
    const connectBtn = screen.getByText('연결').closest('button')!;
    expect(connectBtn).not.toBeDisabled();
    fireEvent.click(connectBtn);

    expect(useOntologyStore.getState().edges).toHaveLength(1);
    expect(useOntologyStore.getState().relationTypes[0].name).toBe('enter_rel');
    expect(useOntologyStore.getState().popoverState).toBeNull();
  });
});
