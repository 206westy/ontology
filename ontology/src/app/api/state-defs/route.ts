import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/lib/drizzle';
import { objectStateDefs } from '@/lib/drizzle/schema';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';
import { STATE_PRESETS } from '@/lib/automation/statemachine';

// PRD-PF-I M3: 상태머신 정의 목록/생성. 프리셋 3종(웨이퍼·작업지시·이상항목) 또는 커스텀.
export async function GET(request: NextRequest) {
  try {
    const { ontologyId } = await getOntologyScope(request);
    const db = await getDb();
    const rows = await db.query.objectStateDefs.findMany({
      where: eq(objectStateDefs.ontologyId, ontologyId),
    });
    return NextResponse.json({ defs: rows, presets: Object.keys(STATE_PRESETS) });
  } catch (err) {
    return handleApiError(err);
  }
}

const createSchema = z.object({
  classId: z.string().uuid(),
  preset: z.enum(['wafer', 'work_order', 'anomaly']).optional(),
  name: z.string().max(120).optional(),
  states: z.array(z.object({ key: z.string(), label: z.string().optional(), badge_style: z.string().optional() })).optional(),
  initialState: z.string().optional(),
  transitions: z.array(z.object({ from: z.string(), to: z.string(), trigger: z.string().optional() })).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { ontologyId, userId } = await getOntologyScope(request, 'editor');
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const preset = parsed.data.preset ? STATE_PRESETS[parsed.data.preset] : null;
    const name = parsed.data.name ?? preset?.name ?? '상태머신';
    const states = parsed.data.states ?? preset?.states;
    const initialState = parsed.data.initialState ?? preset?.initialState;
    const transitions = parsed.data.transitions ?? preset?.transitions;
    if (!states || !initialState || !transitions) {
      return NextResponse.json({ error: 'preset 또는 states/initialState/transitions 필요' }, { status: 400 });
    }

    const db = await getDb();
    const [row] = await db
      .insert(objectStateDefs)
      .values({ ontologyId, classId: parsed.data.classId, name, states, initialState, transitions, createdBy: userId })
      .onConflictDoUpdate({
        target: objectStateDefs.classId,
        set: { name, states, initialState, transitions },
      })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
