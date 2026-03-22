import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { properties } from '@/lib/drizzle/schema';
import { createPropertySchema } from '@/features/ontology/lib/schemas';
import { eq } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  const classId = request.nextUrl.searchParams.get('classId');

  try {
    const db = await getDb();
    const rows = classId
      ? await db.query.properties.findMany({
          where: eq(properties.classId, classId),
          orderBy: (p, { asc }) => [asc(p.sortOrder)],
        })
      : await db.query.properties.findMany({
          orderBy: (p, { asc }) => [asc(p.sortOrder)],
        });

    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createPropertySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = await getDb();
    const [row] = await db
      .insert(properties)
      .values({
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        classId: parsed.data.classId,
        name: parsed.data.name,
        dataType: parsed.data.dataType,
        isRequired: parsed.data.isRequired,
        enumValues: parsed.data.enumValues,
        constraintRule: parsed.data.constraintRule,
        sortOrder: parsed.data.sortOrder,
      })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
