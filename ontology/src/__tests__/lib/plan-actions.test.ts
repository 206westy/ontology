import { describe, it, expect, beforeEach } from 'vitest';
import { useOntologyStore } from '@/features/ontology/hooks/useOntologyStore';
import { planAssistantActions, type PlanSnapshot } from '@/features/ontology/lib/plan-actions';
import type { OntologyAction } from '@/features/ontology/lib/schemas';

function resetStore() {
  useOntologyStore.setState({
    classes: [],
    instances: [],
    properties: [],
    relationTypes: [],
    edges: [],
    instanceValues: [],
    selectedNodeId: null,
    selectedNodeType: null,
    pendingChanges: [],
    popoverState: null,
    expandedNodes: new Set<string>(),
    focusNodeId: null,
    highlightNodeIds: [],
  });
}

// 현재 store 상태로부터 미리보기 스냅샷을 만든다(previewAssistantActions 와 동일).
function snapshotFromStore(): PlanSnapshot {
  const s = useOntologyStore.getState();
  return {
    classes: s.classes.map((c) => ({ id: c.id, name: c.name })),
    instances: s.instances.map((i) => ({ id: i.id, name: i.name, classId: i.classId })),
    properties: s.properties.map((p) => ({ name: p.name, classId: p.classId })),
    relationTypes: s.relationTypes.map((r) => ({ id: r.id, name: r.name })),
    edges: s.edges.map((e) => ({ relationTypeId: e.relationTypeId, sourceId: e.sourceId, targetId: e.targetId })),
  };
}

describe('planAssistantActions — 순수 결과 계산', () => {
  beforeEach(resetStore);

  it('단일 클래스 추가를 create 로 계획한다', () => {
    const plan = planAssistantActions(snapshotFromStore(), [
      { op: 'add_class', label: 'Animal 추가', payload: { name: 'Animal' } },
    ]);
    expect(plan.summary).toEqual({ create: 1, update: 0, skip: 0, total: 1 });
    expect(plan.outcomes[0].status).toBe('create');
    expect(plan.outcomes[0].kind).toBe('class');
  });

  it('배치 내에서 앞 액션이 만든 클래스를 뒤 액션이 부모/클래스로 해석한다', () => {
    const plan = planAssistantActions(snapshotFromStore(), [
      { op: 'add_class', label: 'Animal', payload: { name: 'Animal' } },
      { op: 'add_class', label: 'Dog', payload: { name: 'Dog', parentName: 'Animal' } },
      { op: 'add_instance', label: 'Rex', payload: { className: 'Dog', name: 'Rex' } },
    ]);
    expect(plan.summary.create).toBe(3);
    expect(plan.summary.skip).toBe(0);
  });

  it('부모를 찾을 수 없는 클래스 추가를 skip + 사유로 계획한다', () => {
    const plan = planAssistantActions(snapshotFromStore(), [
      { op: 'add_class', label: 'Dog', payload: { name: 'Dog', parentName: 'Ghost' } },
    ]);
    expect(plan.summary.skip).toBe(1);
    expect(plan.outcomes[0].status).toBe('skip');
    expect(plan.outcomes[0].reason).toContain('상위 클래스를 찾을 수 없습니다');
  });

  it('store 를 변형하지 않는다(읽기 전용)', () => {
    const before = useOntologyStore.getState().classes.length;
    planAssistantActions(snapshotFromStore(), [
      { op: 'add_class', label: 'X', payload: { name: 'X' } },
    ]);
    expect(useOntologyStore.getState().classes.length).toBe(before);
  });
});

describe('previewAssistantActions(store) === applyAssistantActions 패리티', () => {
  beforeEach(resetStore);

  // 동일 초기 상태에서 미리보기와 실제 적용의 skip(라벨+사유)·적용 건수가 일치해야 한다.
  const cases: { name: string; seed?: () => void; actions: OntologyAction[] }[] = [
    {
      name: '혼합 배치(생성 + 부모 누락 skip + 중복 skip)',
      seed: () => {
        useOntologyStore.getState().addClass({ name: 'Animal' });
      },
      actions: [
        { op: 'add_class', label: 'dup-animal', payload: { name: 'animal' } }, // 중복 skip
        { op: 'add_class', label: 'Dog', payload: { name: 'Dog', parentName: 'Animal' } }, // create
        { op: 'add_instance', label: 'Rex', payload: { className: 'Dog', name: 'Rex' } }, // create(배치 의존)
        { op: 'add_instance', label: 'ghost-inst', payload: { className: 'Ghost', name: 'X' } }, // 클래스 없음 skip
        { op: 'add_property', label: 'p-enum', payload: { className: 'Dog', name: 'kind', dataType: 'enum' } }, // enum 값 없음 skip
      ],
    },
    {
      name: '관계 타입 + 엣지 + 자기참조 skip',
      seed: () => {
        const s = useOntologyStore.getState();
        s.addClass({ name: 'Person' });
        s.addClass({ name: 'Company' });
      },
      actions: [
        { op: 'add_relation_type', label: 'rt', payload: { name: 'worksFor', sourceClassName: 'Person', targetClassName: 'Company' } },
        { op: 'add_edge', label: 'e1', payload: { relationTypeName: 'worksFor', sourceName: 'Person', targetName: 'Company' } },
        { op: 'add_edge', label: 'self', payload: { relationTypeName: 'worksFor', sourceName: 'Person', targetName: 'Person' } },
        { op: 'add_edge', label: 'no-rt', payload: { relationTypeName: 'Ghost', sourceName: 'Person', targetName: 'Company' } },
      ],
    },
    {
      name: 'update_class(존재/부재)',
      seed: () => {
        useOntologyStore.getState().addClass({ name: 'Car' });
      },
      actions: [
        { op: 'update_class', label: 'u1', payload: { className: 'Car', description: 'a vehicle' } },
        { op: 'update_class', label: 'u2', payload: { className: 'Ghost', description: 'x' } },
      ],
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      c.seed?.();
      // 1) 적용 전 상태 스냅샷으로 미리보기
      const plan = planAssistantActions(snapshotFromStore(), c.actions);
      const previewSkips = plan.outcomes
        .filter((o) => o.status === 'skip')
        .map((o) => `${o.label}::${o.reason}`)
        .sort();
      const previewApplyCount = plan.outcomes.filter((o) => o.status !== 'skip').length;

      // 2) 실제 적용
      const res = useOntologyStore.getState().applyAssistantActions(c.actions);
      const applySkips = res.skipped.map((s) => `${s.label}::${s.reason}`).sort();
      const applyApplyCount = c.actions.length - res.skipped.length;

      // 3) skip(라벨+사유) 집합과 적용 건수가 일치
      expect(previewSkips).toEqual(applySkips);
      expect(previewApplyCount).toBe(applyApplyCount);
    });
  }
});
