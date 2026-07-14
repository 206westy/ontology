import 'server-only';

import { getCurrentUser } from '@/lib/supabase/auth-server';
import { UnauthorizedError } from '@/lib/api-error';
import { requireOntologyAccess } from './requireOntologyAccess';
import { DEFAULT_ONTOLOGY_ID, ONTOLOGY_HEADER, type Role } from './constants';

export interface OntologyScope {
  userId: string;
  ontologyId: string;
  workspaceId: string;
  role: Role;
}

/**
 * 스코프 API 라우트의 표준 진입점.
 *
 * 1. 세션 사용자 확인(미들웨어가 이미 게이팅하나 방어적 재확인).
 * 2. 요청 헤더 `x-ontology-id` 에서 활성 온톨로지 추출(없으면 기본 온톨로지 = 스튜디오 단독판).
 * 3. 멤버십·역할 검증(requireOntologyAccess).
 *
 * 이후 라우트는 반환된 `ontologyId` 로 모든 쿼리를 스코프한다.
 */
export async function getOntologyScope(
  request: Request,
  minRole: Role = 'viewer',
): Promise<OntologyScope> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();

  const header = request.headers.get(ONTOLOGY_HEADER);
  const ontologyId = header && header.length > 0 ? header : DEFAULT_ONTOLOGY_ID;

  const { workspaceId, role } = await requireOntologyAccess(
    user.id,
    ontologyId,
    minRole,
  );

  return { userId: user.id, ontologyId, workspaceId, role };
}
