import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useOntologyStore } from '@/features/ontology/hooks/useOntologyStore';

// Mock motion/react
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

import ExplorerPanel from '@/features/ontology/components/ExplorerPanel';

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

describe('ExplorerPanel', () => {
  beforeEach(() => {
    resetStore();
  });

  it('should show empty state when no classes', () => {
    render(<ExplorerPanel />);
    expect(screen.getByText('캔버스를 더블클릭하여 시작하세요')).toBeInTheDocument();
  });

  it('should render class names in the tree', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Animal' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'Plant' });

    render(<ExplorerPanel />);
    expect(screen.getByText('Animal')).toBeInTheDocument();
    expect(screen.getByText('Plant')).toBeInTheDocument();
  });

  it('should filter tree items by search query', async () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Animal' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'Plant' });

    render(<ExplorerPanel />);

    const searchInput = screen.getByPlaceholderText('검색... (Ctrl+F)');
    fireEvent.change(searchInput, { target: { value: 'Ani' } });

    // PRD-Perf M1-4: 트리 필터는 150ms 디바운스 뒤 적용된다.
    await waitFor(() => {
      expect(screen.queryByText('Plant')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Animal')).toBeInTheDocument();
  });

  it('should show "검색 결과가 없습니다" when search has no results', async () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Animal' });

    render(<ExplorerPanel />);

    const searchInput = screen.getByPlaceholderText('검색... (Ctrl+F)');
    fireEvent.change(searchInput, { target: { value: 'zzzzz' } });

    // PRD-Perf M1-4: 트리 필터는 150ms 디바운스 뒤 적용된다.
    await waitFor(() => {
      expect(screen.getByText('검색 결과가 없습니다')).toBeInTheDocument();
    });
  });

  it('should show instance count for classes', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Animal' });
    useOntologyStore.getState().addInstance({ name: 'Dog', classId: 'c1' });
    useOntologyStore.getState().addInstance({ name: 'Cat', classId: 'c1' });

    render(<ExplorerPanel />);
    expect(screen.getByText('(2)')).toBeInTheDocument();
  });

  it('should select node when clicking on a tree item', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'ClickMe' });

    render(<ExplorerPanel />);
    fireEvent.click(screen.getByText('ClickMe'));

    expect(useOntologyStore.getState().selectedNodeId).toBe('c1');
    expect(useOntologyStore.getState().selectedNodeType).toBe('class');
  });

  it('should show child classes as nested items', () => {
    useOntologyStore.getState().addClass({ id: 'parent', name: 'Parent' });
    useOntologyStore.getState().addClass({ id: 'child', name: 'Child', parentId: 'parent' });

    // Expand the parent node
    useOntologyStore.getState().setExpanded('parent', true);

    render(<ExplorerPanel />);
    expect(screen.getByText('Parent')).toBeInTheDocument();
    expect(screen.getByText('Child')).toBeInTheDocument();
  });

  it('should have "새 클래스 추가" button', () => {
    render(<ExplorerPanel />);
    expect(screen.getByText('새 클래스 추가')).toBeInTheDocument();
  });
});
