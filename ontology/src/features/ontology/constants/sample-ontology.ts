import { NODE_COLORS } from './colors';
import { DEFAULT_PARTITION_ID } from '../lib/types';
import type { OntologyClass, OntologyInstance, OntologyProperty, RelationType, OntologyEdge } from '../lib/types';

function id(prefix: string, n: number) {
  return `sample-${prefix}-${n}`;
}

const now = new Date().toISOString();

export const SAMPLE_CLASSES: OntologyClass[] = [
  { id: id('c', 1), parentId: null, name: 'Equipment', description: '반도체 제조 공정에서 사용되는 장비의 최상위 클래스', color: NODE_COLORS.root, partitionId: DEFAULT_PARTITION_ID, positionX: 0, positionY: 0, createdAt: now, updatedAt: now },
  { id: id('c', 2), parentId: id('c', 1), name: 'DryAsher', description: '건식 애싱 장비 (PR 제거)', color: NODE_COLORS.mid, partitionId: DEFAULT_PARTITION_ID, positionX: 0, positionY: 0, createdAt: now, updatedAt: now },
  { id: id('c', 3), parentId: id('c', 2), name: 'SUPRA', description: 'PSK 대표 DryAsher 모델', color: NODE_COLORS.leaf, partitionId: DEFAULT_PARTITION_ID, positionX: 0, positionY: 0, createdAt: now, updatedAt: now },
  { id: id('c', 4), parentId: id('c', 1), name: 'WetStation', description: '습식 세정 장비', color: NODE_COLORS.mid, partitionId: DEFAULT_PARTITION_ID, positionX: 0, positionY: 0, createdAt: now, updatedAt: now },
  { id: id('c', 5), parentId: null, name: 'Engineer', description: '장비를 관리하는 엔지니어', color: NODE_COLORS.person, partitionId: DEFAULT_PARTITION_ID, positionX: 0, positionY: 0, createdAt: now, updatedAt: now },
  { id: id('c', 6), parentId: null, name: 'Site', description: '제조 공정이 위치한 팹(FAB) 사이트', color: NODE_COLORS.place, partitionId: DEFAULT_PARTITION_ID, positionX: 0, positionY: 0, createdAt: now, updatedAt: now },
];

export const SAMPLE_INSTANCES: OntologyInstance[] = [
  { id: id('i', 1), classId: id('c', 3), name: 'SUPRA XP', createdAt: now, updatedAt: now },
  { id: id('i', 2), classId: id('c', 3), name: 'SUPRA nXP', createdAt: now, updatedAt: now },
  { id: id('i', 3), classId: id('c', 3), name: 'SUPRA Lite', createdAt: now, updatedAt: now },
  { id: id('i', 4), classId: id('c', 4), name: 'WS-001', createdAt: now, updatedAt: now },
  { id: id('i', 5), classId: id('c', 4), name: 'WS-002', createdAt: now, updatedAt: now },
  { id: id('i', 6), classId: id('c', 5), name: '김철수', createdAt: now, updatedAt: now },
  { id: id('i', 7), classId: id('c', 5), name: '이영희', createdAt: now, updatedAt: now },
  { id: id('i', 8), classId: id('c', 5), name: '박지민', createdAt: now, updatedAt: now },
  { id: id('i', 9), classId: id('c', 6), name: 'FAB A', createdAt: now, updatedAt: now },
  { id: id('i', 10), classId: id('c', 6), name: 'FAB B', createdAt: now, updatedAt: now },
  { id: id('i', 11), classId: id('c', 2), name: 'GENEVA', createdAt: now, updatedAt: now },
  { id: id('i', 12), classId: id('c', 1), name: 'ECOLITE', createdAt: now, updatedAt: now },
];

export const SAMPLE_PROPERTIES: OntologyProperty[] = [
  { id: id('p', 1), classId: id('c', 1), name: 'model_name', dataType: 'string', isRequired: false, enumValues: null, constraintRule: null, sortOrder: 0 },
  { id: id('p', 2), classId: id('c', 1), name: 'fab_site', dataType: 'string', isRequired: true, enumValues: null, constraintRule: null, sortOrder: 1 },
  { id: id('p', 3), classId: id('c', 1), name: 'install_date', dataType: 'date', isRequired: false, enumValues: null, constraintRule: null, sortOrder: 2 },
  { id: id('p', 4), classId: id('c', 1), name: 'status', dataType: 'enum', isRequired: false, enumValues: ['가동', '정지', '점검'], constraintRule: null, sortOrder: 3 },
  { id: id('p', 5), classId: id('c', 5), name: 'employee_id', dataType: 'string', isRequired: true, enumValues: null, constraintRule: null, sortOrder: 0 },
];

export const SAMPLE_RELATION_TYPES: RelationType[] = [
  { id: id('r', 1), name: 'located_at', description: '장비가 위치한 사이트', sourceClassId: id('c', 1), targetClassId: id('c', 6), createdAt: now },
  { id: id('r', 2), name: 'assigned_to', description: '엔지니어가 담당하는 장비', sourceClassId: id('c', 5), targetClassId: id('c', 1), createdAt: now },
  { id: id('r', 3), name: 'works_at', description: '엔지니어의 근무 사이트', sourceClassId: id('c', 5), targetClassId: id('c', 6), createdAt: now },
];

export const SAMPLE_EDGES: OntologyEdge[] = [
  { id: id('e', 1), relationTypeId: id('r', 1), sourceId: id('c', 1), targetId: id('c', 6), sourceKind: 'class', targetKind: 'class', createdAt: now },
  { id: id('e', 2), relationTypeId: id('r', 2), sourceId: id('c', 5), targetId: id('c', 1), sourceKind: 'class', targetKind: 'class', createdAt: now },
  { id: id('e', 3), relationTypeId: id('r', 3), sourceId: id('c', 5), targetId: id('c', 6), sourceKind: 'class', targetKind: 'class', createdAt: now },
];

export const SAMPLE_ONTOLOGY = {
  classes: SAMPLE_CLASSES,
  instances: SAMPLE_INSTANCES,
  properties: SAMPLE_PROPERTIES,
  relationTypes: SAMPLE_RELATION_TYPES,
  edges: SAMPLE_EDGES,
  axioms: [],
  instanceValues: [],
};

export const SAMPLE_TEMPLATES = [
  {
    id: 'semiconductor',
    name: '반도체 장비 도메인',
    description: 'Equipment > DryAsher > SUPRA...',
    stats: '클래스 6개, 인스턴스 12개, 관계 3개',
    available: true,
  },
  {
    id: 'manufacturing',
    name: '제조 공정 도메인',
    description: 'Process > Step > Material...',
    stats: '',
    available: false,
  },
  {
    id: 'automotive',
    name: '자동차 부품 도메인',
    description: 'Vehicle > Component > Part...',
    stats: '',
    available: false,
  },
] as const;
