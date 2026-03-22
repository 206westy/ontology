import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

// Mock LLM API — return instances and parentName in the response
const mockLlmParse = vi.fn();
vi.mock('@/features/ontology/api', () => ({
  llmApi: {
    parse: (...args: unknown[]) => mockLlmParse(...args),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
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
    toolMode: 'select' as const,
    zoomAction: null,
  });
}

describe('NewNodePopover — Iteration 2', () => {
  beforeEach(() => {
    resetStore();
    mockLlmParse.mockReset();
  });

  // A-3: LLM returns instances → instances are created in store
  it('should create instances from LLM parse result (A-3)', async () => {
    mockLlmParse.mockResolvedValue({
      classes: [{ name: 'Equipment', description: 'Semi equipment', color: '#2563eb', parentName: null }],
      properties: [],
      relations: [],
      instances: [
        { className: 'Equipment', name: 'SUPRA' },
        { className: 'Equipment', name: 'GENEVA' },
      ],
    });

    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 100, y: 200 },
    });

    render(<NewNodePopover />);
    fireEvent.change(screen.getByPlaceholderText(/자유 형식으로 입력하세요/), {
      target: { value: 'Equipment: SUPRA, GENEVA' },
    });
    fireEvent.click(screen.getByText('생성').closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('구조화 결과')).toBeInTheDocument();
    });

    // Preview should show instances
    expect(screen.getByText(/인스턴스 2개/)).toBeInTheDocument();

    // Click confirm
    fireEvent.click(screen.getByText('확정').closest('button')!);

    const state = useOntologyStore.getState();
    expect(state.classes).toHaveLength(1);
    expect(state.classes[0].name).toBe('Equipment');
    expect(state.instances).toHaveLength(2);
    expect(state.instances.map((i) => i.name)).toContain('SUPRA');
    expect(state.instances.map((i) => i.name)).toContain('GENEVA');
    // Each instance should be linked to the Equipment class
    expect(state.instances[0].classId).toBe(state.classes[0].id);
    expect(state.instances[1].classId).toBe(state.classes[0].id);
  });

  // A-3: Instance preview shows className in parentheses
  it('should show instance className in preview (A-3)', async () => {
    mockLlmParse.mockResolvedValue({
      classes: [{ name: 'Animal', description: '', color: null, parentName: null }],
      properties: [],
      relations: [],
      instances: [{ className: 'Animal', name: 'Buddy' }],
    });

    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 0, y: 0 },
    });

    render(<NewNodePopover />);
    fireEvent.change(screen.getByPlaceholderText(/자유 형식으로 입력하세요/), {
      target: { value: 'test' },
    });
    fireEvent.click(screen.getByText('생성').closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('구조화 결과')).toBeInTheDocument();
    });

    expect(screen.getByText('(Animal)')).toBeInTheDocument();
  });

  // B-7: parentName is present in LLM result but NOT used to set parentId
  it('should NOT set parentId from parentName (B-7 gap)', async () => {
    // Pre-existing class in store
    useOntologyStore.getState().addClass({ id: 'existing-equip', name: 'Equipment' });

    mockLlmParse.mockResolvedValue({
      classes: [{ name: 'DryAsher', description: 'Subtype of Equipment', color: '#2563eb', parentName: 'Equipment' }],
      properties: [],
      relations: [],
      instances: [],
    });

    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 0, y: 0 },
    });

    render(<NewNodePopover />);
    fireEvent.change(screen.getByPlaceholderText(/자유 형식으로 입력하세요/), {
      target: { value: 'DryAsher is a type of Equipment' },
    });
    fireEvent.click(screen.getByText('생성').closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('구조화 결과')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('확정').closest('button')!);

    const state = useOntologyStore.getState();
    const dryAsher = state.classes.find((c) => c.name === 'DryAsher');
    expect(dryAsher).toBeDefined();
    // BUG (B-7): parentName is 'Equipment' but parentId is NOT set
    expect(dryAsher!.parentId).toBeNull();
  });

  // A-6: Popover uses calcPopoverPosition (position is set via style)
  it('should position popover using calcPopoverPosition (A-6)', () => {
    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 300, y: 400 },
    });

    render(<NewNodePopover />);
    // The popover div should have style with left and top
    const dialog = screen.getByRole('dialog');
    const popoverInner = dialog.querySelector('[style]');
    expect(popoverInner).not.toBeNull();
    const style = popoverInner!.getAttribute('style');
    expect(style).toContain('left');
    expect(style).toContain('top');
  });

  // LLM context: existingClasses are passed to LLM API
  it('should pass existing class names to LLM API', async () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'ExistingClass' });

    mockLlmParse.mockResolvedValue({
      classes: [{ name: 'NewClass', description: '', color: null, parentName: null }],
      properties: [],
      relations: [],
      instances: [],
    });

    useOntologyStore.getState().openPopover({
      type: 'newNode',
      position: { x: 0, y: 0 },
    });

    render(<NewNodePopover />);
    fireEvent.change(screen.getByPlaceholderText(/자유 형식으로 입력하세요/), {
      target: { value: 'some text' },
    });
    fireEvent.click(screen.getByText('생성').closest('button')!);

    await waitFor(() => {
      expect(mockLlmParse).toHaveBeenCalled();
    });

    const callArgs = mockLlmParse.mock.calls[0][0];
    expect(callArgs.existingClasses).toContain('ExistingClass');
  });
});
