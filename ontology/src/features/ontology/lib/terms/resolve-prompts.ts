import { buildContextQuery, type ContextQueryInput } from './context-query';

// PRD-H (H4/M3): 맥락 주입형 용어 해소 프롬프트(primary). 핵심 —
// 키워드 단독 금지. 도메인 + 인접 노드 + 후보 타입을 반드시 주입해 뜻을 좁힌다.
// 도메인-스코프: "이 도메인에서의 뜻"만 판정하고 전역 사실로 확정하지 않는다.

export function buildResolveSystem(): string {
  return `너는 온톨로지 용어 해소기다. 미정의·모호 용어(약어·은어)를 "현재 도메인 맥락"에 맞는 뜻으로 좁힌다.
- 반드시 주입된 도메인 + 인접 노드 + 후보 타입을 근거로 삼는다(키워드 단독 판단 금지).
- 이 도메인에서의 뜻만 판정한다(전역 사실 확정 금지).
- 후보(랭킹된 뜻)로 제시한다: meaning, confidence(0~1), source('context'), rationale(왜 이 뜻인지: 어떤 인접 맥락을 근거로 했는지).
- 근거가 약하면 confidence 를 낮춘다. 자신 없으면 후보를 비운다(빈 배열 허용).`;
}

// 웹 스니펫(opt-in)이 있으면 함께 넘겨 맥락에 근거하도록 유도한다.
export function buildResolveUser(
  input: ContextQueryInput,
  webSnippets: string[] = [],
): string {
  const parts = [
    `해소할 용어: ${input.term}`,
    `맥락 질의: ${buildContextQuery(input)}`,
  ];
  if (webSnippets.length > 0) {
    parts.push(`웹 스니펫(미검증, 참고만):\n${webSnippets.join('\n')}`);
  }
  parts.push('이 도메인 맥락에 맞는 뜻 후보를 랭킹해 제시하라.');
  return parts.join('\n\n');
}
