import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { instances, instanceValues } from '@/lib/drizzle/schema';
import { createInstanceSchema } from '@/features/ontology/lib/schemas';
import { eq } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';
import { parsePagination } from '@/lib/pagination';

export async function GET(request: NextRequest) {
  const classId = request.nextUrl.searchParams.get('classId');
  const { limit, offset } = parsePagination(request.nextUrl.searchParams);

  try {
    const db = await getDb();
    const rows = classId
      ? await db.query.instances.findMany({
          where: eq(instances.classId, classId),
          with: { values: true },
          orderBy: (i, { asc }) => [asc(i.name)],
          limit,
          offset,
        })
      : await db.query.instances.findMany({
          with: { values: true },
          orderBy: (i, { asc }) => [asc(i.name)],
          limit,
          offset,
        });

    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createInstanceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = await getDb();
    const [instance] = await db
      .insert(instances)
      .values({
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        classId: parsed.data.classId,
        name: parsed.data.name,
        description: parsed.data.description,
      })
      .returning();

    // 왕복 절감: findFirst 재조회 대신 insert 의 returning 으로 응답 구성(계약 동일).
    const values =
      parsed.data.values && parsed.data.values.length > 0
        ? await db
            .insert(instanceValues)
            .values(
              parsed.data.values.map((v) => ({
                instanceId: instance.id,
                propertyId: v.propertyId,
                value: v.value ?? null,
              })),
            )
            .returning()
        : [];

    return NextResponse.json({ ...instance, values }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
