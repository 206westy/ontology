// PRD-F P4-2: web 보강 주장 검증. 인용 페이지가 그 주장을 실제로 지지하는지
// LLM-as-judge 로 0/1 판정한다. 통과만 web 제안으로 남기고 실패는 드롭한다.
// 지지 스팬을 evidence 로 부착해 "검증 필요" 배지만 달던 기존 동작을 실증으로 대체.
import { generateText, Output } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { LLM_MODELS, LLM_MAX_RETRIES } from '@/lib/llm/models';

const verdictSchema = z.object({
  // 페이지 내용이 대상 개념을 실제로 정의/설명하며 주장을 지지하는가.
  supported: z.boolean(),
  // 지지 근거가 되는 페이지 내 verbatim 스팬. 미지지면 빈 문자열.
  supportingSpan: z.string(),
});

export type WebClaimVerdict = z.infer<typeof verdictSchema>;

// subject(대상 개념)에 대해 pageContent 가 실제 지지 근거인지 판정.
export async function verifyWebClaim(
  subject: string,
  pageTitle: string,
  pageContent: string,
): Promise<WebClaimVerdict> {
  const system = `You are a strict fact-checker. Decide whether the given web page content actually supports being a definition/description of the SUBJECT.
Rules:
- supported=true ONLY if the page substantively describes the subject (not a coincidental keyword match, not an unrelated page).
- supportingSpan: copy the verbatim span from the page that supports it. If not supported, return "".
- Default to supported=false when the connection is weak, ambiguous, or the page is off-topic.`;

  const prompt = [
    `Subject: ${subject}`,
    `Page title: ${pageTitle}`,
    `Page content:\n"""\n${pageContent.slice(0, 2000)}\n"""`,
  ].join('\n\n');

  const result = await generateText({
    model: openai(LLM_MODELS.primary),
    providerOptions: { openai: { reasoningEffort: 'low', textVerbosity: 'low' } },
    maxOutputTokens: 1000,
    maxRetries: LLM_MAX_RETRIES,
    output: Output.object({ schema: verdictSchema }),
    system,
    prompt,
  });

  const v = result.output;
  if (!v) return { supported: false, supportingSpan: '' };
  // 지지라면서 스팬이 없으면 불충분으로 간주(과신 방지).
  if (v.supported && !v.supportingSpan.trim()) {
    return { supported: false, supportingSpan: '' };
  }
  return v;
}
