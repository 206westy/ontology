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
  addEdge,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ClassNode from './ClassNode';
import EmptyState from './EmptyState';
import InstanceNode from './InstanceNode';
import { NODE_COLORS, NODE_COLORS_DARK } from '../constants/colors';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { useTheme } from 'next-themes';
import { getLayoutedElements } from '../lib/elk-layout';
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
  const classNodes: Node[] = classes.map((cls) => {
    const count = instanceCountMap.get(cls.id) ?? 0;
    return {
      id: cls.id,
      type: 'classNode',
      position: { x: cls.positionX, y: cls.positionY },
      data: {
        label: cls.name,
        count,
        colorKey: getColorKey(cls.color),
        isEmpty: count === 0 && !classes.some((c) => c.parentId === cls.id),
        isFocused: highlightedNodeId === cls.id,
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
  const isAEdges: Edge[] = classes
    .filter((cls) => cls.parentId)
    .map((cls) => ({
      id: `isa-${cls.id}`,
      source: cls.parentId!,
      target: cls.id,
      type: 'smoothstep',
      style: {
        stroke: selectedNodeId && (selectedNodeId === cls.parentId || selectedNodeId === cls.id)
          ? 'hsl(var(--primary))'
          : 'hsl(var(--border))',
        strokeWidth: selectedNodeId && (selectedNodeId === cls.parentId || selectedNodeId === cls.id)
          ? 2
          : 1.4,
      },
      animated: false,
    }));

  const instanceEdges: Edge[] = instances.map((inst) => ({
    id: `inst-${inst.id}`,
    source: inst.classId,
    target: inst.id,
    type: 'smoothstep',
    style: {
      stroke: selectedNodeId && (selectedNodeId === inst.classId || selectedNodeId === inst.id)
        ? 'hsl(var(--primary))'
        : 'hsl(var(--border))',
      strokeWidth: 1.2,
      strokeDasharray: '5 5',
    },
    animated: false,
  }));

  const relEdges: Edge[] = ontologyEdges.map((edge) => {
    const relType = relationTypes.find((r) => r.id === edge.relationTypeId);
    const isConnected = selectedNodeId && (selectedNodeId === edge.sourceId || selectedNodeId === edge.targetId);
    return {
      id: edge.id,
      source: edge.sourceId,
      target: edge.targetId,
      type: 'smoothstep',
      label: relType?.name ?? '',
      labelStyle: { fontFamily: 'var(--font-jetbrains)', fontSize: 9.5, fill: 'hsl(var(--muted-foreground))' },
      style: {
        stroke: isConnected ? 'hsl(var(--primary))' : 'hsl(var(--border))',
        strokeWidth: isConnected ? 2 : 1.4,
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

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

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
    <div className="flex-1 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={onPaneClick}
        onDoubleClick={onDoubleClick}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        panOnDrag={toolMode === 'pan'}
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

      {/* Hint bar */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3 px-3 py-1.5 rounded-full bg-card/80 backdrop-blur-sm border border-border text-[10px] text-muted-foreground">
        <span><kbd className="font-mono bg-muted px-1 rounded">더블클릭</kbd> 새 노드</span>
        <span className="text-border">·</span>
        <span><kbd className="font-mono bg-muted px-1 rounded">드래그</kbd> 관계 연결</span>
      </div>

      {/* Zoom control */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-card/80 backdrop-blur-sm border border-border rounded-lg px-1 py-0.5">
        <button
          className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground text-xs"
          onClick={() => zoomOut()}
        >
          -
        </button>
        <span className="text-[10px] font-mono text-muted-foreground w-8 text-center">
          {zoomLevel}%
        </span>
        <button
          className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground text-xs"
          onClick={() => zoomIn()}
        >
          +
        </button>
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
