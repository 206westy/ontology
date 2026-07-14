import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/lib/drizzle';
import { specLimits } from '@/lib/drizzle/schema';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';

// PRD-PF-F: 공정변수 스펙(USL/LSL/target) 등록·재사용. 온톨로지 스코프.
export async function GET(request: NextRequest) {
  try {
    const { ontologyId } = await getOntologyScope(request);
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    const db = await getDb();
    const rows = await db.query.specLimits.findMany({
      where: propertyId
        ? and(eq(specLimits.ontologyId, ontologyId), eq(specLimits.propertyId, propertyId))
        : eq(specLimits.ontologyId, ontologyId),
      orderBy: (s, { desc }) => [desc(s.revision)],
    });
    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

const createSchema = z
  .object({
    propertyId: z.string().uuid(),
    usl: z.number().nullable().optional(),
    lsl: z.number().nullable().optional(),
    target: z.number().nullable().optional(),
    unit: z.string().max(40).optional(),
    note: z.string().max(2000).optional(),
  })
  .refine((d) => d.usl != null || d.lsl != null || d.target != null, {
    message: 'USL·LSL·target 중 하나 이상 필요',
  });

export async function POST(request: NextRequest) {
  try {
    const { ontologyId, userId } = await getOntologyScope(request, 'editor');
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const db = await getDb();
    // 새 개정판: 기존 최대 revision + 1(스펙 이력 보존, 자동 재계산 아님).
    const existing = await db.query.specLimits.findMany({
      where: and(
        eq(specLimits.ontologyId, ontologyId),
        eq(specLimits.propertyId, parsed.data.propertyId),
      ),
    });
    const nextRev = existing.length
      ? Math.max(...existing.map((e) => e.revision)) + 1
      : 1;

    const [row] = await db
      .insert(specLimits)
      .values({
        ontologyId,
        propertyId: parsed.data.propertyId,
        usl: parsed.data.usl ?? null,
        lsl: parsed.data.lsl ?? null,
        target: parsed.data.target ?? null,
        unit: parsed.data.unit ?? null,
        note: parsed.data.note ?? null,
        revision: nextRev,
        createdBy: userId,
      })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
