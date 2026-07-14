import { describe, it, expect } from 'vitest';
import { checkRateLimit } from '@/lib/automation/ratelimit';

const NOW = 1_000_000_000_000;

describe('checkRateLimit (자동화 폭주 가드)', () => {
  it('시간당 한도 초과 시 차단', () => {
    const runs = Array.from({ length: 12 }, (_, i) => NOW - i * 60_000); // 최근 1시간 12회
    expect(checkRateLimit(runs, NOW, { max_runs_per_hour: 12 }).allowed).toBe(false);
    expect(checkRateLimit(runs.slice(0, 11), NOW, { max_runs_per_hour: 12 }).allowed).toBe(true);
  });

  it('쿨다운 중이면 차단', () => {
    expect(checkRateLimit([NOW - 30_000], NOW, { cooldown_seconds: 60 }).allowed).toBe(false);
    expect(checkRateLimit([NOW - 90_000], NOW, { cooldown_seconds: 60 }).allowed).toBe(true);
  });

  it('한 시간 밖 실행은 카운트 제외', () => {
    const old = Array.from({ length: 20 }, (_, i) => NOW - 3_600_000 - i * 1000);
    expect(checkRateLimit(old, NOW, { max_runs_per_hour: 12 }).allowed).toBe(true);
  });

  it('제한 없으면 허용', () => {
    expect(checkRateLimit([NOW - 1000], NOW, {}).allowed).toBe(true);
  });
});
