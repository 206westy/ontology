import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { partitions } from '@/lib/drizzle/schema';
import { createPartitionSchema } from '@/features/ontology/lib/schemas';
import { handleApiError } from '@/lib/api-error';

// PRD-B B-1: 구획 CRUD (목록 / 생성)

export async function GET() {
  try {
    const db = await getDb();
    const rows = await db.query.partitions.findMany({
      orderBy: (p, { asc }) => [asc(p.createdAt)],
    });
    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createPartitionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const db = await getDb();
    const [row] = await db
      .insert(partitions)
      .values({
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        name: parsed.data.name,
        description: parsed.data.description,
        color: parsed.data.color,
      })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
