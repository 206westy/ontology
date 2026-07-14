import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSessionId, logPatternEvent, logPatternEventOnce } from '../events';

// PRD-BM-D01 (M0-2): 계측 유틸. 세션 멱등 + once-guard + fire-and-forget 전송.

describe('events', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('getSessionId 는 세션 내 멱등(같은 id 반환)', () => {
    const a = getSessionId();
    const b = getSessionId();
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('logPatternEvent 는 /api/pattern-events 로 POST 하고 sessionId 를 실어 보낸다', () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 201 }));

    logPatternEvent({ eventType: 'pattern_seeded', patternId: 'p1', patternSource: 'cache' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/pattern-events');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body));
    expect(body.eventType).toBe('pattern_seeded');
    expect(body.patternSource).toBe('cache');
    expect(body.sessionId).toBe(getSessionId());
  });

  it('logPatternEventOnce 는 동일 이벤트를 세션당 1회만 전송한다', () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 201 }));

    logPatternEventOnce({ eventType: 'session_started' });
    logPatternEventOnce({ eventType: 'session_started' });
    logPatternEventOnce({ eventType: 'session_started' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('fetch 거부는 삼키고 흐름을 막지 않는다', () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    expect(() =>
      logPatternEvent({ eventType: 'free_input_started' }),
    ).not.toThrow();
  });
});
