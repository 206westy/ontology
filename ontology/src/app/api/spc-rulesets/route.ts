import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/lib/drizzle';
import { spcRulesets } from '@/lib/drizzle/schema';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';
import { WESTERN_ELECTRIC, NELSON } from '@/lib/spc/rules';

const RULE_KEYS = new Set<string>([...WESTERN_ELECTRIC, ...NELSON]);

// PRD-PF-F: 적용 룰셋(Western Electric/Nelson on/off) 등록·재사용. 온톨로지 스코프.
export async function GET(request: NextRequest) {
  try {
    const { ontologyId } = await getOntologyScope(request);
    const db = await getDb();
    const rows = await db.query.spcRulesets.findMany({
      where: eq(spcRulesets.ontologyId, ontologyId),
      orderBy: (r, { desc }) => [desc(r.createdAt)],
    });
    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  rulesEnabled: z
    .array(z.string())
    .default(['WE1', 'WE2', 'WE3', 'WE4'])
    .refine((rs) => rs.every((r) => RULE_KEYS.has(r)), {
      message: '알 수 없는 룰 키',
    }),
  ownerFunctionId: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { ontologyId, userId } = await getOntologyScope(request, 'editor');
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const db = await getDb();
    const [row] = await db
      .insert(spcRulesets)
      .values({
        ontologyId,
        name: parsed.data.name,
        rulesEnabled: parsed.data.rulesEnabled,
        ownerFunctionId: parsed.data.ownerFunctionId ?? null,
        createdBy: userId,
      })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
