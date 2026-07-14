// PRD-BM-D01 (M0): 패턴 마켓플레이스 계측 클라이언트 유틸.
// 세션/시딩/커밋 이벤트를 서버(/api/pattern-events)로 흘려 TTFG·활성화 델타를 측정한다.
// fire-and-forget: 계측 실패가 사용자 흐름을 막지 않는다(조용히 무시하되 삼키진 않음 — console.warn).

export type PatternEventType =
  | 'session_started'
  | 'free_input_started'
  | 'pattern_seeded'
  | 'first_commit';

export type PatternSource = 'cache' | 'discovered' | 'shared';

export interface PatternEventInput {
  eventType: PatternEventType;
  patternId?: string | null;
  patternSource?: PatternSource | null;
  partitionId?: string | null;
  props?: Record<string, unknown>;
}

const SESSION_KEY = 'onto:pattern-session-id';

// 세션 식별자: TTFG 코호트 기준. 탭 세션(sessionStorage) 단위로 멱등 생성.
export function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `sess-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    window.sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    // sessionStorage 불가(사생활 모드 등) — 휘발 id 로 폴백.
    return `sess-${Date.now()}`;
  }
}

// 세션당 1회만 보내야 하는 이벤트(session_started, first_commit) 중복 억제.
const onceGuard = new Set<string>();

function onceKey(sessionId: string, eventType: PatternEventType): string {
  return `${sessionId}:${eventType}`;
}

/** 이벤트를 서버로 전송(fire-and-forget). 실패는 흐름을 막지 않는다. */
export function logPatternEvent(input: PatternEventInput): void {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
  try {
    const sessionId = getSessionId();
    const body = JSON.stringify({ ...input, sessionId });
    void fetch('/api/pattern-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch((err) => {
      console.warn('[pattern-events] 계측 전송 실패(무시):', err);
    });
  } catch (err) {
    // 동기 throw(잘못된 URL 등)도 흐름을 막지 않는다.
    console.warn('[pattern-events] 계측 스킵:', err);
  }
}

/** 세션당 1회 이벤트(중복 억제). 이미 보냈으면 무시. */
export function logPatternEventOnce(input: PatternEventInput): void {
  if (typeof window === 'undefined') return;
  const key = onceKey(getSessionId(), input.eventType);
  if (onceGuard.has(key)) return;
  onceGuard.add(key);
  logPatternEvent(input);
}
