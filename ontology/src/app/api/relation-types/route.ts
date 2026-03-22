import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { relationTypes } from '@/lib/drizzle/schema';
import { createRelationTypeSchema } from '@/features/ontology/lib/schemas';
import { handleApiError } from '@/lib/api-error';

export async function GET() {
  try {
    const db = await getDb();
    const rows = await db.query.relationTypes.findMany({
      orderBy: (r, { asc }) => [asc(r.name)],
    });

    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createRelationTypeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = await getDb();
    const [row] = await db
      .insert(relationTypes)
      .values({
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        name: parsed.data.name,
        description: parsed.data.description,
        sourceClassId: parsed.data.sourceClassId ?? null,
        targetClassId: parsed.data.targetClassId ?? null,
      })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
