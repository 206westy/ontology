'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { useOntologyStore } from './useOntologyStore';
import { llmApi, termsApi } from '../api';
import { mapParseResult } from '../lib/parse-mapping';
import { enforcePatternRoles } from '../lib/patterns/enforce-roles';
import { detectTermsNeedingResolution } from '../lib/terms/detect';
import { buildGlossaryInjectionBlock } from '../lib/terms/glossary';
import { collectDriftElements, type DriftElement } from '../lib/patterns/drift';
import {
  scheduleInsertion,
  type InsertNode,
  type InsertEdge,
} from '../lib/patterns/progressive';
import { stableEntityId, stableEdgeId } from '../lib/identity';
import { DEFAULT_PARTITION_ID } from '../lib/types';
import { NODE_COLORS } from '../constants/colors';
import type { PatternGenerateArgs } from '../components/patterns/PatternDiscoveryPanel';

// PRD-H H3 (M2): 패턴 시드 생성 컨테이너(얇은 consumer).
// parse(시드) → 역할 가드(T2) → 매핑 → 순수 스케줄러(T3)로 순차 삽입(애니메이션) →
// 활성 패턴 기록(T6) + 머지 미리보기 트리거(T5).
const BATCH_SIZE = 4;
const BATCH_DELAY_MS = 120;

type Creator = () => void;

// 스케줄된 배치를 작은 지연으로 순차 소비한다(애니메이션 삽입). 타이머는 주입 가능.
function applyBatchesSequentially(
  batches: ReturnType<typeof scheduleInsertion>,
  creators: Map<string, Creator>,
  delayMs: number,
  schedule: (fn: () => void, ms: number) => void,
): void {
  batches.forEach((batch, i) => {
    schedule(() => {
      const ids =
        batch.kind === 'nodes'
          ? batch.nodes.map((n) => n.id)
          : batch.edges.map((e) => e.id);
      ids.forEach((id) => creators.get(id)?.());
    }, i * delayMs);
  });
}

export function usePatternGeneration() {
  return useCallback(async (args: PatternGenerateArgs) => {
    const s = useOntologyStore.getState();
    s.setActivePattern(args.pattern);
    // H7(M5): 검수의 CQ 통과율 표시용으로 이 패턴의 CQ 번들을 기록.
    s.setActivePatternCq({
      competencyQuestions: args.cq.competencyQuestions,
      traversalTemplates: args.cq.traversalTemplates,
    });

    // H4(M3) 재주입: 이 도메인에서 확정된 용어집을 추출 맥락(existingSchema)에 주입해
    // 같은 세션·도메인에서 `VV=밸브`가 일관 적용되게 한다. 조회 실패는 비치명(재주입 생략).
    let existingSchema: string | undefined;
    try {
      const { entries } = await termsApi.glossary(args.patternContext.domain);
      existingSchema = buildGlossaryInjectionBlock(args.patternContext.domain, entries) || undefined;
    } catch {
      existingSchema = undefined;
    }

    const result = await llmApi.parse({
      text: args.text,
      patternContext: args.patternContext,
      existingClasses: s.classes.map((c) => c.name),
      existingRelationTypes: s.relationTypes.map((r) => r.name),
      existingSchema,
    });

    // T2: 역할 가드 — untyped/parentless 노드를 막고 미매핑은 경고로 노출.
    const roleNames = args.patternContext.roles.map((r) => r.name);
    const enforced = enforcePatternRoles(result.entities ?? [], roleNames);
    const guarded = { ...result, entities: enforced.entities };

    // H4/H8-e(M5): 미정의·모호 용어(약어 등) 감지 — 배치로 모아 컨펌 대상으로 노출.
    // opt-in 웹은 기본 off. 여기선 감지만 하고 확정은 사용자 몫(자동 확정 없음).
    const detectedTerms = detectTermsNeedingResolution(
      (enforced.entities ?? []).map((e) => ({
        name: e.name,
        type: e.type,
      })),
    );

    const existingClassNames = new Set(s.classes.map((c) => c.name));
    const existingInstanceNames = new Set(s.instances.map((i) => i.name));
    const mapped = mapParseResult(guarded, existingClassNames, existingInstanceNames);

    const partition = s.currentPartitionId ?? DEFAULT_PARTITION_ID;
    const { nodes, edges, creators } = buildInsertionPlan(mapped, partition);

    const batches = scheduleInsertion(nodes, edges, BATCH_SIZE);
    applyBatchesSequentially(batches, creators, BATCH_DELAY_MS, (fn, ms) =>
      setTimeout(fn, ms),
    );

    const warnings = [...enforced.warnings, ...mapped.warnings.map((w) => w.message)];
    if (detectedTerms.length > 0) {
      warnings.push(
        `미정의·모호 용어 ${detectedTerms.length}개 감지: ${detectedTerms.join(', ')} — 용어 확인이 필요합니다.`,
      );
    }
    if (warnings.length > 0) {
      toast.warning('패턴 생성 검토 필요', { description: warnings[0] });
    }

    // H5(M4) 드리프트: 패턴 밖 신규 개념·관계를 모아 상위(EmptyState)가 판정·검수하게 넘긴다.
    // 여기선 수집만(자동 반영 없음) — 판정은 driftApi, 반영은 카드 컨펌 뒤에서만.
    const driftElements: DriftElement[] = collectDriftElements(
      (result.entities ?? []).map((e) => ({ type: e.type, description: e.description })),
      (result.relations ?? []).map((r) => ({ type: r.type })),
      args.patternContext,
    );

    // H8-c: 서로 다른 표면형이 같은 개념일 수 있어 머지 미리보기를 띄운다(자동 병합 없음).
    s.openEntityResolution();

    // PRD-I (M3, Task 3.2): 상위(GuidedJourney)가 중복/거버넌스/보강/Critic 검수 단계를
    // 계산할 수 있도록 매핑 결과를 그대로 넘긴다. LLM/parse 재실행 없이 재사용하기 위함.
    return { warnings, detectedTerms, driftElements, mapped };
  }, []);
}

// mapped 추출 → InsertNode/InsertEdge + id 별 생성 클로저(진행형 삽입용).
function buildInsertionPlan(
  mapped: ReturnType<typeof mapParseResult>,
  partition: string,
): { nodes: InsertNode[]; edges: InsertEdge[]; creators: Map<string, Creator> } {
  const store = useOntologyStore.getState();
  const nodes: InsertNode[] = [];
  const creators = new Map<string, Creator>();

  const classIdByName = new Map<string, string>();
  store.classes.forEach((c) => classIdByName.set(c.name, c.id));

  // 프로퍼티는 소속 클래스가 DB에 먼저 있어야 한다(class→property FK). 신규 클래스의
  // 프로퍼티는 그 클래스 생성 클로저에서 같은 순서로 만들고, 기존(이미 커밋된) 클래스의
  // 프로퍼티만 즉시 생성한다. → 동기화 직렬화(useApiSync)와 함께 FK 순서를 보장.
  const newClassNames = new Set(mapped.classes.map((c) => c.name));
  const propsByClass = new Map<string, typeof mapped.properties>();
  const propIdByKey = new Map<string, string>();
  const addProp = (className: string, classId: string, prop: (typeof mapped.properties)[number]) => {
    const pid = store.addProperty({
      name: prop.name,
      classId,
      dataType: prop.dataType as 'string' | 'integer' | 'float' | 'boolean' | 'date' | 'enum',
      isRequired: prop.isRequired,
      enumValues: prop.enumValues,
    });
    propIdByKey.set(`${className}::${prop.name}`, pid);
  };
  mapped.properties.forEach((prop) => {
    if (newClassNames.has(prop.className)) {
      const arr = propsByClass.get(prop.className) ?? [];
      arr.push(prop);
      propsByClass.set(prop.className, arr);
      return;
    }
    const classId = classIdByName.get(prop.className);
    if (classId) addProp(prop.className, classId, prop);
  });

  // 클래스 노드 + 생성 클로저(클래스 → 그 클래스의 프로퍼티 순, 같은 틱).
  mapped.classes.forEach((cls) => {
    const id = stableEntityId(cls.name, 'class', partition);
    classIdByName.set(cls.name, id);
    const parentId = cls.parentName ? classIdByName.get(cls.parentName) ?? null : null;
    nodes.push({ id, kind: 'class', parentId });
    creators.set(id, () => {
      store.addClass({
        id,
        name: cls.name,
        description: cls.description,
        color: cls.color ?? NODE_COLORS.mid,
        parentId: parentId ?? undefined,
        sourceType: cls.evidence ? 'session_doc' : null,
        evidence: cls.evidence ?? null,
      });
      (propsByClass.get(cls.name) ?? []).forEach((prop) => addProp(cls.name, id, prop));
    });
  });

  // 인스턴스 노드 + 생성 클로저(값 포함).
  const instanceIdByName = new Map<string, string>();
  store.instances.forEach((i) => instanceIdByName.set(i.name, i.id));
  mapped.instances.forEach((inst) => {
    const classId = classIdByName.get(inst.className);
    if (!classId) return;
    const id = stableEntityId(inst.name, 'instance', partition);
    instanceIdByName.set(inst.name, id);
    nodes.push({ id, kind: 'instance', parentId: classId });
    creators.set(id, () => {
      store.addInstance({ id, name: inst.name, classId, description: inst.description ?? '' });
      (inst.values ?? []).forEach((v) => {
        const propId = propIdByKey.get(`${inst.className}::${v.propertyName}`);
        if (propId) store.setInstanceValue(id, propId, v.value);
      });
    });
  });

  // 관계 타입은 즉시 확보하고, 엣지만 진행형으로 삽입.
  const relTypeIdByName = new Map<string, string>();
  store.relationTypes.forEach((rt) => relTypeIdByName.set(rt.name, rt.id));
  const resolve = (name: string): { id: string; kind: 'class' | 'instance' } | null => {
    if (classIdByName.has(name)) return { id: classIdByName.get(name)!, kind: 'class' };
    if (instanceIdByName.has(name)) return { id: instanceIdByName.get(name)!, kind: 'instance' };
    return null;
  };

  const edges: InsertEdge[] = [];
  mapped.relations.forEach((rel) => {
    const src = resolve(rel.sourceName);
    const tgt = resolve(rel.targetName);
    if (!src || !tgt || src.id === tgt.id) return;
    let relTypeId = relTypeIdByName.get(rel.relationName);
    if (!relTypeId) {
      relTypeId = store.addRelationType({ name: rel.relationName, layer: rel.layer });
      relTypeIdByName.set(rel.relationName, relTypeId);
    }
    const edgeId = stableEdgeId(src.id, tgt.id, rel.relationName);
    edges.push({ id: edgeId, sourceId: src.id, targetId: tgt.id });
    creators.set(edgeId, () => {
      store.addEdge({
        id: edgeId,
        sourceId: src.id,
        targetId: tgt.id,
        sourceKind: src.kind,
        targetKind: tgt.kind,
        relationTypeId: relTypeId!,
        sourceType: rel.evidence ? 'session_doc' : null,
        confidence: rel.confidence ?? null,
        evidence: rel.evidence ?? null,
      });
    });
  });

  return { nodes, edges, creators };
}
