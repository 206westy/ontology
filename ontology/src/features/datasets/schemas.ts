import { z } from 'zod';

// PRD-PF-D: 데이터셋 레지스트리 도메인 스키마.

export const registerCsvSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  csvText: z.string().min(1).max(15_000_000), // 대용량은 샘플링(profile.ts 5만행 캡)
});
export type RegisterCsvInput = z.infer<typeof registerCsvSchema>;

export const createMappingSchema = z
  .object({
    datasetColumnId: z.string().uuid(),
    targetType: z.enum(['class', 'property']),
    targetClassId: z.string().uuid().nullable().optional(),
    targetPropertyId: z.string().uuid().nullable().optional(),
    confidence: z.number().min(0).max(1).optional(),
    source: z.enum(['user', 'embedding_suggested']).default('user'),
  })
  .refine(
    (d) =>
      (d.targetType === 'class' && !!d.targetClassId && !d.targetPropertyId) ||
      (d.targetType === 'property' && !!d.targetPropertyId && !d.targetClassId),
    { message: 'target_type 과 대상 id 가 일치해야 합니다.' },
  );
export type CreateMappingInput = z.infer<typeof createMappingSchema>;

export const attachDatasetSchema = z.object({
  datasetId: z.string().uuid(),
  role: z.enum(['primary', 'reference']).default('primary'),
});
export type AttachDatasetInput = z.infer<typeof attachDatasetSchema>;
