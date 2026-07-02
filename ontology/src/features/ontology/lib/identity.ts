// PRD-F P1-1: content-hash 안정 식별자.
// 같은 입력이 같은 노드/엣지 id 로 수렴해야 cypher-builder 의 MERGE(id) 가
// 재유입 시 중복 0 건으로 수렴한다(random UUID 는 매번 달라 MERGE 무력).
//
// UUIDv5(namespaced deterministic UUID)를 쓴다: SHA-1 기반이라 결정적이면서
// version/variant 비트가 규격에 맞아 z.uuid()·Postgres uuid 컬럼을 그대로 통과한다.
// (하드롤 SHA-1→UUID 는 비트 오류로 검증 탈락 위험이 있어 쓰지 않는다.)
import { v5 as uuidv5 } from 'uuid';
import { normalizeName } from './similarity';

// 온톨로지 전용 고정 네임스페이스(임의의 고정 UUID). 절대 변경 금지 —
// 바뀌면 과거에 발급한 모든 안정 id 가 어긋난다.
const ONTOLOGY_NAMESPACE = '6f9b2a1e-3c4d-5e6f-8a7b-9c0d1e2f3a4b';

export type NodeKind = 'class' | 'instance';

// 노드(class/instance) 안정 id.
// discriminator 는 kind + partition 만 사용한다. 부모/클래스명은 추출마다 가장
// 흔들리는 값이라 identity 에 넣으면 오히려 재현성을 깨뜨리므로 제외한다.
export function stableEntityId(
  name: string,
  kind: NodeKind,
  partition: string,
): string {
  const key = `${partition}|${kind}|${normalizeName(name)}`;
  return uuidv5(key, ONTOLOGY_NAMESPACE);
}

// 엣지 안정 id. 양 끝 노드가 이미 안정 id 이므로 (src,tgt,관계명,category)만으로
// 완전히 결정적이다. 이게 없으면 재유입마다 새 random 엣지 id 가 생겨 같은 노드
// 사이에 관계가 중복 생성된다(cypher-builder edge MERGE 가 {id} 로 묶기 때문).
export function stableEdgeId(
  sourceId: string,
  targetId: string,
  relationName: string,
  category: string,
): string {
  const key = `${sourceId}|${targetId}|${normalizeName(relationName)}|${category}`;
  return uuidv5(key, ONTOLOGY_NAMESPACE);
}
