import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  partitionsApi: { list: vi.fn().mockResolvedValue([]) },
}));

import Toolbar from '@/features/ontology/components/Toolbar';

// Toolbar embeds PartitionSwitcher which uses React Query — provide a client.
function renderToolbar() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Toolbar />
    </QueryClientProvider>,
  );
}

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
    toolMode: 'select' as const,
    zoomAction: null,
  });
}

describe('Toolbar (A-4)', () => {
  beforeEach(() => {
    resetStore();
  });

  it('should render the toolbar', () => {
    renderToolbar();
    expect(screen.getByTestId('toolbar')).toBeInTheDocument();
  });

  it('should have select and pan mode buttons', () => {
    renderToolbar();
    expect(screen.getByTitle('선택 도구 (V)')).toBeInTheDocument();
    expect(screen.getByTitle('이동 도구 (H)')).toBeInTheDocument();
  });

  it('should set toolMode to select when select button is clicked', () => {
    useOntologyStore.getState().setToolMode('pan');
    renderToolbar();
    fireEvent.click(screen.getByTitle('선택 도구 (V)'));
    expect(useOntologyStore.getState().toolMode).toBe('select');
  });

  it('should set toolMode to pan when pan button is clicked', () => {
    renderToolbar();
    fireEvent.click(screen.getByTitle('이동 도구 (H)'));
    expect(useOntologyStore.getState().toolMode).toBe('pan');
  });

  it('should trigger zoom in', () => {
    renderToolbar();
    fireEvent.click(screen.getByTitle('확대'));
    expect(useOntologyStore.getState().zoomAction).toBe('in');
  });

  it('should trigger zoom out', () => {
    renderToolbar();
    fireEvent.click(screen.getByTitle('축소'));
    expect(useOntologyStore.getState().zoomAction).toBe('out');
  });

  it('should trigger fit view', () => {
    renderToolbar();
    fireEvent.click(screen.getByTitle('전체 보기'));
    expect(useOntologyStore.getState().zoomAction).toBe('fit');
  });

  it('should have undo button', () => {
    renderToolbar();
    expect(screen.getByTitle('실행 취소 (Ctrl+Z)')).toBeInTheDocument();
  });

  it('should have redo button', () => {
    renderToolbar();
    expect(screen.getByTitle('다시 실행 (Ctrl+Shift+Z)')).toBeInTheDocument();
  });

  it('should have Import button that opens newNode popover', () => {
    renderToolbar();
    fireEvent.click(screen.getByText('가져오기'));
    expect(useOntologyStore.getState().popoverState?.type).toBe('newNode');
  });

  it('should highlight selected toolMode button', () => {
    renderToolbar();
    const selectBtn = screen.getByTitle('선택 도구 (V)');
    // In 'select' mode, select button should have 'secondary' variant class
    expect(selectBtn.className).toContain('secondary');
  });
});
