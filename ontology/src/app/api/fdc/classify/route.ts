import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';
import { detectThreshold, detectTrend } from '@/lib/fdc/detect';

// PRD-PF-F M1/M4: FDC 이상탐지 엔진 인터페이스(순수 계산). 단변량(임계·트렌드)만 — 다변량 스코프 밖.
const requestSchema = z.object({
  method: z.enum(['threshold', 'trend']),
  values: z.array(z.number()),
  params: z
    .object({
      upper: z.number().nullable().optional(),
      lower: z.number().nullable().optional(),
      jumpThreshold: z.number().nullable().optional(),
      driftSlopeThreshold: z.number().nullable().optional(),
      window: z.number().int().positive().optional(),
    })
    .default({}),
});

export async function POST(request: NextRequest) {
  try {
    await getOntologyScope(request);
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { method, values, params } = parsed.data;
    const result =
      method === 'threshold'
        ? detectThreshold({ values, upper: params.upper ?? null, lower: params.lower ?? null })
        : detectTrend({
            values,
            jumpThreshold: params.jumpThreshold ?? null,
            driftSlopeThreshold: params.driftSlopeThreshold ?? null,
            window: params.window,
          });
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
