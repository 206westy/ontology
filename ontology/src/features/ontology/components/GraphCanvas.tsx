'use client';

import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type OnConnect,
  type Connection,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ClassNode from './ClassNode';
import EmptyState from './EmptyState';
import InstanceNode from './InstanceNode';
import GraphContextMenu, { type ContextMenuTarget, type ContextMenuPosition } from './GraphContextMenu';
import FocusModeBar from './FocusModeBar';
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
import { NODE_COLORS, NODE_COLORS_DARK } from '../constants/colors';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { useTheme } from 'next-themes';
import { getLayoutedElements, terminateElkWorker } from '../lib/elk-layout';
import { getNHopNeighborIds } from '../lib/graph-filter';
import type { OntologyClass, OntologyInstance, OntologyEdge, NodeColorKey } from '../lib/types';

const nodeTypes = {
  classNode: ClassNode,
  instanceNode: InstanceNode,
};

function getColorKey(color: string): keyof typeof NODE_COLORS {
  const entries = Object.entries(NODE_COLORS) as [keyof typeof NODE_COLORS, string][];
  const match = entries.find(([, v]) => v === color);
  return match?.[0] ?? 'root';
}

function buildFlowNodes(
  classes: OntologyClass[],
  instances: OntologyInstance[],
  instanceCountMap: Map<string, number>,
  highlightedNodeId: string | null,
): Node[] {
  const childClassIds = new Set(classes.filter((c) => c.parentId).map((c) => c.parentId!));

  const classNodes: Node[] = classes.map((cls) => {
    const count = instanceCountMap.get(cls.id) ?? 0;
    const hasChildren = childClassIds.has(cls.id);
    const isRoot = cls.parentId === null;
    const nodeRole: 'root' | 'mid' | 'leaf' = isRoot && hasChildren
      ? 'root'
      : hasChildren
        ? 'mid'
        : 'leaf';

    return {
      id: cls.id,
      type: 'classNode',
      position: { x: cls.positionX, y: cls.positionY },
      data: {
        label: cls.name,
        count,
        colorKey: getColorKey(cls.color),
        isEmpty: count === 0 && !hasChildren,
        isFocused: highlightedNodeId === cls.id,
        nodeRole,
      },
    };
  });

  const instanceNodes: Node[] = instances.map((inst) => {
    const parentClass = classes.find((c) => c.id === inst.classId);
    return {
      id: inst.id,
      type: 'instanceNode',
      position: { x: 0, y: 0 },
      data: {
        label: inst.name,
        colorKey: parentClass ? getColorKey(parentClass.color) : 'instance',
        isFocused: highlightedNodeId === inst.id,
      },
    };
  });

  return [...classNodes, ...instanceNodes];
}

function buildFlowEdges(
  classes: OntologyClass[],
  instances: OntologyInstance[],
  ontologyEdges: OntologyEdge[],
  relationTypes: { id: string; name: string }[],
  selectedNodeId: string | null,
): Edge[] {
  // v4: is-a edges (inheritance) -- solid 2px + filled triangle marker
  const isAEdges: Edge[] = classes
    .filter((cls) => cls.parentId)
    .map((cls) => {
      const isConnected = selectedNodeId && (selectedNodeId === cls.parentId || selectedNodeId === cls.id);
      return {
        id: `isa-${cls.id}`,
        source: cls.parentId!,
        target: cls.id,
        type: 'smoothstep',
        markerEnd: {
          type: 'arrowclosed' as const,
          color: isConnected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
          width: 18,
          height: 14,
        },
        style: {
          stroke: isConnected
            ? 'hsl(var(--primary))'
            : 'hsl(var(--muted-foreground))',
          strokeWidth: isConnected ? 2.5 : 2,
        },
        animated: false,
      };
    });

  // v4: instance-of edges -- dotted 1px + open triangle marker
  const instanceEdges: Edge[] = instances.map((inst) => {
    const isConnected = selectedNodeId && (selectedNodeId === inst.classId || selectedNodeId === inst.id);
    return {
      id: `inst-${inst.id}`,
      source: inst.classId,
      target: inst.id,
      type: 'smoothstep',
      markerEnd: {
        type: 'arrow' as const,
        color: isConnected ? 'hsl(var(--primary))' : 'hsl(var(--border))',
        width: 14,
        height: 10,
      },
      style: {
        stroke: isConnected
          ? 'hsl(var(--primary))'
          : 'hsl(var(--border))',
        strokeWidth: isConnected ? 1.5 : 1,
        strokeDasharray: '3 3',
      },
      animated: false,
    };
  });

  // v4: has-a edges (property/composition) -- detected by checking if relation name
  // contains property-like semantics. For now, all ontologyEdges are relation edges.
  // has-a pattern can be identified by relation type name containing "has"/"포함"/"속성"
  const hasAPatterns = ['has', '포함', '속성', 'contains', 'owns'];

  const relEdges: Edge[] = ontologyEdges.map((edge) => {
    const relType = relationTypes.find((r) => r.id === edge.relationTypeId);
    const relName = (relType?.name ?? '').toLowerCase();
    const isHasA = hasAPatterns.some((p) => relName.includes(p));
    const isConnected = selectedNodeId && (selectedNodeId === edge.sourceId || selectedNodeId === edge.targetId);

    if (isHasA) {
      // v4: has-a edges -- dashed 1.5px + diamond marker
      return {
        id: edge.id,
        source: edge.sourceId,
        target: edge.targetId,
        type: 'smoothstep',
        label: relType?.name ?? '',
        labelStyle: {
          fontFamily: 'var(--font-sans)',
          fontSize: 11,
          fill: 'hsl(var(--foreground))',
          fontWeight: 500,
        },
        labelBgStyle: {
          fill: 'hsl(var(--card))',
          stroke: 'hsl(var(--border))',
          strokeWidth: 1,
          rx: 8,
          ry: 8,
        },
        labelBgPadding: [6, 4] as [number, number],
        labelShowBg: true,
        markerEnd: {
          type: 'arrowclosed' as const,
          color: isConnected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
          width: 12,
          height: 12,
        },
        style: {
          stroke: isConnected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
          strokeWidth: isConnected ? 2 : 1.5,
          strokeDasharray: '6 3',
        },
        animated: false,
      };
    }

    // v4: relation edges -- solid 1.5px + arrow marker
    return {
      id: edge.id,
      source: edge.sourceId,
      target: edge.targetId,
      type: 'smoothstep',
      label: relType?.name ?? '',
      labelStyle: {
        fontFamily: 'var(--font-sans)',
        fontSize: 11,
        fill: 'hsl(var(--foreground))',
        fontWeight: 500,
      },
      labelBgStyle: {
        fill: 'hsl(var(--card))',
        stroke: 'hsl(var(--border))',
        strokeWidth: 1,
        rx: 8,
        ry: 8,
      },
      labelBgPadding: [6, 4] as [number, number],
      labelShowBg: true,
      markerEnd: {
        type: 'arrowclosed' as const,
        color: isConnected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
        width: 14,
        height: 10,
      },
      style: {
        stroke: isConnected ? 'hsl(var(--primary))' : 'hsl(var(--border))',
        strokeWidth: isConnected ? 2 : 1.5,
      },
      animated: false,
    };
  });

  return [...isAEdges, ...instanceEdges, ...relEdges];
}

function GraphCanvasInner() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const classes = useOntologyStore((s) => s.classes);
  const instances = useOntologyStore((s) => s.instances);
  const ontologyEdges = useOntologyStore((s) => s.edges);
  const relationTypes = useOntologyStore((s) => s.relationTypes);
  const selectedNodeId = useOntologyStore((s) => s.selectedNodeId);
  const focusNodeId = useOntologyStore((s) => s.focusNodeId);
  const clearFocus = useOntologyStore((s) => s.clearFocus);
  const openPopover = useOntologyStore((s) => s.openPopover);
  const updateClass = useOntologyStore((s) => s.updateClass);
  const clearSelection = useOntologyStore((s) => s.clearSelection);
  const toolMode = useOntologyStore((s) => s.toolMode);
  const zoomAction = useOntologyStore((s) => s.zoomAction);
  const clearZoomAction = useOntologyStore((s) => s.clearZoomAction);

  // Filter state (P1-4)
  const showClasses = useOntologyStore((s) => s.showClasses);
  const showInstances = useOntologyStore((s) => s.showInstances);
  const colorFilter = useOntologyStore((s) => s.colorFilter);
  const focusModeNodeId = useOntologyStore((s) => s.focusModeNodeId);
  const focusDepth = useOntologyStore((s) => s.focusDepth);

  const { fitView } = useReactFlow();
  const layoutApplied = useRef(false);
  const prevNodeCount = useRef(0);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const instanceCountMap = useMemo(() => {
    const map = new Map<string, number>();
    instances.forEach((inst) => {
      map.set(inst.classId, (map.get(inst.classId) ?? 0) + 1);
    });
    return map;
  }, [instances]);

  const flowNodes = useMemo(
    () => buildFlowNodes(classes, instances, instanceCountMap, highlightedNodeId),
    [classes, instances, instanceCountMap, highlightedNodeId],
  );

  const flowEdges = useMemo(
    () => buildFlowEdges(classes, instances, ontologyEdges, relationTypes, selectedNodeId),
    [classes, instances, ontologyEdges, relationTypes, selectedNodeId],
  );

  // Apply filters (P1-4)
  const filteredNodes = useMemo(() => {
    let result = flowNodes;

    // Type filter
    if (!showClasses) result = result.filter((n) => n.type !== 'classNode');
    if (!showInstances) result = result.filter((n) => n.type !== 'instanceNode');

    // Color filter
    if (colorFilter.length > 0) {
      result = result.filter((n) => {
        const colorKey = (n.data as { colorKey?: string }).colorKey;
        return !colorKey || colorFilter.includes(colorKey);
      });
    }

    // Focus mode: dim non-neighbors
    if (focusModeNodeId) {
      const neighborIds = getNHopNeighborIds(focusModeNodeId, focusDepth, flowEdges);
      result = result.map((n) => ({
        ...n,
        style: {
          ...n.style,
          opacity: neighborIds.has(n.id) ? 1 : 0.15,
          transition: 'opacity 250ms ease-in-out',
        },
      }));
    }

    return result;
  }, [flowNodes, flowEdges, showClasses, showInstances, colorFilter, focusModeNodeId, focusDepth]);

  const filteredEdges = useMemo(() => {
    if (!focusModeNodeId) return flowEdges;
    const neighborIds = getNHopNeighborIds(focusModeNodeId, focusDepth, flowEdges);
    return flowEdges.map((e) => ({
      ...e,
      style: {
        ...e.style,
        opacity: neighborIds.has(e.source) && neighborIds.has(e.target) ? 1 : 0.08,
        transition: 'opacity 250ms ease-in-out',
      },
    }));
  }, [flowEdges, focusModeNodeId, focusDepth]);

  const [nodes, setNodes, onNodesChange] = useNodesState(filteredNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(filteredEdges);

  useEffect(() => {
    setEdges(flowEdges);
  }, [flowEdges, setEdges]);

  // Sync Zustand selectedNodeId → React Flow node `selected` prop
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        selected: n.id === selectedNodeId,
      })),
    );
  }, [selectedNodeId, setNodes]);

  useEffect(() => {
    if (flowNodes.length === 0) {
      setNodes([]);
      return;
    }

    const allAtOrigin = flowNodes.every((n) => n.position.x === 0 && n.position.y === 0);
    const nodeCountChanged = flowNodes.length !== prevNodeCount.current;
    prevNodeCount.current = flowNodes.length;

    if (allAtOrigin || !layoutApplied.current || nodeCountChanged) {
      getLayoutedElements(flowNodes, flowEdges)
        .then(({ nodes: layouted }) => {
          setNodes(layouted);
          layoutApplied.current = true;
          setTimeout(() => fitView({ padding: 0.3 }), 50);
        })
        .catch(() => {
          setNodes(flowNodes);
          setTimeout(() => fitView({ padding: 0.3 }), 50);
        });
    } else {
      setNodes(flowNodes);
    }
  }, [flowNodes, flowEdges, setNodes, fitView]);

  useEffect(() => {
    if (!focusNodeId) return;
    const targetNode = nodes.find((n) => n.id === focusNodeId);
    if (targetNode) {
      fitView({ nodes: [targetNode], padding: 0.5, duration: 300 });
    }

    // Highlight ring pulse for 1.5s
    setHighlightedNodeId(focusNodeId);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedNodeId(null);
      highlightTimerRef.current = null;
    }, 1500);

    clearFocus();
  }, [focusNodeId, nodes, fitView, clearFocus]);

  // Terminate ELK worker on unmount
  useEffect(() => {
    return () => {
      terminateElkWorker();
    };
  }, []);

  const onConnect: OnConnect = useCallback(
    (params: Connection) => {
      if (params.source && params.target && params.source !== params.target) {
        openPopover({
          type: 'relation',
          position: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
          sourceId: params.source,
          targetId: params.target,
        });
      }
    },
    [openPopover],
  );

  // Used by EmptyState (plain div, not ReactFlow)
  const onDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('.react-flow__node')) return;

      const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
      openPopover({
        type: 'newNode',
        position: {
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        },
      });
    },
    [openPopover],
  );

  // Used by wrapper div around ReactFlow
  const onPaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('.react-flow__node')) return;

      const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
      openPopover({
        type: 'newNode',
        position: {
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        },
      });
    },
    [openPopover],
  );

  const onPaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  // Node drop on node → hierarchy popover + persist position
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, draggedNode: Node) => {
      // Persist position to store
      if (draggedNode.type === 'classNode') {
        updateClass(draggedNode.id, {
          positionX: draggedNode.position.x,
          positionY: draggedNode.position.y,
        });
      }

      if (draggedNode.type !== 'classNode') return;

      // Check if the dragged node overlaps with another class node
      const currentNodes = nodes;
      for (const targetNode of currentNodes) {
        if (targetNode.id === draggedNode.id) continue;
        if (targetNode.type !== 'classNode') continue;

        // Skip if already a child of target
        const sourceClass = classes.find((c) => c.id === draggedNode.id);
        if (sourceClass?.parentId === targetNode.id) continue;

        // Skip if edge already exists between these nodes
        const existingEdge = ontologyEdges.some(
          (e) =>
            (e.sourceId === draggedNode.id && e.targetId === targetNode.id) ||
            (e.sourceId === targetNode.id && e.targetId === draggedNode.id),
        );
        if (existingEdge) continue;

        const dx = Math.abs(draggedNode.position.x - targetNode.position.x);
        const dy = Math.abs(draggedNode.position.y - targetNode.position.y);

        // If nodes overlap within 60px proximity
        if (dx < 60 && dy < 60) {
          openPopover({
            type: 'hierarchy',
            position: { x: window.innerWidth / 2, y: window.innerHeight / 3 },
            sourceId: draggedNode.id,
            targetId: targetNode.id,
          });
          break;
        }
      }
    },
    [nodes, classes, ontologyEdges, openPopover, updateClass],
  );

  const [contextMenuTarget, setContextMenuTarget] = useState<ContextMenuTarget | null>(null);

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      const nodeType = node.type === 'classNode' ? 'class' : 'instance';
      const selectNode = useOntologyStore.getState().selectNode;
      selectNode(node.id, nodeType === 'class' ? 'class' : 'instance');
      setContextMenuTarget({
        type: nodeType,
        nodeId: node.id,
        nodeName: (node.data as { label?: string }).label ?? '',
        position: { x: event.clientX, y: event.clientY },
      });
    },
    [],
  );

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      setContextMenuTarget({
        type: 'pane',
        position: { x: event.clientX, y: event.clientY },
      });
    },
    [],
  );

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setContextMenuTarget({
        type: 'edge',
        edgeId: edge.id,
        edgeLabel: typeof edge.label === 'string' ? edge.label : '',
        position: { x: event.clientX, y: event.clientY },
      });
    },
    [],
  );

  const handleContextMenuClose = useCallback(() => {
    setContextMenuTarget(null);
  }, []);

  const handleContextNewClass = useCallback(
    (position: ContextMenuPosition) => {
      openPopover({ type: 'newNode', position });
    },
    [openPopover],
  );

  const handleContextFitView = useCallback(() => {
    fitView({ padding: 0.3 });
  }, [fitView]);

  const handleContextLayoutGraph = useCallback(() => {
    getLayoutedElements(nodes, edges).then(({ nodes: layouted }) => {
      setNodes(layouted);
      setTimeout(() => fitView({ padding: 0.3 }), 50);
    });
  }, [nodes, edges, setNodes, fitView]);

  const handleContextDeleteNode = useCallback(
    (nodeId: string) => {
      const store = useOntologyStore.getState();
      const isClass = store.classes.some((c) => c.id === nodeId);
      store.deleteNodeById(nodeId, isClass ? 'class' : 'instance');
    },
    [],
  );

  const handleContextChangeColor = useCallback(
    (nodeId: string, color: NodeColorKey) => {
      const colorHex = NODE_COLORS[color];
      updateClass(nodeId, { color: colorHex });
    },
    [updateClass],
  );

  const handleContextFocusMode = useCallback(
    (nodeId: string) => {
      const store = useOntologyStore.getState();
      store.enterFocusMode(nodeId);
    },
    [],
  );

  const handleContextDeleteEdge = useCallback(
    (edgeId: string) => {
      const store = useOntologyStore.getState();
      store.removeEdge(edgeId);
    },
    [],
  );

  const [clearAllOpen, setClearAllOpen] = useState(false);

  const handleContextClearAll = useCallback(() => {
    setClearAllOpen(true);
  }, []);

  const handleClearAllConfirm = useCallback(() => {
    useOntologyStore.getState().clearOntology();
    setClearAllOpen(false);
  }, []);

  const [zoomLevel, setZoomLevel] = useState(100);
  const { zoomIn, zoomOut, getZoom } = useReactFlow();

  // Handle zoom actions triggered from Toolbar
  useEffect(() => {
    if (!zoomAction) return;
    if (zoomAction === 'in') zoomIn();
    else if (zoomAction === 'out') zoomOut();
    else if (zoomAction === 'fit') fitView({ padding: 0.3 });
    clearZoomAction();
  }, [zoomAction, zoomIn, zoomOut, fitView, clearZoomAction]);

  const isEmpty = classes.length === 0 && instances.length === 0;

  if (isEmpty) {
    return <EmptyState onDoubleClick={onDoubleClick} />;
  }

  return (
    <div className="flex-1 relative" data-testid="graph-canvas" onDoubleClick={onPaneDoubleClick}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={onPaneClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        connectionMode="loose"
        zoomOnDoubleClick={false}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        panOnDrag={toolMode === 'pan' ? [0, 1] : [1]}
        selectionOnDrag={toolMode === 'select'}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        defaultEdgeOptions={{
          style: { stroke: 'hsl(var(--border))', strokeWidth: 1.4 },
          animated: false,
        }}
        proOptions={{ hideAttribution: true }}
        onMoveEnd={() => setZoomLevel(Math.round(getZoom() * 100))}
        connectionLineStyle={{ stroke: 'hsl(var(--primary))', strokeWidth: 1.5, strokeDasharray: '5 5' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="hsl(var(--border))"
          style={{ backgroundColor: 'hsl(var(--background))' }}
        />
        <Controls
          showInteractive={false}
          className="!rounded-lg !border !border-border !shadow-card !bg-card"
        />
        <MiniMap
          nodeColor={(node) => {
            const colorKey = (node.data as { colorKey?: string }).colorKey as keyof typeof NODE_COLORS | undefined;
            const palette = isDark ? NODE_COLORS_DARK : NODE_COLORS;
            return colorKey ? palette[colorKey] : palette.root;
          }}
          maskColor={isDark ? 'hsl(0 0% 0% / 0.40)' : 'hsl(0 0% 0% / 0.08)'}

          className="!rounded-lg !border !border-border"
          pannable
          zoomable
        />
      </ReactFlow>

      {/* Focus mode bar (P1-4) */}
      <FocusModeBar />

      {/* Context menu (positioned at click location) */}
      <GraphContextMenu
        target={contextMenuTarget}
        onClose={handleContextMenuClose}
        onNewClass={handleContextNewClass}
        onLayoutGraph={handleContextLayoutGraph}
        onFitView={handleContextFitView}
        onChangeColor={handleContextChangeColor}
        onFocusMode={handleContextFocusMode}
        onDeleteNode={handleContextDeleteNode}
        onDeleteEdge={handleContextDeleteEdge}
        onClearAll={handleContextClearAll}
      />

      {/* Clear all confirmation dialog */}
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

      {/* v3: Unified hint bar + zoom control */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3 px-3 py-1.5 rounded-full bg-card/80 backdrop-blur-sm border border-border shadow-elevation-1 text-caption text-muted-foreground">
        <span><kbd className="font-mono bg-muted px-1 rounded">더블클릭</kbd> 새 노드</span>
        <span className="text-border">·</span>
        <span><kbd className="font-mono bg-muted px-1 rounded">드래그</kbd> 관계 연결</span>
        <span className="text-border">·</span>
        <span className="flex items-center gap-1">
          <button
            className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors"
            onClick={() => zoomOut()}
          >
            -
          </button>
          <span className="font-mono w-8 text-center">
            {zoomLevel}%
          </span>
          <button
            className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors"
            onClick={() => zoomIn()}
          >
            +
          </button>
        </span>
      </div>
    </div>
  );
}

export default function GraphCanvas() {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner />
    </ReactFlowProvider>
  );
}
