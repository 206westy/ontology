import { NextRequest, NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { LLM_MODELS } from '@/lib/llm/models';
import { getDb } from '@/lib/drizzle';
import {
  problems,
  problemDatasets,
  datasetColumns,
} from '@/lib/drizzle/schema';
import { getWorkspaceScope } from '@/lib/authz/getWorkspaceScope';
import { handleApiError } from '@/lib/api-error';
import { classifyProblemType, getTemplate } from '@/lib/copilot/templates';
import { scoreSufficiency } from '@/lib/copilot/sufficiency';

const reqSchema = z.object({ problemId: z.string().uuid() });

// PRD-PF-E M3(핵심): 데이터 충분성 진단. 결정론 룰 우선(필수컬럼 매트릭스), LLM 은 미매칭 의미매칭만.
export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await getWorkspaceScope(request);
    const body = await request.json();
    const parsed = reqSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const db = await getDb();
    const [problem] = await db
      .select()
      .from(problems)
      .where(and(eq(problems.id, parsed.data.problemId), eq(problems.workspaceId, workspaceId)))
      .limit(1);
    if (!problem) {
      return NextResponse.json({ error: '문제를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 연결된 데이터셋의 컬럼명 수집.
    const pds = await db
      .select({ datasetId: problemDatasets.datasetId })
      .from(problemDatasets)
      .where(eq(problemDatasets.problemId, problem.id));
    const datasetIds = pds.map((p) => p.datasetId);
    const cols =
      datasetIds.length > 0
        ? await db
            .select({ name: datasetColumns.name })
            .from(datasetColumns)
            .where(inArray(datasetColumns.datasetId, datasetIds))
        : [];
    const columnNames = Array.from(new Set(cols.map((c) => c.name)));

    // 문제 유형 분류(결정론).
    const goal = (problem.goalMetric ?? {}) as { name?: string };
    const dq = (problem.decisionQuestions ?? []) as { question?: string }[];
    const context = [
      problem.title,
      problem.description,
      goal.name ?? '',
      dq.map((q) => q.question ?? '').join(' '),
    ].join(' ');
    const problemType = classifyProblemType(context);
    const template = getTemplate(problemType);

    if (!template) {
      // 커버리지 밖 → 지어내지 않고 '모름' + 안내.
      return NextResponse.json({
        problemType: 'unknown',
        verdict: '모름',
        score: 0,
        requiredColumns: [],
        missing: [],
        evidence: [
          '이 문제 유형은 템플릿 라이브러리(SPC/FDC/정비/출하) 밖입니다. 충분성을 단정하지 않습니다.',
        ],
        columnNames,
      });
    }

    const result = scoreSufficiency(template, columnNames);

    // LLM 의미 매칭(선택·방어): 미매칭 역할이 있고 남은 컬럼이 있을 때만. 실패 시 결정론 결과 그대로.
    const unmatchedCols = columnNames.filter(
      (c) => !result.requiredColumns.some((r) => r.matchedTo === c),
    );
    if (result.missing.length > 0 && unmatchedCols.length > 0) {
      try {
        const llm = await generateObject({
          model: openai(LLM_MODELS.mini),
          schema: z.object({
            matches: z.array(
              z.object({
                role: z.string(),
                column: z.string().nullable(), // 없으면 null(지어내지 말 것)
              }),
            ),
          }),
          system:
            '너는 데이터 컬럼 의미 매칭 보조자다. 주어진 "필수 역할"에 의미상 대응하는 컬럼명을 후보 컬럼에서만 고른다. 애매하면 null. 지어내지 마라.',
          prompt: `필수 역할: ${result.missing.map((m) => m.what).join(', ')}\n후보 컬럼: ${unmatchedCols.join(', ')}`,
          temperature: 0,
        });
        for (const m of llm.object.matches) {
          if (!m.column || !unmatchedCols.includes(m.column)) continue;
          const rc = result.requiredColumns.find((r) => r.role === m.role && !r.present);
          if (rc) {
            rc.present = true;
            rc.matchedTo = m.column;
            result.evidence.push(`${rc.role} ← "${m.column}" (AI 의미매칭)`);
          }
        }
        // 재계산.
        const matched = result.requiredColumns.filter((r) => r.present).length;
        result.score = Math.round((matched / result.requiredColumns.length) * 100);
        result.verdict = result.score >= 80 ? '충분' : '부족';
        result.missing = result.requiredColumns
          .filter((r) => !r.present)
          .map((r) => ({ what: r.role, why: r.why, howToGet: r.howToGet }));
      } catch {
        /* LLM 실패 → 결정론 결과 유지(환각·비용 방어) */
      }
    }

    return NextResponse.json({ ...result, columnNames });
  } catch (err) {
    return handleApiError(err);
  }
}
