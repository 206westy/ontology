// PRD-I §3 배지 taxonomy. 색 = 판정 강도, semantic 토큰에 매핑.
// dedup 4종(기존 계승) + 상태 4종(신규). 신규 시각 언어 창작이 아니라 정규화.

export type VerdictKind =
  | 'reuse' // 동일 (기존 dedup)
  | 'relate' // 연관
  | 'possible_duplicate' // 중복 가능
  | 'new' // 신규
  | 'extend' // 확장 (신규)
  | 'fork' // 분기
  | 'pass' // 통과
  | 'block'; // 차단

export type VerdictTone = 'success' | 'info' | 'warning' | 'destructive' | 'muted';

interface VerdictMeta {
  label: string;
  tone: VerdictTone;
}

export const VERDICT_META: Record<VerdictKind, VerdictMeta> = {
  reuse: { label: '재사용', tone: 'success' },
  relate: { label: '연관', tone: 'info' },
  possible_duplicate: { label: '중복 가능', tone: 'warning' },
  new: { label: '신규', tone: 'muted' },
  extend: { label: '확장', tone: 'info' },
  fork: { label: '분기', tone: 'warning' },
  pass: { label: '통과', tone: 'success' },
  block: { label: '차단', tone: 'destructive' },
};

// semantic 토큰 클래스(라이트/다크 자동 대응). 하드코딩 팔레트 금지 — 토큰만.
export const VERDICT_TONE_CLASS: Record<VerdictTone, string> = {
  success: 'border-success/50 text-success',
  info: 'border-info/50 text-info',
  warning: 'border-warning/50 text-warning',
  destructive: 'border-destructive/50 text-destructive',
  muted: 'border-border text-muted-foreground',
};

// confidence는 원시 백분율 대신 정성 밴드로 노출한다.
// system-audit M6: AI confidence 원시값은 재현 불가능한 신호라 노출하지 않는다.
export type ConfidenceBand = 'high' | 'medium' | 'low';

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.85) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
}

export const CONFIDENCE_BAND_LABEL: Record<ConfidenceBand, string> = {
  high: '높음',
  medium: '보통',
  low: '낮음',
};
