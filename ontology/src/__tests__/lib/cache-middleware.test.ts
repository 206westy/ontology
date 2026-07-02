import { describe, it, expect, vi } from 'vitest';
import {
  createTtlCache,
  parseCacheMiddleware,
} from '@/lib/llm/cache-middleware';

// PRD-F P1-2: 동일 입력 재요청 시 캐시 적중(LLM 비호출), 1글자 변경 시 미스, TTL 만료.
describe('createTtlCache', () => {
  it('적중/미스 기본 동작', () => {
    const cache = createTtlCache<number>();
    expect(cache.get('a')).toBeUndefined();
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('TTL 경과 후 미스 (주입 clock 으로 결정적 검증)', () => {
    let t = 1_000;
    const cache = createTtlCache<number>({ ttlMs: 100, now: () => t });
    cache.set('a', 1);
    t = 1_050;
    expect(cache.get('a')).toBe(1); // 아직 유효
    t = 1_200;
    expect(cache.get('a')).toBeUndefined(); // 만료
  });

  it('max 초과 시 가장 오래된 항목 축출 (LRU)', () => {
    const cache = createTtlCache<number>({ max: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // a 를 최근 사용으로 승격
    cache.set('c', 3); // b 가 가장 오래됨 → 축출
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });
});

describe('parseCacheMiddleware', () => {
  const makeResult = (text: string) =>
    ({ content: [{ type: 'text', text }] }) as never;

  it('동일 params 재호출 시 doGenerate 미호출(적중) + 같은 결과', async () => {
    const params = { prompt: '문서 A', temperature: 0 } as never;
    const doGenerate = vi.fn(async () => makeResult('r1'));

    const first = await parseCacheMiddleware.wrapGenerate!({
      doGenerate,
      params,
    } as never);
    const second = await parseCacheMiddleware.wrapGenerate!({
      doGenerate,
      params,
    } as never);

    expect(doGenerate).toHaveBeenCalledTimes(1); // 2번째는 캐시 적중
    expect(second).toBe(first);
  });

  it('입력 1글자 변경 시 미스(doGenerate 재호출)', async () => {
    const doGenerate = vi.fn(async () => makeResult('r'));

    await parseCacheMiddleware.wrapGenerate!({
      doGenerate,
      params: { prompt: '문서 X' } as never,
    } as never);
    await parseCacheMiddleware.wrapGenerate!({
      doGenerate,
      params: { prompt: '문서 Y' } as never,
    } as never);

    expect(doGenerate).toHaveBeenCalledTimes(2);
  });
});
