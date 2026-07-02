import type { GlossaryLookupFn } from './resolve';
import type { TermCandidate, TermGlossaryEntry } from './types';

// PRD-H (H4/M3): 용어집 캐시 유틸(PURE). 확정된 뜻을 도메인-스코프로 룩업하고,
// 같은 도메인의 이후 추출·검색 맥락에 재주입할 컨텍스트 블록을 만든다.
// 도메인-스코프 원칙: 다른 도메인 문서의 같은 약어에 이전 뜻을 전역 강제하지 않는다.

function matchesTerm(entry: TermGlossaryEntry, term: string): boolean {
  return entry.term.trim().toLowerCase() === term.trim().toLowerCase();
}

// 도메인-스코프 룩업 함수 생성. resolve 오케스트레이터의 ① 단계에 주입한다.
export function makeGlossaryLookup(
  entries: TermGlossaryEntry[],
): GlossaryLookupFn {
  return (domain, term): TermCandidate | null => {
    const match = entries.find(
      (e) => e.domain === domain && matchesTerm(e, term),
    );
    if (!match) return null;
    return {
      term: match.term,
      meaning: match.meaning,
      // 확정 캐시는 높은 신뢰(명시값 없으면 1).
      confidence: match.confidence ?? 1,
      source: 'internal',
      rationale: match.evidence?.trim()
        ? `내부 용어집: ${match.evidence.trim()}`
        : '내부 용어집(이 도메인에서 확정된 뜻)',
    };
  };
}

// 재주입 헬퍼(핵심): 특정 도메인의 용어집으로 이후 추출·검색에 주입할 맥락 블록을 만든다.
// 반환 문자열을 parse 파이프라인의 existingSchema/patternContext 에 덧붙여
// 같은 세션·구획에서 `VV=밸브`가 일관 적용되게 한다. 비면 빈 문자열.
export function buildGlossaryInjectionBlock(
  domain: string,
  entries: TermGlossaryEntry[],
): string {
  const scoped = entries.filter((e) => e.domain === domain);
  if (scoped.length === 0) return '';
  const lines = scoped.map((e) => `- ${e.term} = ${e.meaning}`);
  return [
    '이 도메인에서 확정된 용어(추출·검색 맥락에 반드시 반영):',
    ...lines,
  ].join('\n');
}
