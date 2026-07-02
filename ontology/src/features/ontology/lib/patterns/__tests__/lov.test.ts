import { describe, it, expect, vi } from 'vitest';
import { createLovSource } from '../discovery/lov';

// LOV 소스는 절대 라이브 네트워크를 치지 않는다 — fetch 를 주입/목킹.
describe('createLovSource', () => {
  it('maps LOV vocabulary hits to seeds', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            prefix: 'ssn',
            uri: 'http://www.w3.org/ns/ssn/',
            titles: [{ value: 'Semantic Sensor Network', lang: 'en' }],
            descriptions: [{ value: 'sensors and observations', lang: 'en' }],
            tags: ['IoT'],
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const source = createLovSource(fetchImpl);
    const seeds = await source.search('sensor', '센서');

    expect(seeds).toHaveLength(1);
    expect(seeds[0].repo).toBe('LOV');
    expect(seeds[0].uri).toBe('http://www.w3.org/ns/ssn/');
    expect(seeds[0].label).toContain('ssn');
    expect(seeds[0].license).toBeNull();
  });

  it('returns empty when fetch rejects (network/TLS failure)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ENOTFOUND')) as unknown as typeof fetch;
    const source = createLovSource(fetchImpl);
    expect(await source.search('x', '')).toEqual([]);
  });

  it('returns empty on a non-200 response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch;
    const source = createLovSource(fetchImpl);
    expect(await source.search('x', '')).toEqual([]);
  });
});
