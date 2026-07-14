import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import { spcRuns, actionItems } from '@/lib/drizzle/schema';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';

// PRD-PF-H M5: 제안형 에이전트(AIP Agents 대응). 이상 감지 → proposal 생성 → 액션보드(PRD-G).
// ★자율실행 금지·읽기전용★: 그래프(Neo4j)를 1비트도 변경하지 않는다. 판정 결과만 읽고
// action_items(미확정/pending) 제안만 적재. 확정은 사람(HITL). 이 라우트는 Neo4j 를 임포트하지 않는다.
export async function POST(request: NextRequest) {
  try {
    const { ontologyId } = await getOntologyScope(request, 'editor');
    const db = await getDb();

    // 감지: 이상 SPC 판정(fail/warn).
    const runs = await db.query.spcRuns.findMany({
      where: and(
        eq(spcRuns.ontologyId, ontologyId),
        inArray(spcRuns.verdict, ['fail', 'warn']),
      ),
      orderBy: (r, { desc }) => [desc(r.evaluatedAt)],
      limit: 200,
    });

    // 중복 방지: 미해결(pending/in_review) 제안의 (대상 인스턴스 × 함수) 키.
    const open = await db.query.actionItems.findMany({
      where: and(
        eq(actionItems.ontologyId, ontologyId),
        inArray(actionItems.status, ['pending', 'in_review']),
      ),
      columns: { subjectInstanceId: true, sourceFunctionId: true },
    });
    const seen = new Set(open.map((a) => `${a.subjectInstanceId}:${a.sourceFunctionId}`));

    const proposals: (typeof actionItems.$inferInsert)[] = [];
    for (const run of runs) {
      const key = `${run.instanceId}:${run.functionId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ev = (run.evidence ?? {}) as { sigmaDistance?: number; value?: number };
      proposals.push({
        ontologyId,
        verdict: run.verdict,
        sourceFunctionId: run.functionId,
        subjectInstanceId: run.instanceId,
        score: typeof ev.sigmaDistance === 'number' ? Math.abs(ev.sigmaDistance) : null,
        evidence: {
          source: 'spc_run',
          spcRunId: run.id,
          chartType: run.chartType,
          violatedRules: run.violatedRules,
          value: ev.value ?? null,
          provenance: `spc_run:${run.id}`,
        },
        status: 'pending', // ★미확정 제안만★ — 확정은 사람
      });
    }

    if (proposals.length > 0) {
      await db.insert(actionItems).values(proposals);
    }

    return NextResponse.json({
      proposed: proposals.length,
      scanned: runs.length,
      note: '제안(미확정)만 생성 — 확정은 액션보드에서 사람이(HITL).',
    });
  } catch (err) {
    return handleApiError(err);
  }
}
