import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/lib/drizzle';
import { triggers } from '@/lib/drizzle/schema';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';

// PRD-PF-I M1: 트리거 목록/생성. 트리거는 "실행 여부"만 — 판정 로직은 결정함수(target_function)에 위임.
export async function GET(request: NextRequest) {
  try {
    const { ontologyId } = await getOntologyScope(request);
    const db = await getDb();
    const rows = await db.query.triggers.findMany({
      where: eq(triggers.ontologyId, ontologyId),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  eventType: z.enum(['dataset_updated', 'schedule', 'instance_created', 'instance_updated', 'manual']),
  eventConfig: z.record(z.string(), z.unknown()).optional(),
  targetFunctionId: z.string().uuid().nullable().optional(),
  scope: z.record(z.string(), z.unknown()).optional(),
  rateLimit: z
    .object({
      max_runs_per_hour: z.number().int().positive().optional(),
      cooldown_seconds: z.number().int().nonnegative().optional(),
    })
    .optional(),
  enabled: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { ontologyId, workspaceId, userId } = await getOntologyScope(request, 'editor');
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const db = await getDb();
    const [row] = await db
      .insert(triggers)
      .values({
        ontologyId,
        workspaceId,
        name: parsed.data.name,
        eventType: parsed.data.eventType,
        eventConfig: parsed.data.eventConfig ?? {},
        targetFunctionId: parsed.data.targetFunctionId ?? null,
        scope: parsed.data.scope ?? {},
        rateLimit: parsed.data.rateLimit ?? { max_runs_per_hour: 12, cooldown_seconds: 60 },
        enabled: parsed.data.enabled ?? true,
        createdBy: userId,
      })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
