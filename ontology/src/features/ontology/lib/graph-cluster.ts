// 군집(커뮤니티) 탐지 + 색상 + 시드 좌표 — 전부 순수 함수(테스트 대상, 브라우저/서버 무관).
//
// 설계 결정(무병목·경량·창의):
//  - 군집 산출: 의존성 0의 Louvain "지역 이동(local-moving)" 1레벨. graphology-louvain이 업계
//    표준이나, 그래프가 이미 스토어에 있어 왕복 불필요 + 번들 미증가 위해 자체 구현.
//    O(passes · edges) — 시각 시드 용도엔 1레벨로 충분하고 매우 빠르다.
//  - 색상: 군집마다 골든앵글(137.5°) 고유 hue → 팔레트 무한, 인접 순위 군집은 강하게 대비.
//    "관련된 것끼리 같은 색, 이웃 군집은 다른 색"을 자연히 만족.
//  - 배치: 군집 중심점을 phyllotaxis(해바라기)로 비겹침 패킹 → 노드를 중심 근처에 시드.
//    이후 fcose 1회 완화가 실제 엣지로 연결된 군집을 유기적으로 끌어당긴다(상시 물리 없음).

export interface ClusterEdge {
  source: string;
  target: string;
}

export interface Vec2 {
  x: number;
  y: number;
}

const GOLDEN_ANGLE_DEG = 137.50776405003785;
const GOLDEN_ANGLE_RAD = (GOLDEN_ANGLE_DEG * Math.PI) / 180;
const MAX_LOUVAIN_PASSES = 12;

/**
 * Louvain 지역 이동(1레벨) 커뮤니티 탐지. 무방향·가중(평행 엣지 합산) 그래프.
 * 반환: nodeId → 0..K-1 연속 군집 인덱스. 고립 노드는 각자 싱글턴 군집.
 */
export function detectCommunities(nodeIds: string[], edges: ClusterEdge[]): Map<string, number> {
  const index = new Map<string, number>();
  nodeIds.forEach((id, i) => index.set(id, i));
  const n = nodeIds.length;
  if (n === 0) return new Map();

  // 인접 리스트(가중) — self-loop 제외, 존재하는 노드만.
  const adj: Map<number, number>[] = Array.from({ length: n }, () => new Map());
  const degree = new Array<number>(n).fill(0);
  let m2 = 0; // 2m (총 가중 차수 합)
  for (const e of edges) {
    const a = index.get(e.source);
    const b = index.get(e.target);
    if (a === undefined || b === undefined || a === b) continue;
    adj[a].set(b, (adj[a].get(b) ?? 0) + 1);
    adj[b].set(a, (adj[b].get(a) ?? 0) + 1);
    degree[a] += 1;
    degree[b] += 1;
    m2 += 2;
  }

  const community = new Array<number>(n);
  for (let i = 0; i < n; i++) community[i] = i;
  // 엣지가 없으면 전부 싱글턴.
  if (m2 === 0) return relabel(nodeIds, community);

  const sigmaTot = new Array<number>(n);
  for (let i = 0; i < n; i++) sigmaTot[i] = degree[i];

  for (let pass = 0; pass < MAX_LOUVAIN_PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      const ki = degree[i];
      const cur = community[i];
      // i를 현재 군집에서 분리
      sigmaTot[cur] -= ki;

      // 이웃 군집별 i→c 가중 합
      const kiIn = new Map<number, number>();
      for (const [j, w] of adj[i]) {
        const cj = community[j];
        kiIn.set(cj, (kiIn.get(cj) ?? 0) + w);
      }

      // 최적 군집 선택: gain ∝ kiIn[c] - sigmaTot[c]·ki/(2m). 동률이면 현재 유지.
      let bestC = cur;
      let bestGain = (kiIn.get(cur) ?? 0) - (sigmaTot[cur] * ki) / m2;
      for (const [c, kin] of kiIn) {
        if (c === cur) continue;
        const gain = kin - (sigmaTot[c] * ki) / m2;
        if (gain > bestGain) {
          bestGain = gain;
          bestC = c;
        }
      }

      community[i] = bestC;
      sigmaTot[bestC] += ki;
      if (bestC !== cur) moved = true;
    }
    if (!moved) break;
  }

  return relabel(nodeIds, community);
}

/** 임의 군집 라벨 → 0..K-1 연속 인덱스(등장 순서 기준, 결정론적). */
function relabel(nodeIds: string[], community: number[]): Map<string, number> {
  const remap = new Map<number, number>();
  const out = new Map<string, number>();
  nodeIds.forEach((id, i) => {
    const c = community[i];
    let r = remap.get(c);
    if (r === undefined) {
      r = remap.size;
      remap.set(c, r);
    }
    out.set(id, r);
  });
  return out;
}

// 브랜드 보라(--primary #7c3aed ≈ hue 262°)에서 파생한 군집 팔레트.
// 무지개색 대신 보라 주변 좁은 대역(±BRAND_HUE_BAND)의 hue + 명도 계단으로 군집을 구분한다.
// 채도를 낮춰(muted) 선택 강조의 선명한 보라가 도드라지게 하고, 테두리 패턴이 유사 톤을 보강한다.
const BRAND_HUE = 262;
const BRAND_HUE_BAND = 34; // ±34° → 228~296° (인디고~바이올렛~마젠타, 보라 계열 유지)

// 골든비 저불일치 수열 — 좁은 대역에서도 hue가 고르게 퍼지도록(골든앵글 mod 좁은대역은 뭉침).
const GOLDEN_RATIO_CONJUGATE = 0.6180339887498949;

/** 군집 순위 → 보라 파생 hsl() 색. hue는 보라 대역에 고르게 분산, 명도는 3계단 순환(인접 순위 구분). */
export function clusterColor(rank: number, isDark: boolean): string {
  const frac = (rank * GOLDEN_RATIO_CONJUGATE) % 1; // [0,1) 고르게 분산
  const hue = BRAND_HUE - BRAND_HUE_BAND + frac * (BRAND_HUE_BAND * 2); // 228..296
  // 명도 계단(rank%3) — 같은 hue라도 밝기로 구분되게. 어두운/밝은 테마별 상향.
  const lightLevels = isDark ? [50, 61, 72] : [40, 51, 62];
  const light = lightLevels[rank % lightLevels.length];
  const sat = isDark ? 40 : 44; // muted → 선택 vivid 보라가 도드라짐
  return `hsl(${hue.toFixed(1)}, ${sat}%, ${light}%)`;
}

/**
 * 군집별 색 맵(clusterIndex → hsl 문자열).
 * 색 배정 순위를 "군집의 앵커(멤버 중 최소 id)" 사전순으로 고정 → 엣지 추가 등 증분 편집으로
 * 군집이 재편돼도 앵커가 유지되는 한 색이 튀지 않는다(연속성). 인접 순위는 골든앵글로 대비.
 */
export function assignClusterColors(community: Map<string, number>, isDark: boolean): Map<number, string> {
  const anchor = new Map<number, string>(); // clusterId → 최소 nodeId
  for (const [nodeId, c] of community) {
    const cur = anchor.get(c);
    if (cur === undefined || nodeId < cur) anchor.set(c, nodeId);
  }
  const ranked = [...anchor.keys()].sort((a, b) => (anchor.get(a)! < anchor.get(b)! ? -1 : 1));
  const colors = new Map<number, string>();
  ranked.forEach((c, rank) => colors.set(c, clusterColor(rank, isDark)));
  return colors;
}

// 색각 대비용 비색상 2차 채널 — 군집마다 테두리 패턴을 색과 함께 부여(WCAG 1.4.1: 색 단독 금지).
const CLUSTER_BORDER_STYLES = ['solid', 'dashed', 'dotted'] as const;

/** 군집 순위(색과 동일한 앵커 기준) → 테두리 패턴. 인접 순위는 서로 다른 패턴이 되도록 순환. */
export function assignClusterBorderStyles(community: Map<string, number>): Map<number, string> {
  const anchor = new Map<number, string>();
  for (const [nodeId, c] of community) {
    const cur = anchor.get(c);
    if (cur === undefined || nodeId < cur) anchor.set(c, nodeId);
  }
  const ranked = [...anchor.keys()].sort((a, b) => (anchor.get(a)! < anchor.get(b)! ? -1 : 1));
  const out = new Map<number, string>();
  ranked.forEach((c, rank) => out.set(c, CLUSTER_BORDER_STYLES[rank % CLUSTER_BORDER_STYLES.length]));
  return out;
}

export interface SeedInput {
  nodeIds: string[];
  community: Map<string, number>;
  /** 인스턴스 → 부모 클래스 id (있으면 부모 근처에 시드). */
  parentOf?: Map<string, string>;
  /** 전역 간격 배율(노드 지름 스케일). */
  spacing?: number;
}

/**
 * 군집 중심점을 phyllotaxis로 비겹침 패킹하고, 각 노드를 자기 군집 중심 근처에 시드.
 * 인스턴스는 부모 클래스 근처(부모가 이미 배치된 경우)에 놓아 소속을 시각적으로 보존한다.
 * 반환 좌표는 fcose(randomize:false) 완화의 초기값으로 쓰인다.
 */
export function computeSeedPositions(input: SeedInput): Map<string, Vec2> {
  const { nodeIds, community, parentOf, spacing = 120 } = input;
  const out = new Map<string, Vec2>();
  if (nodeIds.length === 0) return out;

  // 군집별 멤버 + 크기.
  const members = new Map<number, string[]>();
  for (const id of nodeIds) {
    const c = community.get(id) ?? 0;
    const arr = members.get(c);
    if (arr) arr.push(id);
    else members.set(c, [id]);
  }

  // 군집 순위(크기 desc) → 큰 군집이 중앙 근처.
  const ranked = [...members.keys()].sort((a, b) => members.get(b)!.length - members.get(a)!.length || a - b);

  // 군집 중심점: 해바라기 배치. 반경은 군집 크기 누적으로 벌려 비겹침.
  const centroid = new Map<number, Vec2>();
  const clusterRadius = new Map<number, number>();
  let cumulative = 0;
  ranked.forEach((c, rank) => {
    const count = members.get(c)!.length;
    const r = spacing * Math.sqrt(count); // 내부 반경(노드 수 비례)
    clusterRadius.set(c, r);
    cumulative += r + spacing;
    const ang = rank * GOLDEN_ANGLE_RAD;
    const rad = cumulative;
    centroid.set(c, { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad });
  });

  // 1패스: 부모가 없는 노드(클래스 등)를 군집 중심 주변 해바라기로.
  const placedFirst = new Set<string>();
  for (const c of ranked) {
    const arr = members.get(c)!;
    const ctr = centroid.get(c)!;
    let j = 0;
    for (const id of arr) {
      if (parentOf?.has(id)) continue; // 인스턴스는 2패스
      const ang = j * GOLDEN_ANGLE_RAD;
      const rad = spacing * 0.5 * Math.sqrt(j);
      out.set(id, { x: ctr.x + Math.cos(ang) * rad, y: ctr.y + Math.sin(ang) * rad });
      placedFirst.add(id);
      j++;
    }
  }

  // 2패스: 부모 근처(있으면)에, 없으면 자기 군집 중심 근처에.
  for (const id of nodeIds) {
    if (out.has(id)) continue;
    const parent = parentOf?.get(id);
    const anchor = parent && out.get(parent);
    if (anchor) {
      // 부모 주변 소형 링(결정론적 각도).
      const seed = hashAngle(id);
      out.set(id, { x: anchor.x + Math.cos(seed) * spacing * 0.35, y: anchor.y + Math.sin(seed) * spacing * 0.35 });
    } else {
      const c = community.get(id) ?? ranked[0];
      const ctr = centroid.get(c) ?? { x: 0, y: 0 };
      const seed = hashAngle(id);
      const rad = clusterRadius.get(c) ?? spacing;
      out.set(id, { x: ctr.x + Math.cos(seed) * rad * 0.5, y: ctr.y + Math.sin(seed) * rad * 0.5 });
    }
  }

  return out;
}

/** id 문자열 → [0,2π) 결정론적 각도(시드 지터용, Math.random 없이 안정 배치). */
function hashAngle(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967296) * Math.PI * 2;
}
