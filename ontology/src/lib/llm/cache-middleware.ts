// PRD-F P1-2: parse 결정성·재현성. 동일 입력(같은 프롬프트=입력텍스트+스키마
// 컨텍스트+system+모델)에 대해 LLM 을 재호출하지 않고 이전 결과를 그대로 돌려
// bit-identical 재현을 보장한다.
//
// AI SDK 6 의 공식 패턴(wrapLanguageModel + LanguageModelMiddleware.wrapGenerate)을
// 쓴다. cacheKey = JSON.stringify(params) 라 프롬프트가 1글자만 달라도 자연 미스이며,
// 수동 해시 키를 만들 필요가 없어 드리프트가 없다. Redis 는 제외(감사 M9) — 단일
// 인스턴스용 인메모리 TTL+LRU 로 충분하다(재시작 시 소멸, 입력 변경 시 자연 미스).
import type { LanguageModelMiddleware } from 'ai';

type GenerateResult = Awaited<
  ReturnType<
    Parameters<NonNullable<LanguageModelMiddleware['wrapGenerate']>>[0]['doGenerate']
  >
>;

const DEFAULT_TTL_MS = 10 * 60_000; // 10분
const DEFAULT_MAX_ENTRIES = 200;

export interface TtlCache<V> {
  get(key: string): V | undefined;
  set(key: string, value: V): void;
  size(): number;
}

// 삽입 순서 기반 LRU + 항목별 만료. clock 을 주입받아 TTL 을 결정적으로 테스트한다.
export function createTtlCache<V>(opts?: {
  ttlMs?: number;
  max?: number;
  now?: () => number;
}): TtlCache<V> {
  const ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;
  const max = opts?.max ?? DEFAULT_MAX_ENTRIES;
  const now = opts?.now ?? Date.now;
  const map = new Map<string, { value: V; expiresAt: number }>();

  return {
    get(key) {
      const entry = map.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        map.delete(key);
        return undefined;
      }
      // 최근 사용으로 승격(LRU): 삭제 후 재삽입해 순서를 뒤로.
      map.delete(key);
      map.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      if (map.has(key)) map.delete(key);
      map.set(key, { value, expiresAt: now() + ttlMs });
      while (map.size > max) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
    },
    size() {
      return map.size;
    },
  };
}

const parseCache = createTtlCache<GenerateResult>();

export const parseCacheMiddleware: LanguageModelMiddleware = {
  wrapGenerate: async ({ doGenerate, params }) => {
    const key = JSON.stringify(params);
    const hit = parseCache.get(key);
    if (hit) return hit;
    const result = await doGenerate();
    parseCache.set(key, result);
    return result;
  },
};
