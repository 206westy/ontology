import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/drizzle';
import { branches, commits } from '@/lib/drizzle/schema';
import { desc, eq, isNull, and } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';
import { getCurrentUser } from '@/lib/supabase/auth-server';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
// PRD-J M2: 브랜치 스냅샷 로직은 lib/branches/snapshot 로 추출(links 라우트와 공유).
import { buildMainSnapshot } from '@/lib/branches/snapshot';

const createBranchSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '브랜치 이름을 입력해주세요.')
    .max(60, '브랜치 이름은 60자 이하여야 합니다.')
    .refine((n) => n.toLowerCase() !== 'main', {
      message: "'main'은 예약된 이름입니다.",
    }),
  description: z.string().optional().default(''),
});

export async function GET(request: NextRequest) {
  try {
    const { ontologyId } = await getOntologyScope(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? 'active';

    const db = await getDb();
    // base_snapshot 은 무겁다 — 목록에서는 제외(상세 조회에서만 반환).
    const rows = await db.query.branches.findMany({
      columns: {
        id: true,
        name: true,
        description: true,
        authorId: true,
        authorEmail: true,
        baseCommitId: true,
        status: true,
        mergedAt: true,
        mergedBy: true,
        mergeCommitId: true,
        createdAt: true,
      },
      where:
        status !== 'all'
          ? and(eq(branches.ontologyId, ontologyId), eq(branches.status, status))
          : eq(branches.ontologyId, ontologyId),
      orderBy: [desc(branches.createdAt)],
    });

    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createBranchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { ontologyId } = await getOntologyScope(request, 'editor');
    const db = await getDb();
    const user = await getCurrentUser().catch(() => null);

    // 분기 기준점: 이 온톨로지 main 최신 커밋(있다면). 3-way 충돌 검사(M3)의 base.
    const latestMain = await db.query.commits.findFirst({
      columns: { id: true },
      where: and(eq(commits.ontologyId, ontologyId), isNull(commits.branchId)),
      orderBy: [desc(commits.createdAt)],
    });

    const snapshot = await buildMainSnapshot(db, ontologyId);

    const [branch] = await db
      .insert(branches)
      .values({
        ontologyId,
        name: parsed.data.name,
        description: parsed.data.description,
        authorId: user?.id ?? null,
        authorEmail: user?.email ?? null,
        baseCommitId: latestMain?.id ?? null,
        baseSnapshot: snapshot,
      })
      .returning({
        id: branches.id,
        name: branches.name,
        description: branches.description,
        authorId: branches.authorId,
        authorEmail: branches.authorEmail,
        baseCommitId: branches.baseCommitId,
        status: branches.status,
        createdAt: branches.createdAt,
      });

    return NextResponse.json(branch, { status: 201 });
  } catch (err) {
    // UNIQUE 위반(이름 중복)을 친절한 메시지로.
    if (err instanceof Error && err.message.includes('uq_branch_name')) {
      return NextResponse.json(
        { error: '같은 이름의 브랜치가 이미 있습니다.' },
        { status: 409 },
      );
    }
    return handleApiError(err);
  }
}
