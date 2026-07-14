import type {
  CreateProblemInput,
  CreateLinkInput,
  GoalMetric,
  WorkflowStep,
} from './schemas';
import type { StepEntry } from './workflow';

export interface ProblemListItem {
  id: string;
  title: string;
  description: string;
  status: string;
  workflowState: Record<string, StepEntry>;
  goalMetric: Partial<GoalMetric>;
  updatedAt: string;
  createdAt: string;
  primaryOntologyId: string | null;
  primaryOntologyName: string | null;
}

export interface ProblemLink {
  id: string;
  ontologyId: string;
  ontologyName: string | null;
  linkMode: 'new' | 'reuse' | 'extend' | 'branch';
  branchId: string | null;
  isPrimary: boolean;
}

export interface ProblemDetail {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  goalMetric: Partial<GoalMetric>;
  actionSlots: { key: string; label: string }[];
  decisionQuestions: {
    question: string;
    decision: string;
    sourcePatternId?: string | null;
  }[];
  status: string;
  workflowState: Record<string, StepEntry>;
  createdAt: string;
  updatedAt: string;
  links: ProblemLink[];
}

async function json<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error?.formErrors?.[0] ?? data.error ?? '요청 실패');
  return data as T;
}

const jsonHeaders = { 'Content-Type': 'application/json' };

export const problemsApi = {
  list: (): Promise<ProblemListItem[]> =>
    fetch('/api/problems').then((r) => json<ProblemListItem[]>(r)),

  get: (id: string): Promise<ProblemDetail> =>
    fetch(`/api/problems/${id}`).then((r) => json<ProblemDetail>(r)),

  create: (data: CreateProblemInput): Promise<ProblemDetail> =>
    fetch('/api/problems', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => json<ProblemDetail>(r)),

  update: (id: string, data: Partial<CreateProblemInput> & { status?: string }): Promise<ProblemDetail> =>
    fetch(`/api/problems/${id}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => json<ProblemDetail>(r)),

  remove: (id: string): Promise<{ success: boolean }> =>
    fetch(`/api/problems/${id}`, { method: 'DELETE' }).then((r) => json(r)),

  confirmStep: (
    id: string,
    step: WorkflowStep,
    action: 'confirm' | 'reopen' = 'confirm',
  ): Promise<ProblemDetail> =>
    fetch(`/api/problems/${id}/confirm`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ step, action }),
    }).then((r) => json<ProblemDetail>(r)),

  listLinks: (id: string): Promise<ProblemLink[]> =>
    fetch(`/api/problems/${id}/links`).then((r) => json<ProblemLink[]>(r)),

  createLink: (id: string, data: CreateLinkInput): Promise<ProblemLink> =>
    fetch(`/api/problems/${id}/links`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => json<ProblemLink>(r)),
};
