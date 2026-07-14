import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';
import { suggestSpc } from '@/lib/spc/suggest';

// PRD-PF-F M5: 관리도·룰셋 AI 초안(결정론 코어). 산출은 초안 — 엔지니어 확정 전 미적용(HITL).
const requestSchema = z.object({
  dataType: z.enum(['continuous', 'discrete', 'proportion', 'count', 'unknown']).optional(),
  hasSubgroups: z.boolean().optional(),
  subgroupSize: z.number().int().optional(),
  sampleValues: z.array(z.number()).optional(),
  distinctCount: z.number().int().optional(),
  name: z.string().optional(),
  unit: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    await getOntologyScope(request);
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ suggestion: suggestSpc(parsed.data), draft: true });
  } catch (err) {
    return handleApiError(err);
  }
}
