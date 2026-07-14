import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/lib/drizzle';
import { instances, objectStateDefs, instanceStateLog } from '@/lib/drizzle/schema';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';
import { validateStateTransition, type StateDef } from '@/lib/automation/statemachine';

async function loadContext(
  db: Awaited<ReturnType<typeof getDb>>,
  ontologyId: string,
  instanceId: string,
) {
  const instance = await db.query.instances.findFirst({
    where: and(eq(instances.id, instanceId), eq(instances.ontologyId, ontologyId)),
  });
  if (!instance) return { instance: null, def: null, current: null };
  const def = await db.query.objectStateDefs.findFirst({
    where: and(
      eq(objectStateDefs.classId, instance.classId),
      eq(objectStateDefs.ontologyId, ontologyId),
    ),
  });
  const latest = await db.query.instanceStateLog.findMany({
    where: eq(instanceStateLog.instanceId, instanceId),
    orderBy: (l, { desc }) => [desc(l.createdAt)],
    limit: 1,
  });
  const current = latest[0]?.toState ?? def?.initialState ?? null;
  return { instance, def, current };
}

// GET — 현재 상태(최신 로그에서 파생) + 상태머신 정의.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { ontologyId } = await getOntologyScope(request);
    const db = await getDb();
    const { instance, def, current } = await loadContext(db, ontologyId, id);
    if (!instance) {
      return NextResponse.json({ error: '인스턴스를 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({ current, def, hasStateMachine: !!def });
  } catch (err) {
    return handleApiError(err);
  }
}

const patchSchema = z.object({
  toState: z.string().min(1),
  reason: z.string().max(1000).optional(),
});

// POST — 상태 전이(가드). 정의되지 않은 전이는 거부(100% 차단). append-only 로그.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { ontologyId, userId } = await getOntologyScope(request, 'editor');
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const db = await getDb();
    const { instance, def, current } = await loadContext(db, ontologyId, id);
    if (!instance) {
      return NextResponse.json({ error: '인스턴스를 찾을 수 없습니다.' }, { status: 404 });
    }
    if (!def) {
      return NextResponse.json({ error: '이 클래스에 상태머신이 정의되어 있지 않습니다.' }, { status: 400 });
    }

    const stateDef: StateDef = {
      states: def.states as StateDef['states'],
      initialState: def.initialState,
      transitions: def.transitions as StateDef['transitions'],
    };
    const check = validateStateTransition(stateDef, current, parsed.data.toState);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const [log] = await db
      .insert(instanceStateLog)
      .values({
        ontologyId,
        instanceId: id,
        fromState: current,
        toState: parsed.data.toState,
        actor: `user:${userId}`,
        reason: parsed.data.reason ?? null,
      })
      .returning();
    return NextResponse.json(log, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
