/**
 * PRD-PF-A: 멀티 온톨로지 스코프 상수.
 *
 * 기존 단일 전역 그래프가 귀속된 부트스트랩 기본 워크스페이스/온톨로지(M1 시드).
 * "스튜디오 단독판" 및 아직 온톨로지를 선택하지 않은 진입의 기본값으로도 쓰인다.
 * 값은 마이그레이션 `20260714000001_pf_a_m1_containers.sql` 의 시드와 반드시 일치.
 */
export const DEFAULT_WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
export const DEFAULT_ONTOLOGY_ID = '22222222-2222-2222-2222-222222222222';

/** 요청 헤더 키 — 클라이언트가 활성 온톨로지를 실어 보낸다(앱계층 스코프의 소스). */
export const ONTOLOGY_HEADER = 'x-ontology-id';

/** 워크스페이스 역할(권한 게이트). owner > admin > editor > viewer. */
export const ROLE_RANK = { owner: 3, admin: 2, editor: 1, viewer: 0 } as const;
export type Role = keyof typeof ROLE_RANK;

/** a 가 b 이상 권한인가(예: editor 는 viewer 이상). */
export function roleGte(a: Role, b: Role): boolean {
  return ROLE_RANK[a] >= ROLE_RANK[b];
}
