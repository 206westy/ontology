import 'server-only';

import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import { ontologies, memberships } from '@/lib/drizzle/schema';
import { ForbiddenError } from '@/lib/api-error';
import { roleGte, type Role } from './constants';

// 성능: 멤버십·역할은 거의 안 바뀌므로 (userId,ontologyId)→{workspaceId,role} 를 짧게 캐시한다.
// 요청당 시드니 pooler 왕복 1회(~150-300ms)를 제거. 변경은 최대 TTL 만큼 지연 반영(미들웨어
// /api 인증 캐시와 동일 사상). 역할 게이트(roleGte)는 캐시된 역할로 매 호출 로컬 평가한다.
const ACCESS_TTL_MS = 30_000;
const ACCESS_MAX_ENTRIES = 2000;
const accessCache = new Map<string, { workspaceId: string; role: Role; at: number }>();

async function resolveAccess(
  userId: string,
  ontologyId: string,
): Promise<{ workspaceId: string; role: Role } | null> {
  const key = `${userId}:${ontologyId}`;
  const hit = accessCache.get(key);
  if (hit && Date.now() - hit.at <= ACCESS_TTL_MS) {
    return { workspaceId: hit.workspaceId, role: hit.role };
  }

  const db = await getDb();
  const rows = await db
    .select({ workspaceId: ontologies.workspaceId, role: memberships.role })
    .from(ontologies)
    .innerJoin(
      memberships,
      and(
        eq(memberships.workspaceId, ontologies.workspaceId),
        eq(memberships.userId, userId),
      ),
    )
    .where(eq(ontologies.id, ontologyId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const resolved = { workspaceId: row.workspaceId, role: row.role as Role };
  if (accessCache.size >= ACCESS_MAX_ENTRIES) {
    const oldest = accessCache.keys().next().value;
    if (oldest !== undefined) accessCache.delete(oldest);
  }
  accessCache.set(key, { ...resolved, at: Date.now() });
  return resolved;
}

/**
 * PRD-PF-A 앱계층 1차 방어선.
 *
 * 서비스롤 Drizzle 은 RLS 를 완전히 우회하므로, RLS(2차 방어)만으로는 안전하지 않다.
 * 모든 스코프 API 라우트는 쿼리 실행 전에 이 가드를 통과해야 한다:
 *   (i) 세션 사용자가 해당 온톨로지의 워크스페이스 멤버인지,
 *   (ii) 멤버 역할이 요구 최소 역할(minRole) 이상인지.
 */
export async function requireOntologyAccess(
  userId: string,
  ontologyId: string,
  minRole: Role = 'viewer',
): Promise<{ workspaceId: string; role: Role }> {
  const access = await resolveAccess(userId, ontologyId);
  if (!access) {
    throw new ForbiddenError('이 온톨로지에 접근할 권한이 없습니다.');
  }
  if (!roleGte(access.role, minRole)) {
    throw new ForbiddenError('이 작업을 수행할 권한이 부족합니다.');
  }
  return access;
}
