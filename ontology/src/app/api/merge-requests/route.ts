import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/drizzle';
import { branches, mergeRequests } from '@/lib/drizzle/schema';
import { desc, eq } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';
import { getCurrentUser } from '@/lib/supabase/auth-server';

// PRD-J M3: 머지 리퀘스트 목록/생성.
const createMrSchema = z.object({
  branchId: z.string().uuid(),
  title: z.string().trim().min(1, '제목을 입력해주세요.').max(120),
  description: z.string().optional().default(''),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // open|approved|merged|closed|null(전체)

    const db = await getDb();
    const rows = await db.query.mergeRequests.findMany({
      with: { branch: { columns: { id: true, name: true, status: true } } },
      ...(status ? { where: eq(mergeRequests.status, status) } : {}),
      orderBy: [desc(mergeRequests.createdAt)],
    });

    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createMrSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const db = await getDb();

    const branch = await db.query.branches.findFirst({
      where: eq(branches.id, parsed.data.branchId),
      columns: { id: true, status: true },
    });
    if (!branch) {
      return NextResponse.json({ error: '브랜치를 찾을 수 없습니다.' }, { status: 404 });
    }
    if (branch.status !== 'active') {
      return NextResponse.json(
        { error: '활성 상태의 브랜치만 병합 요청을 만들 수 있습니다.' },
        { status: 400 },
      );
    }

    // 같은 브랜치에 열린 MR 이 있으면 중복 생성 방지.
    const existing = await db.query.mergeRequests.findFirst({
      where: eq(mergeRequests.branchId, parsed.data.branchId),
      columns: { id: true, status: true },
      orderBy: [desc(mergeRequests.createdAt)],
    });
    if (existing && (existing.status === 'open' || existing.status === 'approved')) {
      return NextResponse.json(
        { error: '이 브랜치에는 이미 열린 병합 요청이 있습니다.' },
        { status: 409 },
      );
    }

    const user = await getCurrentUser().catch(() => null);

    const [mr] = await db
      .insert(mergeRequests)
      .values({
        branchId: parsed.data.branchId,
        title: parsed.data.title,
        description: parsed.data.description,
        authorId: user?.id ?? null,
        authorEmail: user?.email ?? null,
      })
      .returning();

    return NextResponse.json(mr, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
