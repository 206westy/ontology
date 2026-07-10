'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import EmptyState from './EmptyState';
import EntityResolutionSheet from './EntityResolutionSheet';
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
  const partitions = useOntologyStore((s) => s.partitions);
  const currentPartitionId = useOntologyStore((s) => s.currentPartitionId);
  const showAllPartitions = useOntologyStore((s) => s.showAllPartitions);
  const toggleShowAllPartitions = useOntologyStore((s) => s.toggleShowAllPartitions);
  // PRD-H H8-c (M2): 패턴 시드 생성 후 머지 미리보기 시트 트리거(store 구동).
  const entityResolutionOpen = useOntologyStore((s) => s.entityResolutionOpen);
  const closeEntityResolution = useOntologyStore((s) => s.closeEntityResolution);

  const {
    setContainer,
    zoomLevel,
    contextMenuTarget,
    setContextMenuTarget,
    relayout,
    cyRef,
  } = useCytoscape();

  const [clearAllOpen, setClearAllOpen] = useState(false);

  // 접근성: 키보드로 노드 순회/선택 + 스크린리더 안내(캔버스 그래프의 a11y 공백 보완).
  // 군집 구분의 비색상 채널은 노드 테두리 패턴(clusterBorder)이 담당한다.
  const [ariaMsg, setAriaMsg] = useState('');
  const kbdIdxRef = useRef(-1);
  const handleCanvasKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const cy = cyRef.current;
      if (!cy || cy.destroyed()) return;
      const nodes = cy.nodes().filter((n) => !n.hasClass('hidden') && !n.hasClass('collapsed'));
      if (nodes.length === 0) return;
      const key = e.key;
      const move = (delta: number) => {
        e.preventDefault();
        const idx = (kbdIdxRef.current + delta + nodes.length) % nodes.length;
        kbdIdxRef.current = idx;
        const node = nodes[idx];
        cy.animate({ center: { eles: node }, duration: 200 });
        const name = node.data('label') ?? '노드';
        const kind = node.data('kind') === 'instance' ? '인스턴스' : '클래스';
        setAriaMsg(`${name}, ${kind} (${idx + 1}/${nodes.length})`);
      };
      if (key === 'ArrowRight' || key === 'ArrowDown') move(1);
      else if (key === 'ArrowLeft' || key === 'ArrowUp') move(-1);
      else if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        const node = nodes[kbdIdxRef.current] ?? nodes[0];
        useOntologyStore.getState().selectNode(node.id(), node.data('kind') === 'instance' ? 'instance' : 'class');
        setAriaMsg(`${node.data('label') ?? '노드'} 선택됨`);
      } else if (key === 'Escape') {
        useOntologyStore.getState().clearSelection();
        setAriaMsg('선택 해제됨');
      }
    },
    [cyRef],
  );

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

  // 현재 워크스페이스(구획)만 비어있는지 판정 — 전체 그래프엔 노드가 있으나
  // 지금 보는 구획엔 없어 캔버스가 텅 빈 경우("여기가 비었나/고장났나" 혼란 방지).
  // 인스턴스는 부모 클래스의 구획을 상속하므로 classId→class.partition 으로 판정한다.
  // PRD-Perf M1-5: 셀렉터 다수 구독으로 자주 리렌더되는 컴포넌트 — 매 렌더
  // Map/scan 재생성 대신 입력이 바뀔 때만 재계산한다.
  const { workspaceEmpty, currentWorkspaceName } = useMemo(() => {
    const classPartition = new Map(classes.map((c) => [c.id, c.partitionId]));
    const inWorkspace = (pid?: string) =>
      showAllPartitions || !pid || pid === currentPartitionId;
    return {
      workspaceEmpty:
        !showAllPartitions &&
        !classes.some((c) => inWorkspace(c.partitionId)) &&
        !instances.some((i) => inWorkspace(classPartition.get(i.classId))),
      currentWorkspaceName:
        partitions.find((p) => p.id === currentPartitionId)?.name ?? '현재 워크스페이스',
    };
  }, [classes, instances, partitions, currentPartitionId, showAllPartitions]);

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
        className="w-full h-full outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset"
        role="application"
        tabIndex={0}
        aria-label="온톨로지 그래프. 방향키로 노드 이동, Enter로 선택, Esc로 해제."
        onKeyDown={handleCanvasKeyDown}
        style={{
          backgroundColor: 'hsl(var(--background))',
          backgroundImage: 'radial-gradient(hsl(var(--border)) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      {/* 스크린리더 안내(시각적으로 숨김) — 키보드 노드 순회/선택 상태 알림 */}
      <div className="sr-only" aria-live="polite" role="status">
        {ariaMsg}
      </div>

      {/* 현재 워크스페이스만 비었을 때 안내 오버레이(전체 그래프엔 노드 존재) */}
      {workspaceEmpty && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto max-w-sm rounded-xl border border-border bg-card/95 backdrop-blur-sm shadow-elevation-2 px-5 py-4 text-center space-y-2">
            <p className="text-sm font-semibold text-foreground">
              &ldquo;{currentWorkspaceName}&rdquo; 워크스페이스는 비어 있습니다
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              다른 워크스페이스에는 데이터가 있습니다. 노드를 추가하거나 전체 구획을 보세요.
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                className="text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                onClick={() =>
                  openPopover({
                    type: 'newNode',
                    position: {
                      x: window.innerWidth / 2,
                      y: window.innerHeight / 2,
                    },
                  })
                }
              >
                새 노드 만들기
              </button>
              <button
                type="button"
                className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-muted transition-colors"
                onClick={() => toggleShowAllPartitions(true)}
              >
                전체 구획 보기
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* H8-c: 머지 미리보기(기존 EntityResolutionSheet 재사용) — 자동 병합 없음 */}
      <EntityResolutionSheet
        open={entityResolutionOpen}
        onOpenChange={(o) => { if (!o) closeEntityResolution(); }}
      />

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
