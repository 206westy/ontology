import { NextResponse } from 'next/server';
import { generateText, Output } from 'ai';
import { openai } from '@ai-sdk/openai';
import { LLM_MODELS, LLM_MAX_RETRIES } from '@/lib/llm/models';
import { z } from 'zod';
import {
  reviewProposal,
  buildReport,
  type CriticIssue,
  type ReviewInput,
} from '@/features/ontology/lib/critic/review';

// S2 — Critic 검수 라우트. 결정론 검수(빠름, reviewProposal) + LLM 정성 패스
// (모순 관계·정량 근거 부족). LLM 실패는 비치명적 — 결정론 결과만으로도 유효.
// 검수는 제안만 한다(자동 확정 없음).

const proposalSchema = z.object({
  classes: z
    .array(
      z.object({
        name: z.string(),
        type: z.string().nullish(),
        description: z.string().optional(),
        evidence: z.string().optional(),
      }),
    )
    .default([]),
  instances: z
    .array(z.object({ name: z.string(), className: z.string().nullish() }))
    .default([]),
  relations: z
    .array(z.object({ source: z.string(), target: z.string(), type: z.string() }))
    .default([]),
});

const reviewRequestSchema = z.object({
  proposed: proposalSchema,
  existing: z
    .object({
      classNames: z.array(z.string()).default([]),
      instanceNames: z.array(z.string()).default([]),
    })
    .optional(),
});

// LLM 정성 패스는 두 종류만 보고하도록 제한(결정론이 잡는 것과 겹치지 않게).
const llmCriticResponseSchema = z.object({
  issues: z
    .array(
      z.object({
        kind: z.enum(['contradictory_relation', 'weak_modeling']),
        severity: z.enum(['high', 'med', 'low']),
        targetName: z.string(),
        relatedName: z.string().optional(),
        reason: z.string(),
        suggestion: z.string().optional(),
      }),
    )
    .default([]),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = reviewRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const input = parsed.data as ReviewInput;
    const deterministic = reviewProposal(input);

    let llmIssues: CriticIssue[] = [];
    let llmReviewFailed = false;
    try {
      llmIssues = await reviewQualitative(input);
    } catch {
      // 결정론 결과는 LLM 실패와 무관하게 유효하지만, M4: 정성 검토가 실패했음을
      // 조용히 숨기지 않고 알린다(부분 검토를 "완전"으로 위장하지 않음).
      llmReviewFailed = true;
      llmIssues = [];
    }

    const report = buildReport([...deterministic.issues, ...llmIssues]);
    return NextResponse.json({
      report,
      ...(llmReviewFailed ? { llmReviewFailed: true } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function reviewQualitative(input: ReviewInput): Promise<CriticIssue[]> {
  const { proposed } = input;
  const nodeLines = [
    ...proposed.classes.map(
      (c) => `- 클래스 ${c.name}${c.type ? ` (상위: ${c.type})` : ''}${c.description ? ` — ${c.description}` : ''}`,
    ),
    ...proposed.instances.map((i) => `- 인스턴스 ${i.name}${i.className ? ` (클래스: ${i.className})` : ''}`),
  ].join('\n');
  const relLines = proposed.relations
    .map((r) => `- ${r.source} —[${r.type}]→ ${r.target}`)
    .join('\n');

  const system = `너는 온톨로지 모델 수호자(Critic)다. 제안된 추출 결과에서 정성 판단이 필요한 문제만 보고한다. 허용 종류:
- contradictory_relation: 서로 모순되는 관계(예: A가 B를 유발한다 + A가 B를 억제한다)나 방향이 뒤집힌 관계.
- weak_modeling: 정성 서술만 있고 정량 근거/제약(임계치·방향·단위)이 빠진 관계나 노드(예: "낮을수록 좋다").
중복·고립·미정의·별모양은 별도 처리되니 보고하지 마라. 거짓 양성을 낮게 유지하고, 해당 없으면 빈 목록을 반환하라.`;

  const user = `노드:\n${nodeLines || '(없음)'}\n\n관계:\n${relLines || '(없음)'}`;

  const result = await generateText({
    model: openai(LLM_MODELS.primary),
    providerOptions: { openai: { reasoningEffort: 'low', textVerbosity: 'low' } },
    maxOutputTokens: 8000,
    maxRetries: LLM_MAX_RETRIES,
    output: Output.object({ schema: llmCriticResponseSchema }),
    system,
    prompt: user,
  });

  const issues = result.output?.issues ?? [];
  return issues.map((i) => ({ ...i, ruleId: `llm-${i.kind}` }));
}
