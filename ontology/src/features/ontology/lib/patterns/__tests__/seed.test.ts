import { describe, it, expect } from 'vitest';
import { patternToImportPayload, buildSeedPreview } from '../seed';
import type { Pattern } from '../types';

// PRD-BM-D01 M0-1: 패턴 번들 → 그래프 import payload 결정적 변환기(무LLM).
// roles → classes, relationTypes → relation_types + edges. sourceRole/targetRole 해소.

function makePattern(overrides: Partial<Pattern> = {}): Pattern {
  return {
    id: 'pat-1',
    key: 'equipment',
    name: 'Equipment Domain',
    nameKo: '장비 도메인',
    version: 1,
    domain: 'equipment',
    roles: [
      { name: 'Equipment', nodeKind: 'class', description: '장비' },
      { name: 'Engineer', nodeKind: 'class', description: '엔지니어' },
      { name: 'Site', nodeKind: 'class', description: '사이트' },
    ],
    relationTypes: [
      { name: 'located_at', layer: 'semantic', sourceRole: 'Equipment', targetRole: 'Site' },
      { name: 'assigned_to', layer: 'kinetic', sourceRole: 'Engineer', targetRole: 'Equipment' },
    ],
    competencyQuestions: ['장비는 어디에 있는가?'],
    traversalTemplates: [],
    method: 'synthesized',
    sourceRepo: null,
    sourceUri: null,
    sourceLabel: null,
    license: null,
    occurrenceCount: 1,
    isDraft: false,
    previousVersionId: null,
    createdAt: '2026-07-13T00:00:00.000Z',
    ...overrides,
  };
}

const PARTITION = '11111111-1111-1111-1111-111111111111';

function seqIdFn() {
  let n = 0;
  return () => `id-${n++}`;
}

describe('patternToImportPayload', () => {
  it('roles 3개 relations 2개(모두 해소) → classes 3, relationTypes 2, edges 2', () => {
    // Arrange
    const pattern = makePattern();

    // Act
    const payload = patternToImportPayload(pattern, PARTITION, {
      idFn: seqIdFn(),
      now: '2026-07-13T00:00:00.000Z',
    });

    // Assert
    expect(payload.classes).toHaveLength(3);
    expect(payload.relationTypes).toHaveLength(2);
    expect(payload.edges).toHaveLength(2);
    expect(payload.properties).toEqual([]);
    expect(payload.instances).toEqual([]);
    expect(payload.instanceValues).toEqual([]);
  });

  it('모든 class 를 지정 partitionId 로 귀속하고 flat(parentId=null) 로 시작', () => {
    const payload = patternToImportPayload(makePattern(), PARTITION, { idFn: seqIdFn() });
    for (const cls of payload.classes) {
      expect(cls.partitionId).toBe(PARTITION);
      expect(cls.parentId).toBeNull();
    }
  });

  it('relationType 의 sourceClassId/targetClassId 를 role 이름 → 생성 classId 로 정확히 해소', () => {
    const payload = patternToImportPayload(makePattern(), PARTITION, { idFn: seqIdFn() });
    const byName = new Map(payload.classes.map((c) => [c.name, c.id]));

    const located = payload.relationTypes.find((r) => r.name === 'located_at')!;
    expect(located.sourceClassId).toBe(byName.get('Equipment'));
    expect(located.targetClassId).toBe(byName.get('Site'));
    expect(located.layer).toBe('semantic');

    const assigned = payload.relationTypes.find((r) => r.name === 'assigned_to')!;
    expect(assigned.layer).toBe('kinetic');
  });

  it('edge 는 relationType 을 참조하고 class↔class 로 생성', () => {
    const payload = patternToImportPayload(makePattern(), PARTITION, { idFn: seqIdFn() });
    const rtIds = new Set(payload.relationTypes.map((r) => r.id));
    for (const edge of payload.edges) {
      expect(rtIds.has(edge.relationTypeId)).toBe(true);
      expect(edge.sourceKind).toBe('class');
      expect(edge.targetKind).toBe('class');
      expect(edge.sourceId).toBe(payload.relationTypes.find((r) => r.id === edge.relationTypeId)!.sourceClassId);
    }
  });

  it('해소 불가 관계(role 에 없는 targetRole)는 조용히 버리지 않고 제외 + 나머지는 유지', () => {
    // Arrange: dangling 관계 추가
    const pattern = makePattern({
      relationTypes: [
        { name: 'located_at', layer: 'semantic', sourceRole: 'Equipment', targetRole: 'Site' },
        { name: 'dangling', layer: 'semantic', sourceRole: 'Equipment', targetRole: 'Ghost' },
      ],
    });

    // Act
    const payload = patternToImportPayload(pattern, PARTITION, { idFn: seqIdFn() });

    // Assert: 해소된 1개만 생성
    expect(payload.relationTypes).toHaveLength(1);
    expect(payload.edges).toHaveLength(1);
    expect(payload.relationTypes[0].name).toBe('located_at');
  });

  it('roles 가 비면 빈 payload', () => {
    const payload = patternToImportPayload(
      makePattern({ roles: [], relationTypes: [] }),
      PARTITION,
      { idFn: seqIdFn() },
    );
    expect(payload.classes).toEqual([]);
    expect(payload.relationTypes).toEqual([]);
    expect(payload.edges).toEqual([]);
  });

  it('중복 role 이름은 하나의 class 로 dedupe', () => {
    const payload = patternToImportPayload(
      makePattern({
        roles: [
          { name: 'Equipment', nodeKind: 'class', description: 'a' },
          { name: 'Equipment', nodeKind: 'class', description: 'b' },
        ],
        relationTypes: [],
      }),
      PARTITION,
      { idFn: seqIdFn() },
    );
    expect(payload.classes).toHaveLength(1);
  });

  it('색은 하드코딩이 아니라 NODE_COLORS 팔레트에서 배정(첫 role = root)', () => {
    const payload = patternToImportPayload(makePattern(), PARTITION, { idFn: seqIdFn() });
    // 첫 클래스는 root 색(#4026c5), 모든 색은 # 로 시작하는 hex
    expect(payload.classes[0].color).toBe('#4026c5');
    for (const c of payload.classes) {
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('idFn 주입으로 결정적 id 생성(class 먼저, 이후 관계별 rt→edge 순)', () => {
    const payload = patternToImportPayload(makePattern(), PARTITION, { idFn: seqIdFn() });
    expect(payload.classes.map((c) => c.id)).toEqual(['id-0', 'id-1', 'id-2']);
    // relation 0: rt=id-3, edge=id-4 / relation 1: rt=id-5, edge=id-6
    expect(payload.relationTypes.map((r) => r.id)).toEqual(['id-3', 'id-5']);
    expect(payload.edges.map((e) => e.id)).toEqual(['id-4', 'id-6']);
  });
});

describe('buildSeedPreview', () => {
  it('클래스/관계 수와 role 이름, skip 된 관계를 요약', () => {
    const pattern = makePattern({
      relationTypes: [
        { name: 'located_at', layer: 'semantic', sourceRole: 'Equipment', targetRole: 'Site' },
        { name: 'dangling', layer: 'semantic', sourceRole: 'Equipment', targetRole: 'Ghost' },
      ],
    });

    const preview = buildSeedPreview(pattern);

    expect(preview.classCount).toBe(3);
    expect(preview.relationCount).toBe(1);
    expect(preview.skippedRelations).toEqual(['dangling']);
    expect(preview.roleNames).toEqual(['Equipment', 'Engineer', 'Site']);
  });

  it('빈 패턴은 0 요약', () => {
    const preview = buildSeedPreview(makePattern({ roles: [], relationTypes: [] }));
    expect(preview.classCount).toBe(0);
    expect(preview.relationCount).toBe(0);
    expect(preview.skippedRelations).toEqual([]);
  });
});
