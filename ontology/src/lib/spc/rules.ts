// PRD-PF-F: 이상판정 룰. Western Electric 4룰(기본) + Nelson 8룰(옵션, 과탐 경고).
// 입력은 중심선 기준 부호 있는 σ 거리(sigmaDistance) 배열 — 관리도 종류 무관하게 통일.
import type { SpcVerdict } from './types';

export const WESTERN_ELECTRIC = ['WE1', 'WE2', 'WE3', 'WE4'] as const;
export const NELSON = [
  'NELSON1',
  'NELSON2',
  'NELSON3',
  'NELSON4',
  'NELSON5',
  'NELSON6',
  'NELSON7',
  'NELSON8',
] as const;

export const DEFAULT_RULES: string[] = [...WESTERN_ELECTRIC];
const FAIL_RULES = new Set(['WE1', 'NELSON1', 'RANGE']);

/** 룰 위반 → 판정. 3σ 초과(WE1/NELSON1)·산포이탈(RANGE)=fail, 그 외 패턴=warn. */
export function ruleSeverity(rules: string[]): SpcVerdict {
  if (rules.length === 0) return 'pass';
  return rules.some((r) => FAIL_RULES.has(r)) ? 'fail' : 'warn';
}

export function zoneOf(sd: number): string {
  const a = Math.abs(sd);
  const side = sd >= 0 ? '+' : '-';
  if (a > 3) return `beyond${side}`;
  if (a > 2) return `A${side}`;
  if (a > 1) return `B${side}`;
  return `C${side}`;
}

function windowAll(sd: number[], i: number, w: number, pred: (x: number) => boolean): boolean {
  if (i + 1 < w) return false;
  for (let j = i - w + 1; j <= i; j++) if (!pred(sd[j])) return false;
  return true;
}
function windowCount(sd: number[], i: number, w: number, pred: (x: number) => boolean): number {
  if (i + 1 < w) return 0;
  let c = 0;
  for (let j = i - w + 1; j <= i; j++) if (pred(sd[j])) c++;
  return c;
}
function strictlyMonotonic(sd: number[], i: number, w: number, up: boolean): boolean {
  if (i + 1 < w) return false;
  for (let j = i - w + 2; j <= i; j++) {
    if (up && !(sd[j] > sd[j - 1])) return false;
    if (!up && !(sd[j] < sd[j - 1])) return false;
  }
  return true;
}
function alternating(sd: number[], i: number, w: number): boolean {
  if (i + 1 < w) return false;
  for (let j = i - w + 3; j <= i; j++) {
    const d1 = sd[j] - sd[j - 1];
    const d0 = sd[j - 1] - sd[j - 2];
    if (d1 === 0 || d0 === 0 || Math.sign(d1) === Math.sign(d0)) return false;
  }
  return true;
}

/** 각 인덱스 → 위반 룰 키(패턴 완성 지점에 플래그). */
export function evaluateRules(sd: number[], enabled: string[]): Map<number, string[]> {
  const on = new Set(enabled);
  const out = new Map<number, string[]>();
  const add = (i: number, rule: string) => {
    const cur = out.get(i) ?? [];
    if (!cur.includes(rule)) cur.push(rule);
    out.set(i, cur);
  };
  const has = (k: string) => on.has(k);

  for (let i = 0; i < sd.length; i++) {
    // WE1 / NELSON1: 3σ 초과 (1점)
    if ((has('WE1') || has('NELSON1')) && Math.abs(sd[i]) > 3)
      add(i, has('WE1') ? 'WE1' : 'NELSON1');
    // WE2 / NELSON5: 연속 3점 중 2점이 같은 쪽 2σ 초과
    if (has('WE2') || has('NELSON5')) {
      if (windowCount(sd, i, 3, (x) => x > 2) >= 2 || windowCount(sd, i, 3, (x) => x < -2) >= 2)
        add(i, has('WE2') ? 'WE2' : 'NELSON5');
    }
    // WE3 / NELSON6: 연속 5점 중 4점이 같은 쪽 1σ 초과
    if (has('WE3') || has('NELSON6')) {
      if (windowCount(sd, i, 5, (x) => x > 1) >= 4 || windowCount(sd, i, 5, (x) => x < -1) >= 4)
        add(i, has('WE3') ? 'WE3' : 'NELSON6');
    }
    // WE4: 연속 8점 같은 쪽
    if (has('WE4') && (windowAll(sd, i, 8, (x) => x > 0) || windowAll(sd, i, 8, (x) => x < 0)))
      add(i, 'WE4');
    // NELSON2: 연속 9점 같은 쪽
    if (has('NELSON2') && (windowAll(sd, i, 9, (x) => x > 0) || windowAll(sd, i, 9, (x) => x < 0)))
      add(i, 'NELSON2');
    // NELSON3: 연속 6점 증가 또는 감소(추세)
    if (has('NELSON3') && (strictlyMonotonic(sd, i, 6, true) || strictlyMonotonic(sd, i, 6, false)))
      add(i, 'NELSON3');
    // NELSON4: 연속 14점 교대(진동)
    if (has('NELSON4') && alternating(sd, i, 14)) add(i, 'NELSON4');
    // NELSON7: 연속 15점 1σ 이내(과밀)
    if (has('NELSON7') && windowAll(sd, i, 15, (x) => Math.abs(x) < 1)) add(i, 'NELSON7');
    // NELSON8: 연속 8점 1σ 밖(양쪽, 중심 회피)
    if (has('NELSON8') && windowAll(sd, i, 8, (x) => Math.abs(x) > 1)) add(i, 'NELSON8');
  }
  return out;
}
