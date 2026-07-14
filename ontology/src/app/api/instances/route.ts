import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { instances, instanceValues } from '@/lib/drizzle/schema';
import { createInstanceSchema } from '@/features/ontology/lib/schemas';
import { eq, and } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { parsePagination } from '@/lib/pagination';

export async function GET(request: NextRequest) {
  const classId = request.nextUrl.searchParams.get('classId');
  const { limit, offset } = parsePagination(request.nextUrl.searchParams);

  try {
    const { ontologyId } = await getOntologyScope(request);
    const db = await getDb();
    // PRD-PF-A: 활성 온톨로지로 스코프. PRD-Perf M0-1: embedding 은 응답에서 제외.
    const where = classId
      ? and(eq(instances.ontologyId, ontologyId), eq(instances.classId, classId))
      : eq(instances.ontologyId, ontologyId);
    const rows = await db.query.instances.findMany({
      where,
      columns: { embedding: false },
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

    const { ontologyId } = await getOntologyScope(request, 'editor');
    const db = await getDb();
    const [instance] = await db
      .insert(instances)
      .values({
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        ontologyId,
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
                ontologyId,
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
