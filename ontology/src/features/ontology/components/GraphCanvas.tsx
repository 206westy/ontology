'use client';

import { useCallback, useState } from 'react';
import EmptyState from './EmptyState';
import GraphContextMenu, { type ContextMenuPosition } from './GraphContextMenu';
import FocusModeBar from './FocusModeBar';
import GraphLegend from './GraphLegend';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { NODE_COLORS } from '../constants/colors';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { useCytoscape } from '../hooks/useCytoscape';
import type { NodeColorKey } from '../lib/types';

export default function GraphCanvas() {
  const classes = useOntologyStore((s) => s.classes);
  const instances = useOntologyStore((s) => s.instances);
  const openPopover = useOntologyStore((s) => s.openPopover);
  const updateClass = useOntologyStore((s) => s.updateClass);

  const {
    setContainer,
    zoomLevel,
    contextMenuTarget,
    setContextMenuTarget,
    relayout,
    cyRef,
  } = useCytoscape();

  const [clearAllOpen, setClearAllOpen] = useState(false);

  const onEmptyDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      openPopover({ type: 'newNode', position: { x: event.clientX, y: event.clientY } });
    },
    [openPopover],
  );

  // ── 컨텍스트 메뉴 콜백 (기존 시그니처 유지) ──
  const handleContextClose = useCallback(() => setContextMenuTarget(null), [setContextMenuTarget]);
  const handleContextNewClass = useCallback((position: ContextMenuPosition) => openPopover({ type: 'newNode', position }), [openPopover]);
  const handleContextLayoutGraph = useCallback(() => relayout(), [relayout]);
  const handleContextFitView = useCallback(() => cyRef.current?.fit(undefined, 40), [cyRef]);
  const handleContextChangeColor = useCallback(
    (nodeId: string, color: NodeColorKey) => updateClass(nodeId, { color: NODE_COLORS[color] }),
    [updateClass],
  );
  const handleContextFocusMode = useCallback((nodeId: string) => useOntologyStore.getState().enterFocusMode(nodeId), []);
  const handleContextExpandNode = useCallback((nodeId: string) => useOntologyStore.getState().requestNodeExpansion(nodeId), []);
  const handleContextDeleteNode = useCallback((nodeId: string) => {
    const store = useOntologyStore.getState();
    const isClass = store.classes.some((c) => c.id === nodeId);
    store.deleteNodeById(nodeId, isClass ? 'class' : 'instance');
  }, []);
  const handleContextDeleteEdge = useCallback((edgeId: string) => useOntologyStore.getState().removeEdge(edgeId), []);
  const handleContextClearAll = useCallback(() => setClearAllOpen(true), []);
  const handleClearAllConfirm = useCallback(() => {
    useOntologyStore.getState().clearOntology();
    setClearAllOpen(false);
  }, []);

  const isEmpty = classes.length === 0 && instances.length === 0;
  if (isEmpty) {
    return <EmptyState onDoubleClick={onEmptyDoubleClick} />;
  }

  return (
    <div className="flex-1 relative" data-testid="graph-canvas">
      {/* Cytoscape 캔버스 — Cytoscape가 컨테이너 position을 relative로 덮어쓰므로
          absolute inset-0 대신 w-full h-full로 크기 지정(부모 flex-1 높이에 맞춤). */}
      <div
        ref={setContainer}
        className="w-full h-full"
        style={{
          backgroundColor: 'hsl(var(--background))',
          backgroundImage: 'radial-gradient(hsl(var(--border)) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      {/* 범례 (PRD §7) — 좌하단 고정 */}
      <GraphLegend />

      {/* Focus mode bar (P1-4) */}
      <FocusModeBar />

      {/* Context menu */}
      <GraphContextMenu
        target={contextMenuTarget}
        onClose={handleContextClose}
        onNewClass={handleContextNewClass}
        onLayoutGraph={handleContextLayoutGraph}
        onFitView={handleContextFitView}
        onChangeColor={handleContextChangeColor}
        onExpandNode={handleContextExpandNode}
        onFocusMode={handleContextFocusMode}
        onDeleteNode={handleContextDeleteNode}
        onDeleteEdge={handleContextDeleteEdge}
        onClearAll={handleContextClearAll}
      />

      {/* Clear all confirmation */}
      <AlertDialog open={clearAllOpen} onOpenChange={(o) => { if (!o) setClearAllOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>전체 초기화</AlertDialogTitle>
            <AlertDialogDescription>
              모든 클래스({classes.length}개), 인스턴스({instances.length}개), 관계를 삭제하시겠습니까?
              <br />
              이 작업은 Ctrl+Z로 되돌릴 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setClearAllOpen(false)}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearAllConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              전체 삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hint bar + zoom indicator */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3 px-3 py-1.5 rounded-full bg-card/80 backdrop-blur-sm border border-border shadow-elevation-1 text-caption text-muted-foreground z-10">
        <span><kbd className="font-mono bg-muted px-1 rounded">더블클릭</kbd> 새 노드</span>
        <span className="text-border">·</span>
        <span><kbd className="font-mono bg-muted px-1 rounded">편집 모드</kbd> 드래그로 관계 연결</span>
        <span className="text-border">·</span>
        <span className="font-mono w-10 text-center">{zoomLevel}%</span>
      </div>
    </div>
  );
}
