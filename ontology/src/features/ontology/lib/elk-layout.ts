import type { ELK as ElkApi } from 'elkjs/lib/elk-api';
import type { Node, Edge } from '@xyflow/react';

let elk: ElkApi | null = null;

async function getElk(): Promise<ElkApi> {
  if (elk) return elk;

  if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
    try {
      const ElkConstructor = (await import('elkjs/lib/elk-api')).default;
      elk = new ElkConstructor({ workerUrl: '/elk-worker.min.js' });
      return elk;
    } catch {
      // fallback below
    }
  }

  const ElkBundled = (await import('elkjs/lib/elk.bundled.js')).default;
  elk = new ElkBundled();
  return elk;
}

export function terminateElkWorker() {
  elk?.terminateWorker?.();
  elk = null;
}

const ELK_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.spacing.nodeNode': '80',
  'elk.layered.spacing.nodeNodeBetweenLayers': '100',
  'elk.layered.spacing.edgeNodeBetweenLayers': '40',
  'elk.spacing.componentComponent': '60',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
};

export async function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  if (nodes.length === 0) {
    return { nodes, edges };
  }

  const graph = {
    id: 'root',
    layoutOptions: ELK_OPTIONS,
    children: nodes.map((node) => ({
      id: node.id,
      width: node.measured?.width ?? (node.type === 'instanceNode' ? 56 : 80),
      height: node.measured?.height ?? (node.type === 'instanceNode' ? 56 : 80),
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const elkInstance = await getElk();
  const layoutedGraph = await elkInstance.layout(graph);

  const layoutedNodes = nodes.map((node) => {
    const elkNode = layoutedGraph.children?.find((n) => n.id === node.id);
    if (!elkNode) return node;

    return {
      ...node,
      position: {
        x: elkNode.x ?? 0,
        y: elkNode.y ?? 0,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
