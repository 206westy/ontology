import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useOntologyStore } from '@/features/ontology/hooks/useOntologyStore';
import HealthScoreBadge from '@/features/ontology/components/HealthScoreBadge';

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
    highlightNodeIds: [],
  });
}

describe('HealthScoreBadge (S5)', () => {
  beforeEach(resetStore);

  it('renders nothing for an empty model', () => {
    const { container } = render(<HealthScoreBadge />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a live structural health score for a non-empty model', () => {
    useOntologyStore.getState().addClass({ name: 'A' });
    useOntologyStore.getState().addClass({ name: 'B' });
    render(<HealthScoreBadge />);
    expect(screen.getByRole('button', { name: /구조 건강도/ })).toBeInTheDocument();
  });

  it('dispatches the health event when clicked (opens the dashboard)', () => {
    useOntologyStore.getState().addClass({ name: 'A' });
    let opened = false;
    const handler = () => { opened = true; };
    window.addEventListener('ontology:health', handler);
    render(<HealthScoreBadge />);
    fireEvent.click(screen.getByRole('button', { name: /구조 건강도/ }));
    window.removeEventListener('ontology:health', handler);
    expect(opened).toBe(true);
  });
});
