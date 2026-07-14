'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels';
import type { Layout } from 'react-resizable-panels';
import { Loader2, FolderTree, PanelRight } from 'lucide-react';
import ExplorerPanel from '@/features/ontology/components/ExplorerPanel';
import Toolbar from '@/features/ontology/components/Toolbar';
import RightPanel from '@/features/ontology/components/RightPanel';
import CommitBar from '@/features/ontology/components/CommitBar';
import NewNodePopover from '@/features/ontology/components/NewNodePopover';
import RelationPopover from '@/features/ontology/components/RelationPopover';
import HierarchyPopover from '@/features/ontology/components/HierarchyPopover';
import DeleteConfirmDialog from '@/features/ontology/components/DeleteConfirmDialog';
import CommandPalette from '@/features/ontology/components/CommandPalette';
import GuidedJourney from '@/features/ontology/components/journey/GuidedJourney';
import OnboardingGuide from '@/features/ontology/components/OnboardingGuide';
import SplashScreen from '@/features/ontology/components/SplashScreen';
import { useLoadOntology } from '@/features/ontology/hooks/useLoadOntology';
import { useKeyboardShortcuts } from '@/features/ontology/hooks/useKeyboardShortcuts';
import { useApiSync } from '@/features/ontology/hooks/useApiSync';
import { useUrlSelectionSync } from '@/features/ontology/hooks/useUrlSelectionSync';
import { useOntologyStore } from '@/features/ontology/hooks/useOntologyStore';

// PRD-Perf M2-1: cytoscape 코어 + 레이아웃 4종(fcose/cola/dagre/edgehandles)은
// GraphCanvas 에서만 소비된다 — 경계에서 지연 로드해 초기 번들에서 분리.
const GraphCanvas = dynamic(() => import('@/features/ontology/components/GraphCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  ),
});

function ResizeHandle() {
  return (
    <Separator
      className="
        relative w-px bg-border
        before:absolute before:inset-y-0 before:-left-[2px] before:w-[5px] before:content-['']
        [&[data-separator='hover']]:bg-primary/40 [&[data-separator='hover']]:w-[2px]
        [&[data-separator='active']]:bg-primary [&[data-separator='active']]:w-[2px]
        transition-all duration-150
      "
      style={{ cursor: 'col-resize' }}
    />
  );
}

function CollapsedTab({
  side,
  icon: Icon,
  onClick,
}: {
  side: 'left' | 'right';
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center justify-center w-8 h-full
        bg-card hover:bg-muted/60 transition-colors
        ${side === 'left' ? 'border-r border-border' : 'border-l border-border'}
      `}
      title={side === 'left' ? '탐색기 펼치기' : '속성 패널 펼치기'}
    >
      <Icon className="w-4 h-4 text-muted-foreground" />
    </button>
  );
}

const LAYOUT_KEY = 'ontology-studio-layout';

// PRD-PF-C M4: 온톨로지 스튜디오 3패널 셸(무손실 추출). `/`(스튜디오 단독판)와
// `/problems/[id]/studio`(문제 워크플로우의 온톨로지 구축 단계)가 동일하게 렌더한다.
// 로직 변경 없음 — 활성 온톨로지 스코프 주입만 진입점(라우트/스위처)에서 처리.
export default function OntologyStudioShell() {
  const { isLoading, isError } = useLoadOntology();
  // 스키마 로딩이 끝나면(=첫 페인트 가능) 스플래시를 조기 종료해 고정 지연을 없앤다.
  // 에러여도 ready 로 간주 — 스플래시가 아니라 에러 화면이 원인을 보여줘야 한다.
  const splashReady = !isLoading;
  const { showDeleteDialog, requestDelete, confirmDelete, cancelDelete } = useKeyboardShortcuts();
  useApiSync();
  useUrlSelectionSync();

  const [splashDone, setSplashDone] = useState(false);
  const [savedLayout, setSavedLayout] = useState<Layout | undefined>(undefined);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      if (raw) setSavedLayout(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // PRD-BM-D01 (M1-5): 마켓플레이스 "맞춤 생성" → ?start=guided 진입 시 가이드 여정을 연다.
  // 기존 adapt 파이프라인(recognize›adapt›generate)을 그대로 재사용한다.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('start') === 'guided') {
      useOntologyStore.getState().openGuided();
      params.delete('start');
      const qs = params.toString();
      const path = window.location.pathname;
      window.history.replaceState(null, '', qs ? `${path}?${qs}` : path);
    }
  }, []);

  const handleLayoutChanged = useCallback((layout: Layout) => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    } catch { /* ignore */ }
  }, []);

  const explorerRef = usePanelRef();
  const rightPanelRef = usePanelRef();
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // 노드 확장 요청이 올라오면 우측 패널이 접혀 있어도 자동으로 펼쳐, 캔버스
  // 컨텍스트 메뉴 "AI로 확장"의 결과(AI 탭)가 항상 보이게 한다.
  const aiExpandRequest = useOntologyStore((s) => s.aiExpandRequest);
  useEffect(() => {
    if (aiExpandRequest) rightPanelRef.current?.expand();
  }, [aiExpandRequest, rightPanelRef]);

  if (!splashDone) {
    return (
      <SplashScreen
        ready={splashReady}
        onComplete={() => setSplashDone(true)}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">온톨로지 로딩 중...</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <span className="text-sm text-destructive">데이터를 불러오는 중 오류가 발생했습니다</span>
          <span className="text-xs text-muted-foreground">네트워크 연결을 확인하세요</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden bg-background">
      <Group
        orientation="horizontal"
        defaultLayout={savedLayout}
        onLayoutChanged={handleLayoutChanged}
      >
        {/* Left: Explorer Panel */}
        <Panel
          id="explorer"
          panelRef={explorerRef}
          defaultSize="20%"
          minSize="15%"
          maxSize="30%"
          collapsible
          collapsedSize="0%"
          onResize={(size) => {
            const collapsed = size.asPercentage < 1;
            setExplorerCollapsed(collapsed);
          }}
        >
          {explorerCollapsed ? (
            <CollapsedTab
              side="left"
              icon={FolderTree}
              onClick={() => explorerRef.current?.expand()}
            />
          ) : (
            <ExplorerPanel />
          )}
        </Panel>

        <ResizeHandle />

        {/* Center: Toolbar + Canvas + CommitBar */}
        <Panel id="canvas" defaultSize="55%">
          <div className="h-full flex flex-col min-w-0">
            <Toolbar />
            <GraphCanvas />
            <CommitBar />
          </div>
        </Panel>

        <ResizeHandle />

        {/* Right: Property Panel */}
        <Panel
          id="right-panel"
          panelRef={rightPanelRef}
          defaultSize="25%"
          minSize="15%"
          maxSize="35%"
          collapsible
          collapsedSize="0%"
          onResize={(size) => {
            const collapsed = size.asPercentage < 1;
            setRightCollapsed(collapsed);
          }}
        >
          {rightCollapsed ? (
            <CollapsedTab
              side="right"
              icon={PanelRight}
              onClick={() => rightPanelRef.current?.expand()}
            />
          ) : (
            <RightPanel onDeleteRequest={requestDelete} />
          )}
        </Panel>
      </Group>

      {/* Popovers (rendered as overlays) */}
      <NewNodePopover />
      <RelationPopover />
      <HierarchyPopover />
      <DeleteConfirmDialog
        open={showDeleteDialog}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />

      {/* Command Palette (Ctrl+K / Cmd+K) */}
      <CommandPalette />

      {/* PRD-I (M2): 가이드 여정 오버레이 — 캔버스 상태와 무관하게 어디서든 노출 */}
      <GuidedJourney />

      {/* Onboarding Guide (first visit only) */}
      <OnboardingGuide />
    </div>
  );
}
