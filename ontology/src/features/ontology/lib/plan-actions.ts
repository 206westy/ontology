import type {
  OntologyClass,
  OntologyInstance,
  OntologyProperty,
  RelationType,
  OntologyEdge,
} from './types';
import type { OntologyAction } from './schemas';

// 적용 전(前) 미리보기용 순수 시뮬레이터.
// store 의 applyAssistantActions 와 "동일한 결정 규칙"을 재현하되,
// 실제 변형(set)·id 발급 없이 각 액션의 예상 결과만 계산한다.
// 미리보기와 실제 적용의 결과가 어긋나면 신뢰를 해치므로, 두 경로는
// 같은 판정 로직을 공유해야 하며 plan-actions.test.ts 가 패리티를 강제한다.

export type ActionStatus = 'create' | 'update' | 'skip';
export type ActionKind = 'class' | 'property' | 'instance' | 'relation_type' | 'edge';

export interface ActionOutcome {
  label: string;
  op: OntologyAction['op'];
  kind: ActionKind;
  status: ActionStatus;
  /** 사람이 읽을 수 있는 "무엇이 일어나는지" 요약 */
  detail: string;
  /** status === 'skip' 일 때만 채워지는 사유(applyAssistantActions 와 동일 문구) */
  reason?: string;
}

export interface PlanSummary {
  create: number;
  update: number;
  skip: number;
  total: number;
}

export interface ActionPlan {
  outcomes: ActionOutcome[];
  summary: PlanSummary;
}

// 결정에 필요한 최소 필드만 받는 스냅샷(읽기 전용).
export interface PlanSnapshot {
  classes: Pick<OntologyClass, 'id' | 'name'>[];
  instances: Pick<OntologyInstance, 'id' | 'name' | 'classId'>[];
  properties: Pick<OntologyProperty, 'name' | 'classId'>[];
  relationTypes: Pick<RelationType, 'id' | 'name'>[];
  edges: Pick<OntologyEdge, 'relationTypeId' | 'sourceId' | 'targetId'>[];
}

const KIND_BY_OP: Record<OntologyAction['op'], ActionKind> = {
  add_class: 'class',
  add_property: 'property',
  add_instance: 'instance',
  add_relation_type: 'relation_type',
  add_edge: 'edge',
  update_class: 'class',
};

const norm = (s: string) => s.trim().toLowerCase();

/**
 * 액션 배치를 순차 시뮬레이션해 각 액션의 예상 결과(create/update/skip + 사유)를
 * 반환한다. 앞선 액션이 만든 엔티티를 뒤 액션이 참조할 수 있도록(예: 클래스 생성
 * 후 그 하위 인스턴스 추가) 가벼운 작업 사본에 placeholder 를 누적한다.
 */
export function planAssistantActions(
  snapshot: PlanSnapshot,
  actions: OntologyAction[],
): ActionPlan {
  // 작업 사본 — id 는 결정(중복·참조 해석)에만 쓰이므로 placeholder 로 충분(순수·결정적).
  const classes = snapshot.classes.map((c) => ({ id: c.id, name: c.name }));
  const instances = snapshot.instances.map((i) => ({ id: i.id, name: i.name, classId: i.classId }));
  const properties = snapshot.properties.map((p) => ({ name: p.name, classId: p.classId }));
  const relationTypes = snapshot.relationTypes.map((r) => ({ id: r.id, name: r.name }));
  const edges = snapshot.edges.map((e) => ({
    relationTypeId: e.relationTypeId,
    sourceId: e.sourceId,
    targetId: e.targetId,
  }));

  let placeholderSeq = 0;
  const nextId = () => `__plan_${placeholderSeq++}`;

  const findClass = (name: string) => classes.find((c) => norm(c.name) === norm(name));
  const findInstance = (name: string) => instances.find((i) => norm(i.name) === norm(name));
  const findRelType = (name: string) => relationTypes.find((r) => norm(r.name) === norm(name));
  const resolveNode = (name: string): { id: string } | null => {
    const c = findClass(name);
    if (c) return { id: c.id };
    const i = findInstance(name);
    if (i) return { id: i.id };
    return null;
  };

  const outcomes: ActionOutcome[] = [];

  for (const action of actions) {
    const base = { label: action.label, op: action.op, kind: KIND_BY_OP[action.op] };
    const skip = (reason: string): void => {
      outcomes.push({ ...base, status: 'skip', detail: reason, reason });
    };

    if (action.op === 'add_class') {
      const { name, parentName } = action.payload;
      if (findClass(name)) { skip(`이미 존재하는 클래스입니다: ${name}`); continue; }
      if (parentName && !findClass(parentName)) {
        skip(`상위 클래스를 찾을 수 없습니다: ${parentName}`);
        continue;
      }
      classes.push({ id: nextId(), name });
      outcomes.push({
        ...base,
        status: 'create',
        detail: parentName ? `클래스 "${name}" 추가 (상위: ${parentName})` : `클래스 "${name}" 추가`,
      });
      continue;
    }

    if (action.op === 'add_property') {
      const { className, name, dataType, enumValues } = action.payload;
      const cls = findClass(className);
      if (!cls) { skip(`클래스를 찾을 수 없습니다: ${className}`); continue; }
      if (properties.some((p) => p.classId === cls.id && norm(p.name) === norm(name))) {
        skip(`이미 존재하는 프로퍼티입니다: ${className}.${name}`);
        continue;
      }
      if (dataType === 'enum' && (!enumValues || enumValues.length === 0)) {
        skip(`enum 타입은 enumValues가 필요합니다: ${name}`);
        continue;
      }
      properties.push({ name, classId: cls.id });
      outcomes.push({ ...base, status: 'create', detail: `프로퍼티 "${className}.${name}" 추가 (${dataType})` });
      continue;
    }

    if (action.op === 'add_instance') {
      const { className, name } = action.payload;
      const cls = findClass(className);
      if (!cls) { skip(`클래스를 찾을 수 없습니다: ${className}`); continue; }
      if (instances.some((i) => i.classId === cls.id && norm(i.name) === norm(name))) {
        skip(`이미 존재하는 인스턴스입니다: ${name}`);
        continue;
      }
      instances.push({ id: nextId(), name, classId: cls.id });
      outcomes.push({ ...base, status: 'create', detail: `인스턴스 "${name}" 추가 (클래스: ${className})` });
      continue;
    }

    if (action.op === 'add_relation_type') {
      const { name, sourceClassName, targetClassName } = action.payload;
      if (findRelType(name)) { skip(`이미 존재하는 관계 타입입니다: ${name}`); continue; }
      if (sourceClassName && !findClass(sourceClassName)) {
        skip(`출발 클래스를 찾을 수 없습니다: ${sourceClassName}`);
        continue;
      }
      if (targetClassName && !findClass(targetClassName)) {
        skip(`도착 클래스를 찾을 수 없습니다: ${targetClassName}`);
        continue;
      }
      relationTypes.push({ id: nextId(), name });
      outcomes.push({ ...base, status: 'create', detail: `관계 타입 "${name}" 추가` });
      continue;
    }

    if (action.op === 'add_edge') {
      const { relationTypeName, sourceName, targetName } = action.payload;
      const rt = findRelType(relationTypeName);
      if (!rt) { skip(`관계 타입을 찾을 수 없습니다: ${relationTypeName}`); continue; }
      const s = resolveNode(sourceName);
      if (!s) { skip(`출발 노드를 찾을 수 없습니다: ${sourceName}`); continue; }
      const t = resolveNode(targetName);
      if (!t) { skip(`도착 노드를 찾을 수 없습니다: ${targetName}`); continue; }
      if (s.id === t.id) { skip(`출발과 도착이 같습니다: ${sourceName}`); continue; }
      if (edges.some((e) => e.relationTypeId === rt.id && e.sourceId === s.id && e.targetId === t.id)) {
        skip(`이미 존재하는 관계입니다: ${sourceName} → ${targetName}`);
        continue;
      }
      edges.push({ relationTypeId: rt.id, sourceId: s.id, targetId: t.id });
      outcomes.push({
        ...base,
        status: 'create',
        detail: `관계 "${sourceName} → ${targetName}" 추가 (${relationTypeName})`,
      });
      continue;
    }

    if (action.op === 'update_class') {
      const { className } = action.payload;
      if (!findClass(className)) { skip(`클래스를 찾을 수 없습니다: ${className}`); continue; }
      outcomes.push({ ...base, status: 'update', detail: `클래스 "${className}" 수정` });
      continue;
    }
  }

  const summary: PlanSummary = {
    create: outcomes.filter((o) => o.status === 'create').length,
    update: outcomes.filter((o) => o.status === 'update').length,
    skip: outcomes.filter((o) => o.status === 'skip').length,
    total: outcomes.length,
  };

  return { outcomes, summary };
}
