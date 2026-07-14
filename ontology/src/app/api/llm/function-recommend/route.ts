import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/lib/drizzle';
import { problems } from '@/lib/drizzle/schema';
import { getWorkspaceScope } from '@/lib/authz/getWorkspaceScope';
import { handleApiError } from '@/lib/api-error';
import { classifyProblemType, getTemplate } from '@/lib/copilot/templates';

const reqSchema = z.object({ problemId: z.string().uuid() });

// PRD-PF-E M5(핵심): 문제유형 → 키네틱 함수 템플릿 추천(결정론). 근거(템플릿 ID) 표기.
// 자연어 규칙 → AST 초안은 기존 /api/llm/function-draft 재사용(ruleSeed 를 그대로 전달).
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
      // 커버리지 밖 → 조건식 임의 창작 금지, 수동 작성 안내.
      return NextResponse.json({
        problemType: 'unknown',
        coverage: false,
        recommendations: [],
        guidance:
          '이 문제 유형은 함수 템플릿 라이브러리(SPC/FDC/정비/출하) 밖입니다. 스튜디오의 "결정함수"에서 자연어로 직접 작성하세요.',
      });
    }

    return NextResponse.json({
      problemType: template.type,
      label: template.label,
      coverage: true,
      recommendations: template.functionTemplates.map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description,
        outputKind: f.outputKind,
        ruleSeed: f.ruleSeed,
        rationale: `문제유형 "${template.label}" 매칭 · 템플릿 ${f.id}`,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
