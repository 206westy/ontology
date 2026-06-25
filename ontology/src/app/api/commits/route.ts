import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { commits, commitDetails } from '@/lib/drizzle/schema';
import { createCommitSchema } from '@/features/ontology/lib/schemas';
import { desc } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const autoSaveFilter = searchParams.get('autoSave');

    const db = await getDb();

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
    const [commit] = await db
      .insert(commits)
      .values({
        message: parsed.data.message,
        isAutoSave: parsed.data.isAutoSave,
      })
      .returning();

    // 왕복 절감: findFirst 재조회(시드니 +1왕복) 대신 insert 의 returning 으로 응답 구성.
    // 응답 계약은 동일({...commit, details: 전체 행}).
    const details =
      parsed.data.details.length > 0
        ? await db
            .insert(commitDetails)
            .values(
              parsed.data.details.map((d) => ({
                commitId: commit.id,
                operation: d.operation,
                targetTable: d.targetTable,
                targetId: d.targetId,
                beforeSnapshot: d.beforeSnapshot,
                afterSnapshot: d.afterSnapshot,
              })),
            )
            .returning()
        : [];

    return NextResponse.json({ ...commit, details }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
