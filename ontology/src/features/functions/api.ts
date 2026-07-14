import type { AstNode } from '@/lib/functions/ast';
import type { OutputSpec, Verdict } from '@/lib/functions/evaluate';

export interface FunctionInputRef {
  propertyId: string;
  alias: string;
}

export interface DecisionFunction {
  id: string;
  ontologyId: string;
  name: string;
  description: string;
  targetClassId: string | null;
  inputs: FunctionInputRef[];
  logic: AstNode;
  outputSpec: OutputSpec;
  nlSource: string | null;
  implType: 'ast' | 'code';
  status: 'draft' | 'confirmed' | 'archived';
  version: number;
  createdAt: string;
}

export interface FunctionDraft {
  name: string;
  inputs: { propertyName: string; alias: string }[];
  inputsResolved: {
    alias: string;
    propertyName: string;
    propertyId: string | null;
  }[];
  logic: AstNode;
  outputSpec: OutputSpec;
  rationale: string;
  targetClassId: string;
  nlSource: string;
}

export interface EvaluateRow {
  instanceId: string;
  instanceName: string;
  verdict?: Verdict;
  inputSnapshot?: Record<string, unknown>;
  inputHash?: string;
  error?: string;
}

async function json<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.formErrors?.[0] ?? data.error ?? '요청 실패');
  return data as T;
}

const jsonHeaders = { 'Content-Type': 'application/json' };

export const functionsApi = {
  list: (): Promise<DecisionFunction[]> =>
    fetch('/api/functions').then((r) => json<DecisionFunction[]>(r)),

  // 자연어 규칙 → AST 초안(저장 아님, 컨펌 전 단계).
  draft: (nl: string, targetClassId: string): Promise<{ draft: FunctionDraft; warnings: string[] }> =>
    fetch('/api/llm/function-draft', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ nl, targetClassId }),
    }).then((r) => json(r)),

  create: (data: {
    name: string;
    description?: string;
    targetClassId?: string | null;
    inputs: FunctionInputRef[];
    logic: AstNode;
    outputSpec: OutputSpec;
    nlSource?: string;
    status?: 'draft' | 'confirmed';
  }): Promise<DecisionFunction> =>
    fetch('/api/functions', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => json<DecisionFunction>(r)),

  update: (
    id: string,
    data: Partial<{ status: 'draft' | 'confirmed' | 'archived'; name: string }>,
  ): Promise<DecisionFunction> =>
    fetch(`/api/functions/${id}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => json<DecisionFunction>(r)),

  remove: (id: string): Promise<{ success: boolean }> =>
    fetch(`/api/functions/${id}`, { method: 'DELETE' }).then((r) => json(r)),

  evaluate: (
    id: string,
    opts: { instanceId?: string; persist?: boolean } = {},
  ): Promise<{ results: EvaluateRow[]; evaluated: number; persisted: boolean }> =>
    fetch(`/api/functions/${id}/evaluate`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(opts),
    }).then((r) => json(r)),
};
