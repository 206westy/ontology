import { describe, it, expect } from 'vitest';
import {
  getColorKey,
  computeNodeSize,
  computeInstanceWidth,
  selectHubIds,
  isHasARelation,
  buildElements,
  diffElementIds,
} from '@/features/ontology/lib/to-cytoscape-elements';
import { NODE_COLORS } from '@/features/ontology/constants/colors';
import type { OntologyClass, OntologyInstance, OntologyEdge, RelationType } from '@/features/ontology/lib/types';

function cls(partial: Partial<OntologyClass> & { id: string; name: string }): OntologyClass {
  return {
    parentId: null,
    description: '',
    color: NODE_COLORS.root,
    positionX: 0,
    positionY: 0,
    createdAt: '',
    updatedAt: '',
    ...partial,
  } as OntologyClass;
}
function inst(id: string, name: string, classId: string): OntologyInstance {
  return { id, name, classId, description: '', createdAt: '', updatedAt: '' };
}
function edge(id: string, sourceId: string, targetId: string, relationTypeId: string): OntologyEdge {
  return { id, sourceId, targetId, relationTypeId, sourceKind: 'class', targetKind: 'class', createdAt: '' };
}
function rel(id: string, name: string): RelationType {
  return { id, name, description: '', category: 'descriptive', sourceClassId: '', targetClassId: '', createdAt: '' };
}

describe('getColorKey', () => {
  it('maps a known hex back to its key, unknown → root', () => {
    expect(getColorKey(NODE_COLORS.person)).toBe('person');
    expect(getColorKey('#123456')).toBe('root');
  });
  it('maps legacy (pre-reskin) palette hex to the correct key', () => {
    // 구 팔레트로 저장된 데이터가 전부 root로 붕괴하지 않아야 함
    expect(getColorKey('#0891b2')).toBe('leaf'); // 구 light leaf
    expect(getColorKey('#dc2626')).toBe('place'); // 구 light place
    expect(getColorKey('#f59e0b')).toBe('person'); // 구 dark person
    expect(getColorKey('#a78bfa')).toBe('artifact'); // 구 dark artifact
  });
});

describe('computeNodeSize', () => {
  it('uses sqrt(degree) scaling, clamped to 36..96', () => {
    expect(computeNodeSize(0)).toBe(36);
    expect(computeNodeSize(4)).toBe(56); // 36 + 10*2
    expect(computeNodeSize(9)).toBe(66); // 36 + 10*3
    expect(computeNodeSize(1000)).toBe(96); // capped (god node 방지)
  });
});

describe('computeInstanceWidth', () => {
  it('grows weakly with degree, clamped to 60..96', () => {
    expect(computeInstanceWidth(0)).toBe(60);
    expect(computeInstanceWidth(1000)).toBe(96);
  });
});

describe('selectHubIds', () => {
  it('picks top-N nodes by degree, excluding degree 0', () => {
    const degrees = new Map([['a', 5], ['b', 9], ['c', 0], ['d', 2]]);
    const hubs = selectHubIds(degrees, 2);
    expect(hubs.has('b')).toBe(true);
    expect(hubs.has('a')).toBe(true);
    expect(hubs.has('d')).toBe(false);
    expect(hubs.has('c')).toBe(false); // degree 0 제외
  });
});

describe('isHasARelation', () => {
  it('detects has-a vocabulary', () => {
    expect(isHasARelation('포함')).toBe(true);
    expect(isHasARelation('속성')).toBe(true);
    expect(isHasARelation('has part')).toBe(true);
    expect(isHasARelation('원인')).toBe(false);
  });
});

describe('buildElements', () => {
  const classes = [
    cls({ id: 'p', name: '부모', color: NODE_COLORS.mid }),
    cls({ id: 'c', name: '자식', parentId: 'p', color: NODE_COLORS.leaf }),
  ];
  const instances = [inst('i1', '인스턴스1', 'c')];
  const edges = [edge('e1', 'p', 'c', 'r1'), edge('e2', 'c', 'p', 'r2')];
  const relationTypes = [rel('r1', '포함'), rel('r2', '원인')];

  const els = buildElements({ classes, instances, edges, relationTypes });
  const byId = new Map(els.map((e) => [String(e.data.id), e]));

  it('creates class/instance nodes with colorKey + size', () => {
    expect(byId.get('p')?.data.kind).toBe('class');
    expect(byId.get('p')?.data.colorKey).toBe('mid');
    expect(byId.get('c')?.data.colorKey).toBe('leaf');
    expect(byId.get('i1')?.data.kind).toBe('instance');
    // 인스턴스는 부모 클래스 colorKey 상속
    expect(byId.get('i1')?.data.colorKey).toBe('leaf');
    // c의 차수 = isa(1) + instanceof(1) + e1(1) + e2(1) = 4 → computeNodeSize(4) = 56
    expect(byId.get('c')?.data.degree).toBe(4);
    expect(byId.get('c')?.data.size).toBe(56);
  });

  it('builds class displayLabel as plain name, and tags instance with classId', () => {
    // displayLabel 은 평소 이름만(개수는 접힐 때 useCytoscape가 `이름 (N)`으로 동적 설정)
    expect(byId.get('c')?.data.displayLabel).toBe('자식');
    expect(byId.get('p')?.data.displayLabel).toBe('부모');
    // 인스턴스 노드는 접힘 토글이 부모별로 찾을 수 있도록 classId 를 가진다
    expect(byId.get('i1')?.data.classId).toBe('c');
  });

  it('marks empty class and isa/instanceof edges', () => {
    // p는 자식 보유 → empty 아님 / c는 인스턴스 있음 → empty 아님
    expect(byId.get('isa-c')?.classes).toBe('isa');
    expect(byId.get('inst-i1')?.classes).toBe('instanceof');
  });

  it('classifies relation edges as hasa vs relation by name', () => {
    expect(byId.get('e1')?.classes).toBe('hasa'); // 포함
    expect(byId.get('e2')?.classes).toBe('relation'); // 원인
    expect(byId.get('e1')?.data.label).toBe('포함');
  });

  it('flags a truly empty class', () => {
    const lone = buildElements({ classes: [cls({ id: 'x', name: '외톨이' })], instances: [], edges: [], relationTypes: [] });
    expect(lone[0].classes).toContain('empty');
  });

  it('drops dangling edges from orphaned data (missing endpoints)', () => {
    // 고아 인스턴스: 소속 클래스(없음)를 가리킴 → instance-of 엣지가 끊김
    const orphanInstance = inst('orphan', '고아', 'missing-class');
    // 끊긴 관계 엣지: source 노드가 존재하지 않음
    const danglingRel = edge('bad', 'missing-src', 'p', 'r1');
    const els = buildElements({
      classes: [cls({ id: 'p', name: '부모' })],
      instances: [orphanInstance],
      edges: [danglingRel],
      relationTypes: [rel('r1', '관계')],
    });
    const ids = new Set(els.map((e) => String(e.data.id)));
    // 고아 인스턴스 노드 자체는 표시되지만(떠 있는 노드), 끊긴 엣지는 제거됨
    expect(ids.has('orphan')).toBe(true);
    expect(ids.has('inst-orphan')).toBe(false); // instance-of 엣지 제거
    expect(ids.has('bad')).toBe(false); // 끊긴 관계 엣지 제거
  });
});

describe('diffElementIds', () => {
  it('computes add/remove/keep', () => {
    const next = [
      { data: { id: 'a' } },
      { data: { id: 'b' } },
      { data: { id: 'c' } },
    ];
    const d = diffElementIds(['b', 'c', 'd'], next);
    expect(d.add.sort()).toEqual(['a']);
    expect(d.remove.sort()).toEqual(['d']);
    expect(d.keep.sort()).toEqual(['b', 'c']);
  });
});
