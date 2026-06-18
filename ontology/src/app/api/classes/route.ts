import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { classes } from '@/lib/drizzle/schema';
import { createClassSchema } from '@/features/ontology/lib/schemas';
import { eq, isNull } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const parentId = searchParams.get('parentId');

  try {
    const db = await getDb();
    const condition =
      parentId === null || parentId === undefined
        ? undefined
        : parentId === 'root'
          ? isNull(classes.parentId)
          : eq(classes.parentId, parentId);

    const rows = await db.query.classes.findMany({
      where: condition,
      with: { children: true, properties: true },
      orderBy: (c, { asc }) => [asc(c.name)],
    });

    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createClassSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = await getDb();
    const [row] = await db
      .insert(classes)
      .values({
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        name: parsed.data.name,
        parentId: parsed.data.parentId ?? null,
        partitionId: parsed.data.partitionId,
        description: parsed.data.description,
        color: parsed.data.color,
        positionX: parsed.data.positionX,
        positionY: parsed.data.positionY,
        sourceType: parsed.data.sourceType ?? null,
        confidence: parsed.data.confidence ?? null,
        evidence: parsed.data.evidence ?? null,
      })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
