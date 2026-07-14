// PRD-PF-F: SPC 관리도 상수(부분군 크기별). 산업 표준 표 — 재발명 금지, 테스트로 고정.
// a2(X-bar), d3/d4(R chart), d2(σ 추정), a3/b3/b4/c4(S chart 확장 여지).
interface SpcConst {
  a2: number;
  d3: number;
  d4: number;
  d2: number;
  a3: number;
  b3: number;
  b4: number;
  c4: number;
}

const TABLE: Record<number, SpcConst> = {
  2: { a2: 1.88, d3: 0, d4: 3.267, d2: 1.128, a3: 2.659, b3: 0, b4: 3.267, c4: 0.7979 },
  3: { a2: 1.023, d3: 0, d4: 2.574, d2: 1.693, a3: 1.954, b3: 0, b4: 2.568, c4: 0.8862 },
  4: { a2: 0.729, d3: 0, d4: 2.282, d2: 2.059, a3: 1.628, b3: 0, b4: 2.266, c4: 0.9213 },
  5: { a2: 0.577, d3: 0, d4: 2.114, d2: 2.326, a3: 1.427, b3: 0, b4: 2.089, c4: 0.94 },
  6: { a2: 0.483, d3: 0, d4: 2.004, d2: 2.534, a3: 1.287, b3: 0.03, b4: 1.97, c4: 0.9515 },
  7: { a2: 0.419, d3: 0.076, d4: 1.924, d2: 2.704, a3: 1.182, b3: 0.118, b4: 1.882, c4: 0.9594 },
  8: { a2: 0.373, d3: 0.136, d4: 1.864, d2: 2.847, a3: 1.099, b3: 0.185, b4: 1.815, c4: 0.965 },
  9: { a2: 0.337, d3: 0.184, d4: 1.816, d2: 2.97, a3: 1.032, b3: 0.239, b4: 1.761, c4: 0.9693 },
  10: { a2: 0.308, d3: 0.223, d4: 1.777, d2: 3.078, a3: 0.975, b3: 0.284, b4: 1.716, c4: 0.9727 },
};

// 개별값(I-MR) 이동범위(연속 2점) 상수.
export const MR_D2 = 1.128; // d2(n=2)
export const I_MR_E2 = 2.66; // 3/d2 (개별값 관리한계)
export const MR_D4 = 3.267; // D4(n=2) 이동범위 관리한계

export function spcConst(n: number): SpcConst {
  const c = TABLE[n];
  if (!c) throw new Error(`지원하지 않는 부분군 크기 n=${n} (2~10 지원)`);
  return c;
}

export function isSubgroupSizeSupported(n: number): boolean {
  return Number.isInteger(n) && n >= 2 && n <= 10;
}
