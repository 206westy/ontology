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

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
}));

vi.mock('@/features/ontology/api', () => ({
  validateApi: { run: vi.fn() },
  importExportApi: { exportAsFile: vi.fn() },
}));

import Toolbar from '@/features/ontology/components/Toolbar';

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

describe('Toolbar (A-4)', () => {
  beforeEach(() => {
    resetStore();
  });

  it('should render toolbar with title and version', () => {
    render(<Toolbar />);
    expect(screen.getByText('PSK PEE Ontology')).toBeInTheDocument();
    expect(screen.getByText('v0.1 draft')).toBeInTheDocument();
  });

  it('should have select and pan mode buttons', () => {
    render(<Toolbar />);
    expect(screen.getByTitle('선택 도구 (V)')).toBeInTheDocument();
    expect(screen.getByTitle('이동 도구 (H)')).toBeInTheDocument();
  });

  it('should set toolMode to select when select button is clicked', () => {
    useOntologyStore.getState().setToolMode('pan');
    render(<Toolbar />);
    fireEvent.click(screen.getByTitle('선택 도구 (V)'));
    expect(useOntologyStore.getState().toolMode).toBe('select');
  });

  it('should set toolMode to pan when pan button is clicked', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTitle('이동 도구 (H)'));
    expect(useOntologyStore.getState().toolMode).toBe('pan');
  });

  it('should trigger zoom in', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTitle('확대'));
    expect(useOntologyStore.getState().zoomAction).toBe('in');
  });

  it('should trigger zoom out', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTitle('축소'));
    expect(useOntologyStore.getState().zoomAction).toBe('out');
  });

  it('should trigger fit view', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTitle('전체 보기'));
    expect(useOntologyStore.getState().zoomAction).toBe('fit');
  });

  it('should have undo button', () => {
    render(<Toolbar />);
    expect(screen.getByTitle('실행 취소 (Ctrl+Z)')).toBeInTheDocument();
  });

  it('should have redo button', () => {
    render(<Toolbar />);
    expect(screen.getByTitle('다시 실행 (Ctrl+Shift+Z)')).toBeInTheDocument();
  });

  it('should have Import button that opens newNode popover', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByText('가져오기'));
    expect(useOntologyStore.getState().popoverState?.type).toBe('newNode');
  });

  it('should highlight selected toolMode button', () => {
    render(<Toolbar />);
    const selectBtn = screen.getByTitle('선택 도구 (V)');
    // In 'select' mode, select button should have 'secondary' variant class
    expect(selectBtn.className).toContain('secondary');
  });
});
