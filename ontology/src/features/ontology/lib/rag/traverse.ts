// PRD-N M4 (Operator): 구획 스코프 그래프 탐색 — 순수 로직(전송/Neo4j 분리).
// 진입 노드에서 시작해 "경로 상 모든 노드가 같은 구획"인 경로만 수집(가드레일). 한 노드라도
// 타 구획이면 배제 → bridge 이탈이 자동 차단된다. 탐색은 결정론(Cypher), LLM 은 종합만.

export interface EvidenceNode {
  id: string;
  name: string;
  partition: string | null;
  sourceType: string | null; // _src
  sourceRef: string | null; // _srcRef
  confidence: number | null; // _conf
  description: string | null;
}
export interface EvidenceEdge {
  type: string;
  bridge: boolean;
}
export interface EvidencePath {
  nodes: EvidenceNode[];
  edges: EvidenceEdge[];
  partition: string | null;
}
export interface Provenance {
  nodeId: string;
  name: string;
  sourceType: string | null;
  sourceRef: string | null;
  evidence: string | null;
}

export interface TraversalOptions {
  partition?: string | null;
  maxDepth?: number;
  limit?: number;
}

export const DEFAULT_MAX_DEPTH = 2;
export const DEFAULT_PATH_LIMIT = 25;
export const MAX_DEPTH_CAP = 4;

function clampDepth(d: number | undefined): number {
  const n = Math.floor(d ?? DEFAULT_MAX_DEPTH);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_DEPTH;
  return Math.min(n, MAX_DEPTH_CAP);
}

// 진입 노드에서 스코프 내 경로를 뽑는 Cypher. maxDepth 는 검증된 정수라 패턴에 인라인
// (Cypher 는 가변길이 상한을 파라미터로 못 받음). partition/limit/entryIds 는 바인딩.
export function buildTraversalCypher(
  entryIds: string[],
  opts: TraversalOptions = {},
): { cypher: string; params: Record<string, unknown> } {
  const depth = clampDepth(opts.maxDepth);
  const limit = Math.max(1, Math.floor(opts.limit ?? DEFAULT_PATH_LIMIT));
  const scoped = !!opts.partition;

  // 가드레일: 경로 상 모든 노드가 현재 구획일 때만. 스코프 없으면(관리자 전체) 생략.
  const guard = scoped ? 'AND ALL(n IN nodes(p) WHERE n.partition = $partition)' : '';

  const cypher = `
    MATCH p = (start:Concept)-[r*1..${depth}]-(m:Concept)
    WHERE start.id IN $entryIds ${guard}
    WITH p LIMIT toInteger($limit)
    RETURN
      [n IN nodes(p) | {id: n.id, name: n.name, partition: n.partition, src: n._src, srcRef: n._srcRef, conf: n._conf, description: n.description}] AS nodes,
      [rel IN relationships(p) | {type: type(rel), bridge: coalesce(rel.bridge, false)}] AS edges`;

  const params: Record<string, unknown> = { entryIds, limit };
  if (scoped) params.partition = opts.partition;
  return { cypher, params };
}

interface RawNode {
  id?: unknown;
  name?: unknown;
  partition?: unknown;
  src?: unknown;
  srcRef?: unknown;
  conf?: unknown;
  description?: unknown;
}
interface RawEdge {
  type?: unknown;
  bridge?: unknown;
}
interface RawPathRow {
  nodes?: RawNode[];
  edges?: RawEdge[];
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

// Neo4j 결과 행 → 타입화된 근거경로. partition 은 경로 첫 노드 기준.
export function shapeEvidencePaths(rows: RawPathRow[]): EvidencePath[] {
  const paths: EvidencePath[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const rawNodes = Array.isArray(row.nodes) ? row.nodes : [];
    const rawEdges = Array.isArray(row.edges) ? row.edges : [];
    if (rawNodes.length === 0) continue;

    const nodes: EvidenceNode[] = rawNodes.map((n) => ({
      id: str(n.id),
      name: str(n.name),
      partition: strOrNull(n.partition),
      sourceType: strOrNull(n.src),
      sourceRef: strOrNull(n.srcRef),
      confidence: typeof n.conf === 'number' ? n.conf : null,
      description: strOrNull(n.description),
    }));
    const edges: EvidenceEdge[] = rawEdges.map((e) => ({
      type: str(e.type),
      bridge: e.bridge === true,
    }));

    // 동일 경로(노드 id 시퀀스) 중복 제거.
    const key = nodes.map((n) => n.id).join('>');
    if (seen.has(key)) continue;
    seen.add(key);

    paths.push({ nodes, edges, partition: nodes[0].partition });
  }
  return paths;
}

// 경로들에서 출처(provenance)를 가진 고유 노드를 모은다.
export function collectProvenance(paths: EvidencePath[]): Provenance[] {
  const byId = new Map<string, Provenance>();
  for (const path of paths) {
    for (const n of path.nodes) {
      if (byId.has(n.id)) continue;
      // sourceType(출처) 나 description(근거 텍스트)이 있는 노드만 provenance 로 본다.
      if (n.sourceType || n.description) {
        byId.set(n.id, {
          nodeId: n.id,
          name: n.name,
          sourceType: n.sourceType,
          sourceRef: n.sourceRef,
          evidence: n.description,
        });
      }
    }
  }
  return [...byId.values()];
}

// LLM 종합용 경로 텍스트. "A -[TYPE]-> B -[TYPE2]-> C" + 노드 정의(있으면).
export function pathsToPromptText(paths: EvidencePath[]): string {
  if (paths.length === 0) return '(no paths found in the current partition)';
  const lines = paths.map((p, i) => {
    let chain = p.nodes[0]?.name ?? '?';
    for (let e = 0; e < p.edges.length; e++) {
      const edge = p.edges[e];
      const next = p.nodes[e + 1]?.name ?? '?';
      const tag = edge.bridge ? `${edge.type}*bridge` : edge.type;
      chain += ` -[${tag}]- ${next}`;
    }
    return `${i + 1}. ${chain}`;
  });
  const defs = paths
    .flatMap((p) => p.nodes)
    .filter((n) => n.description)
    .map((n) => `- ${n.name}: ${n.description}`);
  const uniqueDefs = [...new Set(defs)];
  return [
    'Paths:',
    ...lines,
    ...(uniqueDefs.length ? ['', 'Definitions:', ...uniqueDefs] : []),
  ].join('\n');
}
