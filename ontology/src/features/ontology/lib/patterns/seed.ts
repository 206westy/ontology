import type { OntologyClass, OntologyEdge, RelationType } from '../types';
import type { Pattern } from './types';
import { NODE_COLORS } from '../../constants/colors';
import { uuid } from '../uuid';

// PRD-BM-D01 (M0-1): 패턴 번들 → 그래프 import payload 결정적 변환기.
// LLM 없이 roles → classes, relationTypes → relation_types + edges 로 매핑한다.
// "입력 매핑"(Palantir Marketplace 벤치마크)을 결정적으로 수행하는 시딩의 코어.
// DB-프리 순수 함수 — 훅이 이 payload 를 새 구획으로 importOntology 한다.
// idFn/now/colorFor 주입(DI)으로 네트워크·시간 의존 없이 단위테스트 가능.

// 색은 하드코딩 팔레트가 아니라 NODE_COLORS(보라 램프)에서 배정한다(디자인 토큰 준수).
const COLOR_RAMP: (keyof typeof NODE_COLORS)[] = [
  'root',
  'mid',
  'leaf',
  'concept',
  'process',
  'artifact',
  'person',
  'place',
  'event',
  'instance',
];

export interface SeedOptions {
  /** id 생성기(기본 uuid) — 테스트 결정성 위해 주입 가능. */
  idFn?: () => string;
  /** 생성 시각 ISO 문자열(기본 now). */
  now?: string;
  /** class 색 배정기(기본 NODE_COLORS 램프). */
  colorFor?: (index: number) => string;
}

// import 라우트의 ontology 페이로드 형태(구획 스코프 시딩).
export interface SeedOntologyPayload {
  classes: OntologyClass[];
  relationTypes: RelationType[];
  edges: OntologyEdge[];
  properties: never[];
  instances: never[];
  instanceValues: never[];
  constraints: never[];
}

// 시딩 전 HITL 프리뷰용 요약(무엇이 만들어지는지 + 버려지는 관계 명시).
export interface SeedPreview {
  classCount: number;
  relationCount: number;
  /** sourceRole/targetRole 가 roles 에 없어 시드에서 제외되는 관계 이름들(조용한 누락 금지). */
  skippedRelations: string[];
  roleNames: string[];
}

function defaultColorFor(index: number): string {
  const key = COLOR_RAMP[index % COLOR_RAMP.length];
  return NODE_COLORS[key];
}

/** roles → classes, relationTypes → relation_types + edges. 미해소 관계는 제외한다. */
export function patternToImportPayload(
  pattern: Pattern,
  partitionId: string,
  opts: SeedOptions = {},
): SeedOntologyPayload {
  const idFn = opts.idFn ?? uuid;
  const now = opts.now ?? new Date().toISOString();
  const colorFor = opts.colorFor ?? defaultColorFor;

  // 1) roles → classes (이름 기준 dedupe, first wins). flat(parentId=null)로 시작.
  const seen = new Set<string>();
  const classes: OntologyClass[] = [];
  const classIdByRole = new Map<string, string>();
  for (const role of pattern.roles) {
    if (seen.has(role.name)) continue;
    seen.add(role.name);
    const id = idFn();
    classIdByRole.set(role.name, id);
    classes.push({
      id,
      parentId: null,
      partitionId,
      name: role.name,
      description: role.description ?? '',
      color: colorFor(classes.length),
      positionX: 0,
      positionY: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  // 2) relationTypes → relation_types + edges. source/target role → classId 해소.
  const relationTypes: RelationType[] = [];
  const edges: OntologyEdge[] = [];
  for (const rt of pattern.relationTypes) {
    const sourceClassId = classIdByRole.get(rt.sourceRole);
    const targetClassId = classIdByRole.get(rt.targetRole);
    if (!sourceClassId || !targetClassId) continue; // dangling → 제외(프리뷰가 보고)
    const relationTypeId = idFn();
    relationTypes.push({
      id: relationTypeId,
      name: rt.name,
      description: '',
      layer: rt.layer,
      sourceClassId,
      targetClassId,
      createdAt: now,
    });
    edges.push({
      id: idFn(),
      relationTypeId,
      sourceId: sourceClassId,
      targetId: targetClassId,
      sourceKind: 'class',
      targetKind: 'class',
      createdAt: now,
    });
  }

  return {
    classes,
    relationTypes,
    edges,
    properties: [],
    instances: [],
    instanceValues: [],
    constraints: [],
  };
}

/** 시딩 전 컨펌 카드에 보여줄 요약(생성될 클래스/관계 수 + 제외될 관계). */
export function buildSeedPreview(pattern: Pattern): SeedPreview {
  const roleNames = [...new Set(pattern.roles.map((r) => r.name))];
  const roleSet = new Set(roleNames);
  const isResolvable = (rt: Pattern['relationTypes'][number]) =>
    roleSet.has(rt.sourceRole) && roleSet.has(rt.targetRole);

  return {
    classCount: roleNames.length,
    relationCount: pattern.relationTypes.filter(isResolvable).length,
    skippedRelations: pattern.relationTypes.filter((rt) => !isResolvable(rt)).map((rt) => rt.name),
    roleNames,
  };
}
