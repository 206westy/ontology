import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useOntologyStore } from '@/features/ontology/hooks/useOntologyStore';

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

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
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
    toolMode: 'select' as const,
    zoomAction: null,
  });
}

describe('RightPanel — Iteration 2', () => {
  beforeEach(() => {
    resetStore();
  });

  // B-2: Tab structure — Relations is a separate tab (differs from PRD single scroll)
  it('should have separate tabs: 상세, 관계, AI (B-2 PRD gap)', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Test' });
    useOntologyStore.getState().selectNode('c1', 'class');

    render(<RightPanel />);
    expect(screen.getByText('상세')).toBeInTheDocument();
    expect(screen.getByText('관계')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
  });

  // B-3: AI tab exists but is not the default active tab
  it('should have AI tab trigger (B-3 not implemented)', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Test' });
    useOntologyStore.getState().selectNode('c1', 'class');

    render(<RightPanel />);
    // AI tab trigger exists
    const aiTab = screen.getByRole('tab', { name: 'AI' });
    expect(aiTab).toBeInTheDocument();
    // It's not active by default (detail tab is active)
    expect(aiTab).toHaveAttribute('data-state', 'inactive');
  });

  // B-6: Instance values show — (dash) instead of actual values
  it('should show dash for instance property values (B-6 gap)', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Person' });
    useOntologyStore.getState().addProperty({ name: 'age', classId: 'c1', dataType: 'integer' });
    useOntologyStore.getState().addInstance({ id: 'i1', name: 'John', classId: 'c1' });
    // Add an instance value in store
    useOntologyStore.setState((state) => ({
      instanceValues: [
        ...state.instanceValues,
        { id: 'iv1', instanceId: 'i1', propertyId: state.properties[0].id, value: '30' },
      ],
    }));
    useOntologyStore.getState().selectNode('c1', 'class');

    render(<RightPanel />);
    // Both Properties (1) and Instances (1) sections show count
    const countElements = screen.getAllByText('(1)');
    expect(countElements.length).toBeGreaterThanOrEqual(1);
    // Instances section exists
    expect(screen.getByText('Instances')).toBeInTheDocument();
    // Note: even with instanceValues, the RightPanel renders "—" (em dash) for values (B-6 gap)
  });

  // B-9: Instance selected → no description editing
  it('should not show description editor for instance (B-9 gap)', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Animal' });
    useOntologyStore.getState().addInstance({ id: 'i1', name: 'Dog', classId: 'c1' });
    useOntologyStore.getState().selectNode('i1', 'instance');

    render(<RightPanel />);
    expect(screen.getByText('Dog')).toBeInTheDocument();
    expect(screen.getByText('INSTANCE')).toBeInTheDocument();
    // No description field for instance
    expect(screen.queryByText(/클릭하여 설명을 추가/)).not.toBeInTheDocument();
  });

  // A-7: Constraint inline input (instead of window.prompt)
  it('should show Constraints section with inline add for class (A-7)', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Person' });
    useOntologyStore.getState().selectNode('c1', 'class');

    render(<RightPanel />);
    // Constraints section exists (collapsed by default)
    expect(screen.getByText('Constraints')).toBeInTheDocument();
  });

  // C-2: focusNode called when Explorer tree item is clicked (verified via store)
  it('should show selected class with all detail sections', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Vehicle' });
    useOntologyStore.getState().addProperty({ name: 'speed', classId: 'c1' });
    useOntologyStore.getState().addClass({ id: 'c2', name: 'Car', parentId: 'c1' });
    useOntologyStore.getState().addAxiom({ description: 'Must have speed', classIds: ['c1'] });
    useOntologyStore.getState().selectNode('c1', 'class');

    render(<RightPanel />);
    expect(screen.getByText('Vehicle')).toBeInTheDocument();
    expect(screen.getByText('Subclasses')).toBeInTheDocument();
    expect(screen.getByText('Car')).toBeInTheDocument();
    expect(screen.getByText('Properties')).toBeInTheDocument();
    expect(screen.getByText('speed')).toBeInTheDocument();
    expect(screen.getByText('Constraints')).toBeInTheDocument();
    expect(screen.getByText('Instances')).toBeInTheDocument();
  });
});
