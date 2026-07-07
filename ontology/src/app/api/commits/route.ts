import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { commits, commitDetails } from '@/lib/drizzle/schema';
import { createCommitSchema } from '@/features/ontology/lib/schemas';
import { desc, eq, asc, and, isNull } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';
import { getCurrentUser } from '@/lib/supabase/auth-server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const autoSaveFilter = searchParams.get('autoSave');
    const unpushedOnly = searchParams.get('unpushed') === 'true';

    const db = await getDb();

    // 미반영(Neo4j 반영 안 됨) 커밋 ID만 경량 조회 — "반영본 채우기"용.
    // details 없이 id/생성순만 반환(오래된 순 → 재생 순서 보장).
    // PRD-J: 브랜치 커밋은 main 미적용 상태이므로 push 대상에서 제외(main 전용).
    if (unpushedOnly) {
      const rows = await db.query.commits.findMany({
        columns: { id: true, createdAt: true },
        where: and(eq(commits.pushedToNeo4j, false), isNull(commits.branchId)),
        orderBy: [asc(commits.createdAt)],
      });
      return NextResponse.json({ ids: rows.map((r) => r.id), count: rows.length });
    }

    const rows = await db.query.commits.findMany({
      with: { details: true },
      orderBy: [desc(commits.createdAt)],
      ...(autoSaveFilter != null
        ? { where: (c: any, { eq }: any) => eq(c.isAutoSave, autoSaveFilter === 'true') }
        : {}),
    });

    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createCommitSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = await getDb();

    // PRD-J M1: 작성자는 클라이언트 주장이 아니라 서버 세션에서 주입(위조 불가).
    // 미로그인(개발/단독 사용)이어도 커밋은 막지 않는다 — author 만 NULL.
    const user = await getCurrentUser().catch(() => null);

    // 같은 체인(같은 branchId, autosave 포함)의 직전 커밋을 부모로 기록.
    const branchId = parsed.data.branchId ?? null;
    const prev = await db.query.commits.findFirst({
      columns: { id: true },
      where: branchId
        ? eq(commits.branchId, branchId)
        : isNull(commits.branchId),
      orderBy: [desc(commits.createdAt)],
    });

    const [commit] = await db
      .insert(commits)
      .values({
        message: parsed.data.message,
        isAutoSave: parsed.data.isAutoSave,
        branchId,
        authorId: user?.id ?? null,
        authorEmail: user?.email ?? null,
        parentCommitId: prev?.id ?? null,
      })
      .returning();

    // 왕복 절감: findFirst 재조회(시드니 +1왕복) 대신 insert 의 returning 으로 응답 구성.
    // 응답 계약은 동일({...commit, details: 전체 행}).
    const details =
      parsed.data.details.length > 0
        ? await db
            .insert(commitDetails)
            .values(
              parsed.data.details.map((d, i) => ({
                commitId: commit.id,
                operation: d.operation,
                targetTable: d.targetTable,
                targetId: d.targetId,
                beforeSnapshot: d.beforeSnapshot,
                afterSnapshot: d.afterSnapshot,
                // PRD-J M2: 커밋 내 순서(재생·병합의 결정적 적용 순서 보장).
                seq: i,
              })),
            )
            .returning()
        : [];

    return NextResponse.json({ ...commit, details }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
