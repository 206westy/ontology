import { z } from 'zod';

// PRD-PF-C: 문제 워크플로우 도메인 스키마(서버 검증 + 클라 타입 소스).

export const WORKFLOW_STEPS = [
  'define',
  'data',
  'studio',
  'functions',
  'board',
] as const;
export type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

export const workflowStepStateSchema = z.enum([
  'locked',
  'draft',
  'confirmed',
  'stale',
]);
export type WorkflowStepState = z.infer<typeof workflowStepStateSchema>;

// workflow_state jsonb: 각 단계 상태 + 확정 감사(by/at).
export const workflowStateSchema = z.record(
  z.string(),
  z.object({
    state: workflowStepStateSchema,
    confirmedBy: z.string().nullable().optional(),
    confirmedAt: z.string().nullable().optional(),
  }),
);
export type WorkflowState = z.infer<typeof workflowStateSchema>;

export const goalMetricSchema = z.object({
  name: z.string().max(200).default(''),
  target: z.string().max(120).default(''),
  unit: z.string().max(60).default(''),
  direction: z.enum(['higher', 'lower', 'target']).default('target'),
});
export type GoalMetric = z.infer<typeof goalMetricSchema>;

export const actionSlotSchema = z.object({
  key: z.string().min(1).max(60),
  label: z.string().min(1).max(120),
});

export const decisionQuestionSchema = z.object({
  question: z.string().min(1).max(500),
  decision: z.string().max(500).default(''),
  sourcePatternId: z.string().uuid().nullable().optional(),
});

export const createProblemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  goalMetric: goalMetricSchema.partial().optional(),
  actionSlots: z.array(actionSlotSchema).max(20).optional(),
  decisionQuestions: z.array(decisionQuestionSchema).max(30).optional(),
});
export type CreateProblemInput = z.infer<typeof createProblemSchema>;

export const updateProblemSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional(),
  goalMetric: goalMetricSchema.partial().optional(),
  actionSlots: z.array(actionSlotSchema).max(20).optional(),
  decisionQuestions: z.array(decisionQuestionSchema).max(30).optional(),
  status: z.enum(['defining', 'in_progress', 'completed', 'archived']).optional(),
});

// 단계 확정(confirm-gate) — reopen 시 이후 단계 stale 전환은 서버가 처리.
export const confirmStepSchema = z.object({
  step: z.enum(WORKFLOW_STEPS),
  // 'confirm' = 확정, 'reopen' = 재오픈(이후 단계 stale).
  action: z.enum(['confirm', 'reopen']).default('confirm'),
});

export const linkModeSchema = z.enum(['new', 'reuse', 'extend', 'branch']);
export type LinkMode = z.infer<typeof linkModeSchema>;

export const createLinkSchema = z.object({
  mode: linkModeSchema,
  // reuse/extend/branch 시 대상 온톨로지. new 시 생략(신규 생성).
  ontologyId: z.string().uuid().optional(),
  // new 모드일 때 신규 온톨로지 이름.
  newOntologyName: z.string().min(1).max(120).optional(),
  isPrimary: z.boolean().optional(),
});
export type CreateLinkInput = z.infer<typeof createLinkSchema>;
