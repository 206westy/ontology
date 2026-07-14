// PRD-PF-I §5-2: 자동화 폭주 가드. 시간당 최대 실행 + 쿨다운. 순수(now·이력을 주입 → 테스트 가능).
export interface RateLimit {
  max_runs_per_hour?: number;
  cooldown_seconds?: number;
}
export interface RateCheck {
  allowed: boolean;
  reason?: string;
}

export function checkRateLimit(
  recentRunEpochMs: number[],
  now: number,
  rateLimit: RateLimit,
): RateCheck {
  const hourAgo = now - 3_600_000;
  const inHour = recentRunEpochMs.filter((t) => t >= hourAgo).length;
  if (rateLimit.max_runs_per_hour != null && inHour >= rateLimit.max_runs_per_hour) {
    return { allowed: false, reason: '시간당 실행 한도 초과' };
  }
  if (rateLimit.cooldown_seconds != null && recentRunEpochMs.length > 0) {
    const last = Math.max(...recentRunEpochMs);
    if (now - last < rateLimit.cooldown_seconds * 1000) {
      return { allowed: false, reason: '쿨다운 중' };
    }
  }
  return { allowed: true };
}
