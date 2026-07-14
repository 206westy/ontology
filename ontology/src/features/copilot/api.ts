// PRD-PF-E: 코파일럿 클라이언트 — 신규 2툴콜(충분성·함수추천) + 기존 function-draft 재사용.

export interface SufficiencyReport {
  problemType: string;
  verdict: '충분' | '부족' | '모름';
  score: number;
  requiredColumns: {
    role: string;
    present: boolean;
    matchedTo: string | null;
    why: string;
    howToGet: string;
  }[];
  missing: { what: string; why: string; howToGet: string }[];
  evidence: string[];
  columnNames: string[];
}

export interface FunctionRecommendation {
  id: string;
  name: string;
  description: string;
  outputKind: 'pass_fail' | 'score' | 'recommend';
  ruleSeed: string;
  rationale: string;
}

export interface FunctionRecommendResponse {
  problemType: string;
  label?: string;
  coverage: boolean;
  recommendations: FunctionRecommendation[];
  guidance?: string;
}

async function json<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error?.formErrors?.[0] ?? data.error ?? '요청 실패');
  return data as T;
}

const jsonHeaders = { 'Content-Type': 'application/json' };

export const copilotApi = {
  sufficiency: (problemId: string): Promise<SufficiencyReport> =>
    fetch('/api/llm/sufficiency', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ problemId }),
    }).then((r) => json<SufficiencyReport>(r)),

  recommendFunctions: (problemId: string): Promise<FunctionRecommendResponse> =>
    fetch('/api/llm/function-recommend', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ problemId }),
    }).then((r) => json<FunctionRecommendResponse>(r)),
};
