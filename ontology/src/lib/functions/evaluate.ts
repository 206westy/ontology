import { z } from 'zod';
import { evaluateAst, type AstNode, type AstValue, type Bindings } from './ast';

// PRD-PF-B: 함수 입출력 계약(Tier1/Tier2 공통). 판정은 통과/스코어/추천 3종 + 근거.

export const functionInputSchema = z.object({
  propertyId: z.string().uuid(),
  alias: z.string().min(1),
});
export type FunctionInput = z.infer<typeof functionInputSchema>;

export const outputSpecSchema = z.union([
  z.object({
    kind: z.literal('pass_fail'),
    passLabel: z.string().optional(),
    failLabel: z.string().optional(),
  }),
  z.object({
    kind: z.literal('score'),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  z.object({ kind: z.literal('recommend'), labels: z.array(z.string()).optional() }),
]);
export type OutputSpec = z.infer<typeof outputSpecSchema>;

export interface Verdict {
  kind: 'pass_fail' | 'score' | 'recommend';
  pass?: boolean;
  score?: number;
  label?: string;
  recommendation?: string;
  raw: AstValue;
}

/** 안정 직렬화(키 정렬) — 동일 내용→동일 문자열(결정론 해시 전제). */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys.map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') +
    '}'
  );
}

/** djb2 (순수 JS·런타임 무관·테스트 가능). 결정론 재현 검증용 input_hash. */
export function hashInput(snapshot: Record<string, AstValue>): string {
  const s = canonicalize(snapshot);
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function normalizeVerdict(raw: AstValue, spec: OutputSpec): Verdict {
  if (spec.kind === 'pass_fail') {
    const pass = typeof raw === 'boolean' ? raw : raw !== null && raw !== 0 && raw !== '';
    return {
      kind: 'pass_fail',
      pass,
      label: pass ? (spec.passLabel ?? '통과') : (spec.failLabel ?? '불통과'),
      raw,
    };
  }
  if (spec.kind === 'score') {
    let score = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isNaN(score)) score = 0;
    if (spec.min != null) score = Math.max(spec.min, score);
    if (spec.max != null) score = Math.min(spec.max, score);
    return { kind: 'score', score, raw };
  }
  const recommendation = raw == null ? '' : String(raw);
  return { kind: 'recommend', recommendation, label: recommendation, raw };
}

export interface EvaluateResult {
  verdict: Verdict;
  inputSnapshot: Record<string, AstValue>;
  inputHash: string;
}

/**
 * 순수 평가: 함수 정의(logic AST + output_spec) + 바인딩(alias→속성값).
 * 부작용 없음(DB write 는 엔진 밖 적재기 담당). 감사: inputSnapshot + inputHash.
 */
export function evaluateFunction(params: {
  logic: AstNode;
  outputSpec: OutputSpec;
  bindings: Bindings;
}): EvaluateResult {
  const raw = evaluateAst(params.logic, params.bindings);
  const inputSnapshot: Record<string, AstValue> = { ...params.bindings };
  return {
    verdict: normalizeVerdict(raw, params.outputSpec),
    inputSnapshot,
    inputHash: hashInput(inputSnapshot),
  };
}
