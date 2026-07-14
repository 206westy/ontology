import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import { spcRuns, controlLimits } from '@/lib/drizzle/schema';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';

// PRD-PF-G: 관리도 위젯 데이터 소스 — spc_runs 시계열 + 최신 관리한계(UCL/LCL/CL).
export async function GET(request: NextRequest) {
  try {
    const { ontologyId } = await getOntologyScope(request);
    const { searchParams } = new URL(request.url);
    const functionId = searchParams.get('functionId');
    const propertyId = searchParams.get('propertyId');
    const limit = Math.min(Number(searchParams.get('limit') ?? 200) || 200, 1000);

    const clauses = [eq(spcRuns.ontologyId, ontologyId)];
    if (functionId) clauses.push(eq(spcRuns.functionId, functionId));
    if (propertyId) clauses.push(eq(spcRuns.propertyId, propertyId));

    const db = await getDb();
    const runs = await db.query.spcRuns.findMany({
      where: and(...clauses),
      orderBy: (r, { asc }) => [asc(r.evaluatedAt)],
      limit,
    });

    const points = runs.map((r, i) => {
      const ev = (r.evidence ?? {}) as { value?: number };
      return {
        label: r.lotId ?? String(i + 1),
        value: typeof ev.value === 'number' ? ev.value : 0,
        verdict: r.verdict as 'pass' | 'warn' | 'fail',
        violatedRules: (r.violatedRules ?? []) as string[],
      };
    });

    // 관리한계: 최신 run 의 control_limit_id(모두 동일 한계 공유).
    let ucl: number | null = null;
    let lcl: number | null = null;
    let centerline: number | null = null;
    let chartType: string | null = runs[runs.length - 1]?.chartType ?? null;
    const clId = runs.length > 0 ? runs[runs.length - 1].controlLimitId : null;
    if (clId) {
      const cl = await db.query.controlLimits.findFirst({
        where: and(eq(controlLimits.id, clId), eq(controlLimits.ontologyId, ontologyId)),
      });
      if (cl) {
        ucl = cl.ucl;
        lcl = cl.lcl;
        centerline = cl.centerline;
        chartType = cl.chartType;
      }
    }

    return NextResponse.json({ points, ucl, lcl, centerline, chartType });
  } catch (err) {
    return handleApiError(err);
  }
}
