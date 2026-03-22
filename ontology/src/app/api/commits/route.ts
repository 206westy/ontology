import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { commits, commitDetails } from '@/lib/drizzle/schema';
import { createCommitSchema } from '@/features/ontology/lib/schemas';
import { desc } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';

export async function GET() {
  try {
    const db = await getDb();
    const rows = await db.query.commits.findMany({
      with: { details: true },
      orderBy: [desc(commits.createdAt)],
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
      .values({ message: parsed.data.message })
      .returning();

    if (parsed.data.details.length > 0) {
      await db.insert(commitDetails).values(
        parsed.data.details.map((d) => ({
          commitId: commit.id,
          operation: d.operation,
          targetTable: d.targetTable,
          targetId: d.targetId,
          beforeSnapshot: d.beforeSnapshot,
          afterSnapshot: d.afterSnapshot,
        })),
      );
    }

    const result = await db.query.commits.findFirst({
      where: (c, { eq }) => eq(c.id, commit.id),
      with: { details: true },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
