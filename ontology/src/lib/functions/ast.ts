import { z } from 'zod';

// PRD-PF-B: 결정함수 로직은 선언적 AST(코드 아님). eval/new Function 금지, 화이트리스트 연산자만.
// 순수·결정론(동일 입력→동일 출력)·감사가능이 계약. 난수·시각·네트워크·전역상태 참조 불가.

export type AstValue = number | string | boolean | null;

export type BinaryOp =
  | '>' | '>=' | '<' | '<=' | '==' | '!='
  | '+' | '-' | '*' | '/' | '%';

export type AstNode =
  | { type: 'lit'; value: AstValue }
  | { type: 'var'; name: string }
  | { type: 'unary'; op: 'not' | 'neg'; operand: AstNode }
  | { type: 'logical'; op: 'and' | 'or'; args: AstNode[] }
  | { type: 'binary'; op: BinaryOp; left: AstNode; right: AstNode };

// zod 재귀 스키마: LLM 초안·저장 logic 검증. 화이트리스트 밖 구조는 파싱 실패.
export const astNodeSchema: z.ZodType<AstNode> = z.lazy(() =>
  z.union([
    z.object({
      type: z.literal('lit'),
      value: z.union([z.number(), z.string(), z.boolean(), z.null()]),
    }),
    z.object({ type: z.literal('var'), name: z.string().min(1) }),
    z.object({
      type: z.literal('unary'),
      op: z.enum(['not', 'neg']),
      operand: astNodeSchema,
    }),
    z.object({
      type: z.literal('logical'),
      op: z.enum(['and', 'or']),
      args: z.array(astNodeSchema).min(1),
    }),
    z.object({
      type: z.literal('binary'),
      op: z.enum(['>', '>=', '<', '<=', '==', '!=', '+', '-', '*', '/', '%']),
      left: astNodeSchema,
      right: astNodeSchema,
    }),
  ]),
) as z.ZodType<AstNode>;

export type Bindings = Record<string, AstValue>;

const MAX_DEPTH = 64; // 재귀 폭주 방지(선언적이라 순환 불가하지만 심층 방어).

export class AstEvalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AstEvalError';
  }
}

function toNum(v: AstValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  throw new AstEvalError(`숫자로 해석할 수 없는 값: ${JSON.stringify(v)}`);
}

function truthy(v: AstValue): boolean {
  if (typeof v === 'boolean') return v;
  if (v === null) return false;
  if (typeof v === 'number') return v !== 0;
  return v !== '';
}

function applyBinary(op: BinaryOp, l: AstValue, r: AstValue): AstValue {
  switch (op) {
    case '==':
      return l === r;
    case '!=':
      return l !== r;
    case '>':
      return toNum(l) > toNum(r);
    case '>=':
      return toNum(l) >= toNum(r);
    case '<':
      return toNum(l) < toNum(r);
    case '<=':
      return toNum(l) <= toNum(r);
    case '+':
      if (typeof l === 'string' || typeof r === 'string') {
        return String(l) + String(r);
      }
      return toNum(l) + toNum(r);
    case '-':
      return toNum(l) - toNum(r);
    case '*':
      return toNum(l) * toNum(r);
    case '/': {
      const d = toNum(r);
      if (d === 0) throw new AstEvalError('0으로 나눌 수 없습니다.');
      return toNum(l) / d;
    }
    case '%': {
      const d = toNum(r);
      if (d === 0) throw new AstEvalError('0으로 나눌 수 없습니다.');
      return toNum(l) % d;
    }
  }
}

/** 순수·결정론 AST 평가. 부작용 0, 화이트리스트 연산자만. */
export function evaluateAst(node: AstNode, bindings: Bindings, depth = 0): AstValue {
  if (depth > MAX_DEPTH) throw new AstEvalError('AST 깊이 상한 초과');
  switch (node.type) {
    case 'lit':
      return node.value;
    case 'var':
      if (!(node.name in bindings)) {
        throw new AstEvalError(`정의되지 않은 입력 참조: ${node.name}`);
      }
      return bindings[node.name];
    case 'unary': {
      const v = evaluateAst(node.operand, bindings, depth + 1);
      return node.op === 'not' ? !truthy(v) : -toNum(v);
    }
    case 'logical': {
      if (node.op === 'and') {
        for (const a of node.args) {
          if (!truthy(evaluateAst(a, bindings, depth + 1))) return false;
        }
        return true;
      }
      for (const a of node.args) {
        if (truthy(evaluateAst(a, bindings, depth + 1))) return true;
      }
      return false;
    }
    case 'binary': {
      const l = evaluateAst(node.left, bindings, depth + 1);
      const r = evaluateAst(node.right, bindings, depth + 1);
      return applyBinary(node.op, l, r);
    }
  }
}

/** AST → 사람이 읽는 조건식 텍스트(컨펌카드·감사 표시용). */
export function astToText(node: AstNode): string {
  switch (node.type) {
    case 'lit':
      if (node.value === null) return 'null';
      return typeof node.value === 'string' ? `"${node.value}"` : String(node.value);
    case 'var':
      return node.name;
    case 'unary':
      return node.op === 'not'
        ? `NOT(${astToText(node.operand)})`
        : `-${astToText(node.operand)}`;
    case 'logical':
      return (
        '(' +
        node.args.map(astToText).join(node.op === 'and' ? ' 그리고 ' : ' 또는 ') +
        ')'
      );
    case 'binary':
      return `${astToText(node.left)} ${node.op} ${astToText(node.right)}`;
  }
}

/** logic 이 참조하는 var 이름 집합(Critic: 미정의 입력 참조 사전 검출용). */
export function collectVarNames(node: AstNode, acc: Set<string> = new Set()): Set<string> {
  switch (node.type) {
    case 'var':
      acc.add(node.name);
      break;
    case 'unary':
      collectVarNames(node.operand, acc);
      break;
    case 'logical':
      node.args.forEach((a) => collectVarNames(a, acc));
      break;
    case 'binary':
      collectVarNames(node.left, acc);
      collectVarNames(node.right, acc);
      break;
    case 'lit':
      break;
  }
  return acc;
}
