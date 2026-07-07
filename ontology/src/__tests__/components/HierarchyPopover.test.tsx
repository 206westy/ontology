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

import HierarchyPopover from '@/features/ontology/components/HierarchyPopover';

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
  });
}

describe('HierarchyPopover', () => {
  beforeEach(() => {
    resetStore();
  });

  it('should not render when popoverState is null', () => {
    const { container } = render(<HierarchyPopover />);
    expect(container.innerHTML).toBe('');
  });

  it('should not render for non-hierarchy popoverState', () => {
    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 0, y: 0 },
    });
    const { container } = render(<HierarchyPopover />);
    expect(container.innerHTML).toBe('');
  });

  // J4-1: Shows hierarchy popover with source and target
  it('should show hierarchy popover with correct class names', () => {
    useOntologyStore.getState().addClass({ id: 'child', name: 'Lithography' });
    useOntologyStore.getState().addClass({ id: 'parent', name: 'Equipment' });
    useOntologyStore.getState().openPopover({
      type: 'hierarchy',
      position: { x: 0, y: 0 },
      sourceId: 'child',
      targetId: 'parent',
    });

    render(<HierarchyPopover />);
    expect(screen.getByText('계층 이동')).toBeInTheDocument();
    expect(screen.getAllByText(/Lithography/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Equipment/).length).toBeGreaterThanOrEqual(1);
  });

  // J4-1: Shows descriptive text
  it('should show confirmation text asking to move as subclass', () => {
    useOntologyStore.getState().addClass({ id: 'child', name: 'Dog' });
    useOntologyStore.getState().addClass({ id: 'parent', name: 'Animal' });
    useOntologyStore.getState().openPopover({
      type: 'hierarchy',
      position: { x: 0, y: 0 },
      sourceId: 'child',
      targetId: 'parent',
    });

    render(<HierarchyPopover />);
    expect(screen.getAllByText(/Dog/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Animal/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/하위로 이동할까요/)).toBeInTheDocument();
  });

  // J4-1: Shows tree preview with (new) marker
  it('should show tree preview with new marker', () => {
    useOntologyStore.getState().addClass({ id: 'child', name: 'NewChild' });
    useOntologyStore.getState().addClass({ id: 'parent', name: 'Parent' });
    useOntologyStore.getState().openPopover({
      type: 'hierarchy',
      position: { x: 0, y: 0 },
      sourceId: 'child',
      targetId: 'parent',
    });

    render(<HierarchyPopover />);
    expect(screen.getByText('(new)')).toBeInTheDocument();
  });

  // J4-1: Shows existing children in tree preview
  it('should show existing children in tree preview', () => {
    useOntologyStore.getState().addClass({ id: 'parent', name: 'Vehicle' });
    useOntologyStore.getState().addClass({ id: 'existing', name: 'Car', parentId: 'parent' });
    useOntologyStore.getState().addClass({ id: 'newchild', name: 'Truck' });
    useOntologyStore.getState().openPopover({
      type: 'hierarchy',
      position: { x: 0, y: 0 },
      sourceId: 'newchild',
      targetId: 'parent',
    });

    render(<HierarchyPopover />);
    expect(screen.getAllByText(/Car/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Truck/).length).toBeGreaterThanOrEqual(1);
  });

  // J4-1: Has cancel and confirm buttons
  it('should have 취소 and 확정 buttons', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'A' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'B' });
    useOntologyStore.getState().openPopover({
      type: 'hierarchy',
      position: { x: 0, y: 0 },
      sourceId: 'c1',
      targetId: 'c2',
    });

    render(<HierarchyPopover />);
    expect(screen.getByText('취소')).toBeInTheDocument();
    expect(screen.getByText('확정')).toBeInTheDocument();
  });

  // J4-2: Click 확정 → updates parentId
  it('should set parentId when 확정 is clicked', () => {
    useOntologyStore.getState().addClass({ id: 'child', name: 'Dog' });
    useOntologyStore.getState().addClass({ id: 'parent', name: 'Animal' });
    useOntologyStore.getState().openPopover({
      type: 'hierarchy',
      position: { x: 0, y: 0 },
      sourceId: 'child',
      targetId: 'parent',
    });

    render(<HierarchyPopover />);
    fireEvent.click(screen.getByText('확정').closest('button')!);

    const state = useOntologyStore.getState();
    const child = state.classes.find((c) => c.id === 'child');
    expect(child!.parentId).toBe('parent');
    expect(state.popoverState).toBeNull();
  });

  // J4-2: Records MOD change
  it('should record a MOD change when hierarchy is confirmed', () => {
    useOntologyStore.getState().addClass({ id: 'child', name: 'Dog' });
    useOntologyStore.getState().addClass({ id: 'parent', name: 'Animal' });
    // Clear the ADD changes from addClass
    useOntologyStore.getState().clearChanges();

    useOntologyStore.getState().openPopover({
      type: 'hierarchy',
      position: { x: 0, y: 0 },
      sourceId: 'child',
      targetId: 'parent',
    });

    render(<HierarchyPopover />);
    fireEvent.click(screen.getByText('확정').closest('button')!);

    const changes = useOntologyStore.getState().pendingChanges;
    expect(changes).toHaveLength(1);
    expect(changes[0].operation).toBe('MOD');
    expect(changes[0].targetTable).toBe('classes');
  });

  // J4-3: Click 취소 → no changes
  it('should not modify store when 취소 is clicked', () => {
    useOntologyStore.getState().addClass({ id: 'child', name: 'Dog' });
    useOntologyStore.getState().addClass({ id: 'parent', name: 'Animal' });
    useOntologyStore.getState().openPopover({
      type: 'hierarchy',
      position: { x: 0, y: 0 },
      sourceId: 'child',
      targetId: 'parent',
    });

    render(<HierarchyPopover />);
    fireEvent.click(screen.getByText('취소').closest('button')!);

    const child = useOntologyStore.getState().classes.find((c) => c.id === 'child');
    expect(child!.parentId).toBeNull();
    expect(useOntologyStore.getState().popoverState).toBeNull();
  });

  // C-1: Esc closes popover
  it('should close on Escape key', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'A' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'B' });
    useOntologyStore.getState().openPopover({
      type: 'hierarchy',
      position: { x: 0, y: 0 },
      sourceId: 'c1',
      targetId: 'c2',
    });

    render(<HierarchyPopover />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useOntologyStore.getState().popoverState).toBeNull();
  });

  // C-2: Click outside closes
  it('should close on backdrop click', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'A' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'B' });
    useOntologyStore.getState().openPopover({
      type: 'hierarchy',
      position: { x: 0, y: 0 },
      sourceId: 'c1',
      targetId: 'c2',
    });

    render(<HierarchyPopover />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(useOntologyStore.getState().popoverState).toBeNull();
  });
});
