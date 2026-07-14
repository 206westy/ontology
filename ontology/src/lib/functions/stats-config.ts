// PRD-PF-F: 통계엔진 호출형 kinetic Function 의 logic 스키마.
// impl_type='spc'|'fdc' 함수는 계산 로직을 담지 않는다 — 어떤 변수에 어떤 관리도/룰셋/센서법을
// 적용할지 "매핑"만 선언(오케스트레이터). 실제 계산은 lib/spc·lib/fdc(엔진).
import { z } from 'zod';

// 함수 경로는 변량 관리도(개별값·부분군)만 — 계수형(p/np/c/u)은 /api/spc/evaluate 엔진 API 사용.
export const spcFunctionLogicSchema = z.object({
  kind: z.literal('spc'),
  propertyId: z.string().uuid(), // 공정변수(측정 속성)
  chartType: z.enum(['xbar_r', 'i_mr']),
  subgroupSize: z.number().int().min(2).max(10).optional(), // xbar_r 부분군 크기
  rulesetId: z.string().uuid().nullable().optional(),
});
export type SpcFunctionLogic = z.infer<typeof spcFunctionLogicSchema>;

export const fdcFunctionLogicSchema = z.object({
  kind: z.literal('fdc'),
  sensorPropertyId: z.string().uuid(),
  method: z.enum(['threshold', 'trend']),
  params: z
    .object({
      upper: z.number().nullable().optional(),
      lower: z.number().nullable().optional(),
      jumpThreshold: z.number().nullable().optional(),
      driftSlopeThreshold: z.number().nullable().optional(),
      window: z.number().int().positive().optional(),
    })
    .default({}),
});
export type FdcFunctionLogic = z.infer<typeof fdcFunctionLogicSchema>;
