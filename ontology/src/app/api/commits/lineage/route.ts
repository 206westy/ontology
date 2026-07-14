import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import { commits, commitDetails } from '@/lib/drizzle/schema';
import { handleApiError } from '@/lib/api-error';
import { getOntologyScope } from '@/lib/authz/ontologyContext';

// PRD-N M5: 노드 계보 — 이 노드(targetId)를 건드린 커밋 이벤트를 시간순으로 반환.
// commit_details(target_id) ⨝ commits. provenance/패턴 출처는 노드 속성으로 별도 표시.
export async function GET(request: NextRequest) {
  try {
    const { ontologyId } = await getOntologyScope(request);
    const targetId = new URL(request.url).searchParams.get('targetId');
    if (!targetId) {
      return NextResponse.json({ error: 'targetId 파라미터가 필요합니다.' }, { status: 400 });
    }

    const db = await getDb();
    const rows = await db
      .select({
        operation: commitDetails.operation,
        message: commits.message,
        createdAt: commits.createdAt,
        authorEmail: commits.authorEmail,
        pushedAt: commits.pushedAt,
        versionTag: commits.versionTag,
      })
      .from(commitDetails)
      .innerJoin(commits, eq(commitDetails.commitId, commits.id))
      .where(
        and(
          eq(commitDetails.ontologyId, ontologyId),
          eq(commitDetails.targetId, targetId),
        ),
      );

    const events = rows
      .map((r) => ({
        operation: r.operation as 'ADD' | 'MOD' | 'DEL',
        message: r.message ?? '',
        createdAt: (r.createdAt as Date).toISOString(),
        authorEmail: r.authorEmail ?? null,
        pushedAt: r.pushedAt ? (r.pushedAt as Date).toISOString() : null,
        versionTag: r.versionTag ?? null,
      }))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

    return NextResponse.json({ events });
  } catch (err) {
    return handleApiError(err);
  }
}
