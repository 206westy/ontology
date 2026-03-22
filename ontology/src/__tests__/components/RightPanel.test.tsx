import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useOntologyStore } from '@/features/ontology/hooks/useOntologyStore';

// Mock framer-motion
vi.mock('framer-motion', () => ({
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

  it('should show tabs: 상세, 관계, AI', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Test' });
    useOntologyStore.getState().selectNode('c1', 'class');

    render(<RightPanel />);
    expect(screen.getByText('상세')).toBeInTheDocument();
    expect(screen.getByText('관계')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
  });
});
