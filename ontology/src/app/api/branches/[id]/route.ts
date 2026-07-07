import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/drizzle';
import { branches, commits, commitDetails } from '@/lib/drizzle/schema';
import { asc, eq } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';

// PRD-J M2: 브랜치 상세 = 브랜치(베이스 스냅샷 포함) + 커밋 체인(오래된 순, details 포함).
// 체크아웃 = 클라이언트가 base_snapshot 로드 후 커밋 details 를 순서대로 재생.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const db = await getDb();
    const branch = await db.query.branches.findFirst({
      where: eq(branches.id, id),
    });

    if (!branch) {
      return NextResponse.json(
        { error: '브랜치를 찾을 수 없습니다.' },
        { status: 404 },
      );
    }

    const branchCommits = await db.query.commits.findMany({
      where: eq(commits.branchId, id),
      // seq 오름차순 — 커밋 내 변경 순서 보존(재생의 결정성).
      with: { details: { orderBy: [asc(commitDetails.seq)] } },
      orderBy: [asc(commits.createdAt)],
    });

    return NextResponse.json({ branch, commits: branchCommits });
  } catch (err) {
    return handleApiError(err);
  }
}

const patchBranchSchema = z.object({
  status: z.enum(['active', 'abandoned']),
});

// 브랜치 폐기/복구. 병합(merged)은 M3 의 merge 엔드포인트에서만 설정한다.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = patchBranchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = await getDb();
    const [updated] = await db
      .update(branches)
      .set({ status: parsed.data.status })
      .where(eq(branches.id, id))
      .returning({ id: branches.id, status: branches.status });

    if (!updated) {
      return NextResponse.json(
        { error: '브랜치를 찾을 수 없습니다.' },
        { status: 404 },
      );
    }

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
