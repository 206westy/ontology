// PRD-H (H4/M3): 맥락 주입 질의 빌더(PURE). 핵심 규칙 —
// 웹/맥락 해소 질의에 키워드만 던지지 않는다. 반드시 함께 주입한다:
//   도메인 + 현재 온톨로지 맥락(형제/인접 노드) + 후보 타입.
// 예) "VV" 단독 금지 → "반도체 설비 유지보수 맥락의 VV(부품 후보) — 인접 노드: 솔레노이드·에어 실린더".

export interface ContextQueryInput {
  term: string;
  domain: string;
  domainKo?: string | null;
  // 형제/인접 노드 이름(현재 온톨로지 맥락).
  adjacentNodes: string[];
  // 후보 타입(부품/파라미터/신호 등). 없으면 생략.
  candidateType?: string | null;
}

// 인접 노드는 질의 비대화 방지를 위해 상한을 둔다.
const MAX_ADJACENT = 6;

function domainLabel(input: ContextQueryInput): string {
  const ko = input.domainKo?.trim();
  return ko ? `${input.domainKo} (${input.domain})` : input.domain;
}

// 단일 맥락 질의 문자열. 도메인 + (후보 타입) + 인접 노드를 반드시 포함.
export function buildContextQuery(input: ContextQueryInput): string {
  const term = input.term.trim();
  const type = input.candidateType?.trim();
  const adjacent = input.adjacentNodes
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, MAX_ADJACENT);

  const head = type
    ? `${domainLabel(input)} 맥락의 ${term}(${type} 후보)`
    : `${domainLabel(input)} 맥락의 ${term}`;

  const parts = [head];
  if (adjacent.length > 0) parts.push(`인접 노드: ${adjacent.join('·')}`);
  return parts.join(' — ');
}

// H8-e 카드가 "무엇을 근거로 이 뜻을 골랐는지" 투명하게 보여줄 맥락 라인.
export function buildInjectedContextLines(input: ContextQueryInput): string[] {
  const lines = [`도메인: ${domainLabel(input)}`];
  const type = input.candidateType?.trim();
  if (type) lines.push(`후보 타입: ${type}`);
  const adjacent = input.adjacentNodes
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, MAX_ADJACENT);
  if (adjacent.length > 0) lines.push(`인접 노드: ${adjacent.join('·')}`);
  return lines;
}
