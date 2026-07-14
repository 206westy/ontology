import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/lib/drizzle';
import {
  functions,
  instances,
  instanceValues,
  decisionResults,
  specLimits,
  spcRulesets,
  controlLimits,
  spcRuns,
  fdcTraces,
} from '@/lib/drizzle/schema';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';
import { astNodeSchema, type AstValue } from '@/lib/functions/ast';
import {
  evaluateFunction,
  functionInputSchema,
  outputSpecSchema,
  type FunctionInput,
  type OutputSpec,
} from '@/lib/functions/evaluate';
import {
  spcFunctionLogicSchema,
  fdcFunctionLogicSchema,
} from '@/lib/functions/stats-config';
import {
  evaluateSpcFunction,
  type OrderedMeasurement,
} from '@/lib/functions/spc-eval';
import { evaluateFdcFunction } from '@/lib/functions/fdc-eval';

const bodySchema = z.object({
  instanceId: z.string().uuid().optional(),
  // 기본 true: 판정 결과를 decision_results 에 감사 적재. false 면 미리보기만.
  persist: z.boolean().optional(),
});

function coerce(v: string | null): AstValue {
  if (v === null) return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

function toNumber(v: string | null): number | null {
  if (v === null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

type FunctionRow = typeof functions.$inferSelect;
type InstanceRow = typeof instances.$inferSelect;

// ── 측정 시퀀스 로드(SPC/FDC 공통): targetClass 인스턴스를 생성순으로, 지정 속성값 추출 ──
async function loadMeasurements(
  db: Awaited<ReturnType<typeof getDb>>,
  ontologyId: string,
  targetClassId: string,
  propertyId: string,
): Promise<OrderedMeasurement[]> {
  const rows = await db.query.instances.findMany({
    where: and(
      eq(instances.classId, targetClassId),
      eq(instances.ontologyId, ontologyId),
    ),
  });
  const ordered = [...rows].sort(
    (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
  );
  const ids = ordered.map((i) => i.id);
  if (ids.length === 0) return [];
  const vals = await db.query.instanceValues.findMany({
    where: and(
      inArray(instanceValues.instanceId, ids),
      eq(instanceValues.ontologyId, ontologyId),
      eq(instanceValues.propertyId, propertyId),
    ),
  });
  const byInst = new Map(vals.map((v) => [v.instanceId, v.value]));
  const out: OrderedMeasurement[] = [];
  for (const inst of ordered) {
    const num = toNumber(byInst.get(inst.id) ?? null);
    if (num !== null) out.push({ instanceId: inst.id, value: num });
  }
  return out;
}

// ── SPC 함수 실행 ──
async function runSpc(
  db: Awaited<ReturnType<typeof getDb>>,
  ontologyId: string,
  fn: FunctionRow,
  persist: boolean,
) {
  const logic = spcFunctionLogicSchema.parse(fn.logic);
  if (!fn.targetClassId) {
    return NextResponse.json(
      { error: 'SPC 함수는 대상 클래스(target class)가 필요합니다.' },
      { status: 400 },
    );
  }
  const measurements = await loadMeasurements(db, ontologyId, fn.targetClassId, logic.propertyId);
  if (measurements.length < 2) {
    return NextResponse.json({ results: [], evaluated: 0, note: '수치 측정값이 2개 미만입니다.' });
  }

  const specRow = await db.query.specLimits.findFirst({
    where: and(eq(specLimits.ontologyId, ontologyId), eq(specLimits.propertyId, logic.propertyId)),
    orderBy: (s, { desc }) => [desc(s.revision)],
  });
  const spec = specRow ? { usl: specRow.usl, lsl: specRow.lsl, target: specRow.target } : null;

  let rulesEnabled: string[] | undefined;
  if (logic.rulesetId) {
    const rs = await db.query.spcRulesets.findFirst({
      where: and(eq(spcRulesets.id, logic.rulesetId), eq(spcRulesets.ontologyId, ontologyId)),
    });
    if (rs) rulesEnabled = rs.rulesEnabled as string[];
  }

  // 자동 재계산 금지: 저장된 관리한계가 있으면 재사용(엔지니어가 명시적으로 재계산 트리거).
  const storedLimit = await db.query.controlLimits.findFirst({
    where: and(
      eq(controlLimits.ontologyId, ontologyId),
      eq(controlLimits.propertyId, logic.propertyId),
      eq(controlLimits.chartType, logic.chartType),
    ),
    orderBy: (c, { desc }) => [desc(c.computedAt)],
  });
  const providedLimits =
    storedLimit && storedLimit.centerline != null && storedLimit.ucl != null && storedLimit.lcl != null
      ? {
          centerline: storedLimit.centerline,
          ucl: storedLimit.ucl,
          lcl: storedLimit.lcl,
          sigma: storedLimit.sigma ?? undefined,
        }
      : null;

  const { spcResult, runRows, decisionRows } = evaluateSpcFunction(measurements, {
    chartType: logic.chartType,
    subgroupSize: logic.subgroupSize,
    spec,
    rulesEnabled,
    providedLimits,
  });

  // 관리한계: 저장된 게 없으면 최초 1회 산출 결과를 적재(이후 재사용).
  let controlLimitId = storedLimit?.id ?? null;
  if (!storedLimit) {
    const [cl] = await db
      .insert(controlLimits)
      .values({
        ontologyId,
        propertyId: logic.propertyId,
        chartType: logic.chartType,
        ucl: spcResult.limits.ucl,
        lcl: spcResult.limits.lcl,
        centerline: spcResult.limits.centerline,
        uclSecondary: spcResult.limits.uclSecondary ?? null,
        lclSecondary: spcResult.limits.lclSecondary ?? null,
        centerlineSecondary: spcResult.limits.centerlineSecondary ?? null,
        subgroupSize: spcResult.limits.subgroupSize,
        sampleCount: spcResult.limits.sampleCount,
        sigma: spcResult.limits.sigma,
      })
      .returning();
    controlLimitId = cl.id;
  }

  if (persist) {
    await db.insert(spcRuns).values(
      runRows.map((r) => ({
        ontologyId,
        functionId: fn.id,
        propertyId: logic.propertyId,
        instanceId: r.instanceId,
        lotId: r.lotId,
        chartType: logic.chartType,
        verdict: r.verdict,
        violatedRules: r.violatedRules,
        evidence: r.evidence,
        controlLimitId,
      })),
    );
    await db.insert(decisionResults).values(
      decisionRows.map((d) => ({
        ontologyId,
        functionId: fn.id,
        instanceId: d.instanceId,
        verdict: d.verdict,
        inputSnapshot: d.inputSnapshot,
        inputHash: d.inputHash,
        functionVersion: fn.version,
      })),
    );
  }

  return NextResponse.json({
    kind: 'spc',
    verdict: spcResult.verdict,
    limits: spcResult.limits,
    capability: spcResult.capability,
    violatedRuleSummary: spcResult.violatedRuleSummary,
    points: spcResult.points,
    controlLimitId,
    evaluated: runRows.length,
    persisted: persist,
  });
}

// ── FDC 함수 실행 ──
async function runFdc(
  db: Awaited<ReturnType<typeof getDb>>,
  ontologyId: string,
  fn: FunctionRow,
  persist: boolean,
) {
  const logic = fdcFunctionLogicSchema.parse(fn.logic);
  if (!fn.targetClassId) {
    return NextResponse.json(
      { error: 'FDC 함수는 대상 클래스(설비/판독 클래스)가 필요합니다.' },
      { status: 400 },
    );
  }
  const measurements = await loadMeasurements(db, ontologyId, fn.targetClassId, logic.sensorPropertyId);
  if (measurements.length < 2) {
    return NextResponse.json({ results: [], evaluated: 0, note: '수치 센서값이 2개 미만입니다.' });
  }

  const { result, decisionRows, faultInstanceIds } = evaluateFdcFunction(measurements, {
    method: logic.method,
    params: logic.params,
  });

  if (persist) {
    await db.insert(fdcTraces).values({
      ontologyId,
      functionId: fn.id,
      equipmentInstanceId: null,
      sensorPropertyId: logic.sensorPropertyId,
      detectionMethod: logic.method,
      faultFlag: result.faultFlag,
      score: result.score,
      evidence: {
        violatingIndices: result.violatingIndices,
        faultInstanceIds,
        detail: result.detail,
      },
    });
    await db.insert(decisionResults).values(
      decisionRows.map((d) => ({
        ontologyId,
        functionId: fn.id,
        instanceId: d.instanceId,
        verdict: d.verdict,
        inputSnapshot: d.inputSnapshot,
        inputHash: d.inputHash,
        functionVersion: fn.version,
      })),
    );
  }

  return NextResponse.json({
    kind: 'fdc',
    faultFlag: result.faultFlag,
    score: result.score,
    method: result.method,
    faultInstanceIds,
    detail: result.detail,
    evaluated: decisionRows.length,
    persisted: persist,
  });
}

// ── AST 함수 실행(기존 경로) ──
async function runAst(
  db: Awaited<ReturnType<typeof getDb>>,
  ontologyId: string,
  fn: FunctionRow,
  targetInstances: InstanceRow[],
  persist: boolean,
) {
  const logic = astNodeSchema.parse(fn.logic);
  const outputSpec = outputSpecSchema.parse(fn.outputSpec) as OutputSpec;
  const inputs = z.array(functionInputSchema).parse(fn.inputs) as FunctionInput[];

  if (targetInstances.length === 0) {
    return NextResponse.json({ results: [], evaluated: 0 });
  }
  const instanceIds = targetInstances.map((i) => i.id);
  const vals = await db.query.instanceValues.findMany({
    where: and(
      inArray(instanceValues.instanceId, instanceIds),
      eq(instanceValues.ontologyId, ontologyId),
    ),
  });

  const aliasByProp = new Map(inputs.map((inp) => [inp.propertyId, inp.alias]));
  const bindingsByInstance = new Map<string, Record<string, AstValue>>();
  for (const iid of instanceIds) bindingsByInstance.set(iid, {});
  for (const v of vals) {
    const alias = aliasByProp.get(v.propertyId);
    if (!alias) continue;
    const b = bindingsByInstance.get(v.instanceId);
    if (b) b[alias] = coerce(v.value);
  }

  const results: Array<Record<string, unknown>> = [];
  const rows: (typeof decisionResults.$inferInsert)[] = [];
  for (const inst of targetInstances) {
    const bindings = bindingsByInstance.get(inst.id) ?? {};
    try {
      const r = evaluateFunction({ logic, outputSpec, bindings });
      results.push({
        instanceId: inst.id,
        instanceName: inst.name,
        verdict: r.verdict,
        inputSnapshot: r.inputSnapshot,
        inputHash: r.inputHash,
      });
      rows.push({
        ontologyId,
        functionId: fn.id,
        instanceId: inst.id,
        verdict: r.verdict,
        inputSnapshot: r.inputSnapshot,
        inputHash: r.inputHash,
        functionVersion: fn.version,
      });
    } catch (e) {
      results.push({
        instanceId: inst.id,
        instanceName: inst.name,
        error: e instanceof Error ? e.message : '평가 실패',
      });
    }
  }

  if (persist && rows.length > 0) {
    await db.insert(decisionResults).values(rows);
  }
  return NextResponse.json({ results, evaluated: results.length, persisted: persist });
}

// POST /api/functions/[id]/evaluate — impl_type 별 실행(AST 인프로세스 / SPC·FDC 통계엔진 위임).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { ontologyId } = await getOntologyScope(request, 'editor');
    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const persist = parsed.data.persist !== false;

    const db = await getDb();
    const fn = await db.query.functions.findFirst({
      where: and(eq(functions.id, id), eq(functions.ontologyId, ontologyId)),
    });
    if (!fn) {
      return NextResponse.json({ error: '함수를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (fn.implType === 'spc') return runSpc(db, ontologyId, fn, persist);
    if (fn.implType === 'fdc') return runFdc(db, ontologyId, fn, persist);

    // AST(기본): 단일 인스턴스 지정 또는 targetClass 전체.
    const targetInstances = parsed.data.instanceId
      ? await db.query.instances.findMany({
          where: and(
            eq(instances.id, parsed.data.instanceId),
            eq(instances.ontologyId, ontologyId),
          ),
        })
      : fn.targetClassId
        ? await db.query.instances.findMany({
            where: and(
              eq(instances.classId, fn.targetClassId),
              eq(instances.ontologyId, ontologyId),
            ),
          })
        : [];
    return runAst(db, ontologyId, fn, targetInstances, persist);
  } catch (err) {
    return handleApiError(err);
  }
}
