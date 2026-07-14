import 'server-only';

import { getOntologyScope } from './ontologyContext';
import { type Role } from './constants';

export interface WorkspaceScope {
  userId: string;
  workspaceId: string;
  role: Role;
}

/**
 * 워크스페이스 스코프 API 라우트(problems·datasets 등)의 표준 진입점.
 *
 * 활성 온톨로지 헤더(`x-ontology-id`, 없으면 기본 온톨로지)로부터 소속 워크스페이스를
 * 도출하고 멤버십·역할을 검증한다 — getOntologyScope 를 재사용(DRY). MVP 는 단일 기본
 * 워크스페이스(11111111-…)를 전제하며, 다중 워크스페이스 전환 UI 는 별도 범위.
 *
 * 서비스롤이 RLS 를 우회하므로 이 앱계층 검증이 1차 방어다([[prdpf-a-b-implementation]]).
 */
export async function getWorkspaceScope(
  request: Request,
  minRole: Role = 'viewer',
): Promise<WorkspaceScope> {
  const { userId, workspaceId, role } = await getOntologyScope(request, minRole);
  return { userId, workspaceId, role };
}
