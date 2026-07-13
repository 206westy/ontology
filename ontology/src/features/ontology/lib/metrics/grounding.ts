// PRD-N M3 (Grounder): 개념↔실데이터 접지 측정 — 순수·결정론(LLM 불필요).
// "실데이터" = 현 자산(instances/instance_values). 클래스가 인스턴스로 뒷받침되는지
// (바인딩률), 속성이 실제 값으로 채워졌는지(채움률), 데이터가 현재적인지(신선도)를 잰다.
// health.ts 와 같은 프레임워크-무의존 순수 함수(구조 부분집합 입력)로 store 배열을 그대로 받는다.

import { stableEntityId } from '../identity';

export interface GroundingClass {
  id: string;
  partitionId: string;
}
export interface GroundingInstance {
  id: string;
  classId: string;
  updatedAt: string;
}
export interface GroundingProperty {
  id: string;
  classId: string;
}
export interface GroundingValue {
  instanceId: string;
  propertyId: string;
  value: string | null;
}

export interface GroundingModel {
  classes: GroundingClass[];
  instances: GroundingInstance[];
  properties: GroundingProperty[];
  instanceValues: GroundingValue[];
}

export interface PartitionFreshness {
  partitionId: string;
  latestUpdatedAt: string | null;
  ageDays: number | null;
}

export interface GroundingReport {
  totalClasses: number;
  boundClasses: number;
  // 인스턴스가 하나라도 있는 클래스 비율(0..1). 클래스가 없으면 1(vacuous).
  bindingRate: number;
  totalInstances: number;
  // 채운 속성 값 / 채울 수 있는 속성 값(인스턴스 × 클래스 속성). 채울 게 없으면 1.
  fillRate: number;
  // 인스턴스 0개 클래스 id(미접지) — 시각 표면·연결 유도 대상.
  ungroundedClassIds: string[];
  freshnessByPartition: PartitionFreshness[];
  // 신선도 임계(STALE_DAYS) 초과 구획 id.
  stalePartitionIds: string[];
  // 전 구획 중 가장 오래된 데이터의 경과일(없으면 null).
  oldestAgeDays: number | null;
}

// 신선도 임계: 인스턴스 최신 갱신이 이 일수를 넘으면 "오래됨" 경고.
export const STALE_DAYS = 90;
const MS_PER_DAY = 86_400_000;

function nonEmpty(v: string | null): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

export function computeGrounding(model: GroundingModel, nowMs?: number): GroundingReport {
  const now = nowMs ?? Date.now();

  // 클래스별 인스턴스 수.
  const instanceCountByClass = new Map<string, number>();
  for (const inst of model.instances) {
    instanceCountByClass.set(inst.classId, (instanceCountByClass.get(inst.classId) ?? 0) + 1);
  }

  const totalClasses = model.classes.length;
  const ungroundedClassIds = model.classes
    .filter((c) => (instanceCountByClass.get(c.id) ?? 0) === 0)
    .map((c) => c.id);
  const boundClasses = totalClasses - ungroundedClassIds.length;
  const bindingRate = totalClasses === 0 ? 1 : boundClasses / totalClasses;

  // 채움률: 인스턴스가 자기 클래스의 각 속성을 실제 값으로 채웠는가.
  const propsByClass = new Map<string, Set<string>>();
  for (const p of model.properties) {
    if (!propsByClass.has(p.classId)) propsByClass.set(p.classId, new Set());
    propsByClass.get(p.classId)!.add(p.id);
  }
  const classByInstance = new Map<string, string>();
  for (const inst of model.instances) classByInstance.set(inst.id, inst.classId);

  let possible = 0;
  for (const inst of model.instances) {
    possible += propsByClass.get(inst.classId)?.size ?? 0;
  }
  let filled = 0;
  for (const v of model.instanceValues) {
    if (!nonEmpty(v.value)) continue;
    const classId = classByInstance.get(v.instanceId);
    // 값의 속성이 인스턴스의 클래스에 속할 때만 유효한 채움으로 센다.
    if (classId && propsByClass.get(classId)?.has(v.propertyId)) filled++;
  }
  const fillRate = possible === 0 ? 1 : filled / possible;

  // 신선도: 구획별 최신 인스턴스 updatedAt → 경과일. 인스턴스 있는 구획만.
  const partitionByClass = new Map<string, string>();
  for (const c of model.classes) partitionByClass.set(c.id, c.partitionId);
  const latestByPartition = new Map<string, number>();
  for (const inst of model.instances) {
    const partition = partitionByClass.get(inst.classId);
    if (!partition) continue;
    const t = Date.parse(inst.updatedAt);
    if (Number.isNaN(t)) continue;
    const prev = latestByPartition.get(partition);
    if (prev === undefined || t > prev) latestByPartition.set(partition, t);
  }

  const freshnessByPartition: PartitionFreshness[] = [];
  const stalePartitionIds: string[] = [];
  let oldestAgeDays: number | null = null;
  for (const [partitionId, latestMs] of latestByPartition) {
    const ageDays = Math.max(0, Math.floor((now - latestMs) / MS_PER_DAY));
    freshnessByPartition.push({
      partitionId,
      latestUpdatedAt: new Date(latestMs).toISOString(),
      ageDays,
    });
    if (ageDays > STALE_DAYS) stalePartitionIds.push(partitionId);
    if (oldestAgeDays === null || ageDays > oldestAgeDays) oldestAgeDays = ageDays;
  }
  freshnessByPartition.sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));

  return {
    totalClasses,
    boundClasses,
    bindingRate,
    totalInstances: model.instances.length,
    fillRate,
    ungroundedClassIds,
    freshnessByPartition,
    stalePartitionIds,
    oldestAgeDays,
  };
}

// ─── CSV 재바인딩 diff ────────────────────────────────────────
// 같은 CSV 재업로드 시 안정식별자(UUIDv5)로 기존 인스턴스와 매칭 → 신규/갱신/소실.
// 중복 생성 없이 기존을 갱신하고, 소실(새 CSV에 없는 기존)은 표시만(HITL, 자동삭제 X).

export interface RebindExistingInstance {
  id: string;
  classId: string;
  name: string;
}
export interface RebindParsedInstance {
  name: string;
  className: string;
}
export interface InstanceRebindDiff {
  // 신규 생성될 인스턴스 이름.
  created: string[];
  // 기존과 매칭되어 갱신될 인스턴스 이름.
  updated: string[];
  // 새 CSV에 없는 기존 인스턴스(같은 클래스 범위) — 표시만.
  missing: { id: string; name: string }[];
}

export function computeInstanceRebindDiff(
  existingInstances: RebindExistingInstance[],
  parsedInstances: RebindParsedInstance[],
  classIdByName: Record<string, string>,
  partition: string,
): InstanceRebindDiff {
  const existingById = new Map(existingInstances.map((i) => [i.id, i]));
  const parsedStableIds = new Set<string>();
  const created: string[] = [];
  const updated: string[] = [];

  for (const p of parsedInstances) {
    const stableId = stableEntityId(p.name, 'instance', partition);
    parsedStableIds.add(stableId);
    if (existingById.has(stableId)) updated.push(p.name);
    else created.push(p.name);
  }

  // 소실: 이 CSV가 다루는 클래스에 속한 기존 인스턴스 중 파싱분에 없는 것.
  const csvClassIds = new Set(
    parsedInstances.map((p) => classIdByName[p.className]).filter(Boolean),
  );
  const missing = existingInstances
    .filter((i) => csvClassIds.has(i.classId) && !parsedStableIds.has(i.id))
    .map((i) => ({ id: i.id, name: i.name }));

  return { created, updated, missing };
}
