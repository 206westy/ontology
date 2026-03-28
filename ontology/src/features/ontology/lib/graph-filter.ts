import type { Node, Edge } from '@xyflow/react';

/**
 * Get the N-hop neighborhood of a node.
 * Returns the set of node IDs within N hops (including the origin).
 */
export function getNHopNeighborIds(
  originId: string,
  depth: number,
  edges: Edge[],
): Set<string> {
  const neighborIds = new Set<string>([originId]);
  let frontier = new Set<string>([originId]);

  for (let hop = 0; hop < depth; hop++) {
    const nextFrontier = new Set<string>();
    for (const edge of edges) {
      if (frontier.has(edge.source) && !neighborIds.has(edge.target)) {
        nextFrontier.add(edge.target);
        neighborIds.add(edge.target);
      }
      if (frontier.has(edge.target) && !neighborIds.has(edge.source)) {
        nextFrontier.add(edge.source);
        neighborIds.add(edge.source);
      }
    }
    frontier = nextFrontier;
    if (frontier.size === 0) break;
  }

  return neighborIds;
}

/**
 * Apply type + color filters to nodes.
 */
/**
 * Check if any filter is active (not at default state).
 */
export function hasActiveFilter(options: {
  showClasses: boolean;
  showInstances: boolean;
  colorFilter: string[];
}): boolean {
  return !options.showClasses || !options.showInstances || options.colorFilter.length > 0;
}

export function applyNodeFilters(
  nodes: Node[],
  options: {
    showClasses: boolean;
    showInstances: boolean;
    colorFilter: string[];
  },
): Node[] {
  return nodes.filter((node) => {
    if (!options.showClasses && node.type === 'classNode') return false;
    if (!options.showInstances && node.type === 'instanceNode') return false;

    if (options.colorFilter.length > 0) {
      const colorKey = (node.data as { colorKey?: string }).colorKey;
      if (colorKey && !options.colorFilter.includes(colorKey)) return false;
    }

    return true;
  });
}
