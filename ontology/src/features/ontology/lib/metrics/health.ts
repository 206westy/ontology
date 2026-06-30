// S0 — Ontology health metrics. Pure, deterministic functions that quantify
// the structural quality of an ontology snapshot so "성능 개선" can be measured
// (별모양 지수 / 고립률 / provenance 커버리지 / 중복 후보율) and tracked over time.
//
// Intentionally framework-free and decoupled: accepts a structural subset of the
// real store arrays (OntologyClass / OntologyInstance / OntologyEdge all satisfy
// these shapes), so the store can pass its arrays directly and tests can use
// minimal literals.

import { findSimilarPairs, type NamedEntity } from '../similarity';

export interface MetricNode {
  id: string;
  name: string;
  // Provenance source tag (A-4). Empty/absent means "no provenance".
  sourceType?: string | null;
}

export interface MetricEdge {
  sourceId: string;
  targetId: string;
  sourceType?: string | null;
}

export interface MetricsModel {
  classes: MetricNode[];
  instances: MetricNode[];
  edges: MetricEdge[];
}

export interface HealthReport {
  // 0..100, higher is healthier. Aggregate of the four axes below.
  score: number;

  nodeCount: number;
  edgeCount: number;

  // 별모양 지수: degree of the single most-connected node / edge count. 0..1,
  // higher = more star-shaped (one hub absorbing everything). Worse when high.
  starIndex: number;
  hubNodeId: string | null;
  hubDegree: number;

  // 고립률: fraction of nodes with ≤1 incident edge. 0..1, worse when high.
  isolationRate: number;
  isolatedCount: number;

  // provenance 커버리지: fraction of provenance-bearing elements (classes + edges)
  // carrying a non-empty sourceType. 0..1, better when high.
  provenanceCoverage: number;

  // 중복 후보율: similar-name pairs (within classes, within instances) / node
  // count, capped at 1. 0..1, worse when high.
  duplicateCandidateRate: number;
  duplicatePairs: number;
}

function hasProvenance(x: { sourceType?: string | null }): boolean {
  return typeof x.sourceType === 'string' && x.sourceType.trim().length > 0;
}

// Incident-edge degree per node id. Self-loops add 2 to that node.
export function computeDegrees(edges: MetricEdge[]): Map<string, number> {
  const deg = new Map<string, number>();
  for (const e of edges) {
    deg.set(e.sourceId, (deg.get(e.sourceId) ?? 0) + 1);
    deg.set(e.targetId, (deg.get(e.targetId) ?? 0) + 1);
  }
  return deg;
}

export function starIndex(edges: MetricEdge[]): { value: number; hubNodeId: string | null; hubDegree: number } {
  if (edges.length === 0) return { value: 0, hubNodeId: null, hubDegree: 0 };
  const deg = computeDegrees(edges);
  let hubNodeId: string | null = null;
  let hubDegree = 0;
  for (const [id, d] of deg) {
    if (d > hubDegree) {
      hubDegree = d;
      hubNodeId = id;
    }
  }
  // Clamp to 1 (self-loops can push a single node's degree above edge count).
  const value = Math.min(1, hubDegree / edges.length);
  return { value, hubNodeId, hubDegree };
}

export function isolationRate(model: MetricsModel): { rate: number; isolatedCount: number; nodeCount: number } {
  const nodeCount = model.classes.length + model.instances.length;
  if (nodeCount === 0) return { rate: 0, isolatedCount: 0, nodeCount: 0 };
  const deg = computeDegrees(model.edges);
  let isolatedCount = 0;
  for (const n of [...model.classes, ...model.instances]) {
    if ((deg.get(n.id) ?? 0) <= 1) isolatedCount++;
  }
  return { rate: isolatedCount / nodeCount, isolatedCount, nodeCount };
}

export function provenanceCoverage(model: MetricsModel): number {
  const elements = model.classes.length + model.edges.length;
  if (elements === 0) return 1; // vacuously covered — nothing lacks provenance
  const covered =
    model.classes.filter(hasProvenance).length + model.edges.filter(hasProvenance).length;
  return covered / elements;
}

export function duplicateCandidateRate(model: MetricsModel): { rate: number; pairs: number } {
  const nodeCount = model.classes.length + model.instances.length;
  if (nodeCount === 0) return { rate: 0, pairs: 0 };
  // Compare within-kind only: a class and an instance sharing a name (e.g. a
  // "Chuck" class and a "Chuck" instance) is legitimate, not a duplicate.
  const classPairs = findSimilarPairs(model.classes as NamedEntity[]);
  const instancePairs = findSimilarPairs(model.instances as NamedEntity[]);
  const pairs = classPairs.length + instancePairs.length;
  return { rate: Math.min(1, pairs / nodeCount), pairs };
}

// Equal-weighted aggregate of the four axes, each normalized so 1 = healthy.
export function computeHealth(model: MetricsModel): HealthReport {
  const star = starIndex(model.edges);
  const iso = isolationRate(model);
  const prov = provenanceCoverage(model);
  const dup = duplicateCandidateRate(model);

  const goodness = [1 - star.value, 1 - iso.rate, prov, 1 - dup.rate];
  const score = Math.round((goodness.reduce((a, b) => a + b, 0) / goodness.length) * 100);

  return {
    score,
    nodeCount: iso.nodeCount,
    edgeCount: model.edges.length,
    starIndex: star.value,
    hubNodeId: star.hubNodeId,
    hubDegree: star.hubDegree,
    isolationRate: iso.rate,
    isolatedCount: iso.isolatedCount,
    provenanceCoverage: prov,
    duplicateCandidateRate: dup.rate,
    duplicatePairs: dup.pairs,
  };
}
