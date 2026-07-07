import type { Gap } from './enrich-types';

// Deterministic gap signals (A-3) — no LLM, fast. Operates on a name-based
// subgraph (freshly-extracted nodes plus any adjacent existing nodes), since the
// preview runs before anything is persisted. Qualitative signals (missing_axiom
// = "빠진 규칙(memo/enforced) 신호" — PRD-L M1 이후에도 내부 라벨은 유지 —,
// low_confidence, selective no_definition) are added by the LLM pass in the route.

export interface DetectNode {
  name: string;
  // Parent/category name (an entity's type), if any.
  type?: string | null;
  description?: string;
  // Verbatim source span — present only for genuinely extracted entities.
  evidence?: string;
  // Property count, for existing nodes included in the subgraph.
  propertyCount?: number;
}

export interface DetectRelation {
  source: string;
  target: string;
  type: string;
  confidence?: number;
}

export interface DetectSubgraph {
  nodes: DetectNode[];
  relations: DetectRelation[];
}

export function detectDeterministicGaps(sg: DetectSubgraph): Gap[] {
  const gaps: Gap[] = [];

  const relCount = new Map<string, number>();
  const referenced = new Set<string>();
  for (const r of sg.relations) {
    relCount.set(r.source, (relCount.get(r.source) ?? 0) + 1);
    relCount.set(r.target, (relCount.get(r.target) ?? 0) + 1);
    referenced.add(r.source);
    referenced.add(r.target);
  }

  const childrenByParent = new Map<string, DetectNode[]>();
  for (const n of sg.nodes) {
    if (n.type) {
      const list = childrenByParent.get(n.type) ?? [];
      list.push(n);
      childrenByParent.set(n.type, list);
    }
  }

  const hasDescription = (n: DetectNode) => !!n.description && n.description.trim().length > 0;

  for (const n of sg.nodes) {
    const rc = relCount.get(n.name) ?? 0;

    // undefined_concept: referenced by a relation but never defined (no evidence,
    // no description). This is the "RF Matcher appears as a target but is undefined" case.
    if (referenced.has(n.name) && !n.evidence && !hasDescription(n)) {
      gaps.push({
        targetName: n.name,
        kind: 'undefined_concept',
        reason: '관계 대상으로 참조되지만 정의가 없습니다.',
        severity: 'high',
      });
      continue;
    }

    // isolated / quasi-isolated: 0~1 relations (PRD "관계 0~1개").
    if (rc <= 1) {
      gaps.push({
        targetName: n.name,
        kind: 'isolated',
        reason: rc === 0 ? '연결된 관계가 없습니다.' : '관계가 1개뿐입니다 (준고립).',
        severity: rc === 0 ? 'med' : 'low',
      });
    }

    // missing_property: siblings (same parent) have properties but this node has none.
    if (n.type) {
      const siblings = (childrenByParent.get(n.type) ?? []).filter((s) => s.name !== n.name);
      const siblingsHaveProps = siblings.some((s) => (s.propertyCount ?? 0) > 0);
      if (siblingsHaveProps && (n.propertyCount ?? 0) === 0) {
        gaps.push({
          targetName: n.name,
          kind: 'missing_property',
          reason: '형제 노드에는 프로퍼티가 있으나 이 노드에는 없습니다.',
          severity: 'med',
        });
      }
    }
  }

  return gaps;
}

const SEVERITY_RANK: Record<Gap['severity'], number> = { high: 0, med: 1, low: 2 };

// Merge deterministic + LLM gaps, drop duplicates (same node + kind), sort by severity.
export function mergeGaps(...lists: Gap[][]): Gap[] {
  const byKey = new Map<string, Gap>();
  for (const list of lists) {
    for (const g of list) {
      const key = `${g.targetName}::${g.kind}`;
      if (!byKey.has(key)) byKey.set(key, g);
    }
  }
  return [...byKey.values()].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
}
