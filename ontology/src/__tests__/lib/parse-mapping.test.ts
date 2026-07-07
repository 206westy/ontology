import { describe, it, expect } from 'vitest';
import { mapParseResult, findPossibleDuplicates, computeIslands, partitionRelationsByLayer } from '@/features/ontology/lib/parse-mapping';
import type { LlmParseResult } from '@/features/ontology/api';

describe('mapParseResult (A-1)', () => {
  it('turns each distinct type into a parent class and each entity into a child', () => {
    const res: LlmParseResult = {
      entities: [
        { name: 'Chuck', type: '하드웨어', evidence: 'Chuck holds the wafer' },
        { name: 'RF Matcher', type: '하드웨어', evidence: 'RF Matcher tunes RF' },
        { name: 'MW Power', type: '공정 파라미터', evidence: 'MW Power drives plasma' },
      ],
      relations: [],
    };

    const out = mapParseResult(res, new Set());
    const byName = new Map(out.classes.map((c) => [c.name, c]));

    expect(byName.get('하드웨어')?.parentName).toBeNull();
    expect(byName.get('공정 파라미터')?.parentName).toBeNull();
    expect(byName.get('Chuck')?.parentName).toBe('하드웨어');
    expect(byName.get('RF Matcher')?.parentName).toBe('하드웨어');
    expect(byName.get('MW Power')?.parentName).toBe('공정 파라미터');
  });

  it('builds a multi-level class hierarchy and a mid-level class keeps its own parent', () => {
    // 동물 → {코끼리, 사자} → 코끼리: {코카서스, 파이톤}. 코끼리는 동물의 자식이면서
    // 코카서스/파이톤의 부모 — 중간 클래스가 부모(동물)를 잃지 않아야 한다.
    const res: LlmParseResult = {
      entities: [
        { name: '코끼리', type: '동물', nodeKind: 'class', parentType: null, evidence: '동물에는 코끼리가 있다', properties: [] },
        { name: '사자', type: '동물', nodeKind: 'class', parentType: null, evidence: 'x', properties: [] },
        { name: '코카서스', type: '코끼리', nodeKind: 'class', parentType: null, evidence: '코끼리의 종은 코카서스', properties: [] },
        { name: '파이톤', type: '코끼리', nodeKind: 'class', parentType: null, evidence: 'y', properties: [] },
      ],
      relations: [],
    };
    const out = mapParseResult(res, new Set());
    const byName = new Map(out.classes.map((c) => [c.name, c]));
    expect(byName.get('동물')?.parentName).toBeNull(); // 최상위 루트
    expect(byName.get('코끼리')?.parentName).toBe('동물'); // 중간 클래스가 부모 유지(핵심)
    expect(byName.get('사자')?.parentName).toBe('동물');
    expect(byName.get('코카서스')?.parentName).toBe('코끼리'); // 잎이 중간 클래스 아래로
    expect(byName.get('파이톤')?.parentName).toBe('코끼리');
  });

  it('keeps similarly named but different-kind concepts separate', () => {
    const res: LlmParseResult = {
      entities: [
        { name: 'Chuck', type: '하드웨어', evidence: 'a part' },
        { name: 'Chuck 온도', type: '파라미터', evidence: 'a parameter' },
      ],
      relations: [],
    };
    const out = mapParseResult(res, new Set());
    const names = out.classes.map((c) => c.name);
    expect(names).toContain('Chuck');
    expect(names).toContain('Chuck 온도');
  });

  it('carries relation evidence and confidence through', () => {
    const res: LlmParseResult = {
      entities: [
        { name: 'MW Power', type: '파라미터', evidence: 'x' },
        { name: 'Particle', type: '결과', evidence: 'y' },
      ],
      relations: [
        { source: 'MW Power', target: 'Particle', type: '증가시킨다', layer: 'semantic', evidence: 'MW Power가 높으면 Particle 증가', confidence: 0.9 },
      ],
    };
    const out = mapParseResult(res, new Set());
    expect(out.relations).toHaveLength(1);
    expect(out.relations[0]).toMatchObject({
      sourceName: 'MW Power',
      targetName: 'Particle',
      relationName: '증가시킨다',
      confidence: 0.9,
    });
    expect(out.relations[0].evidence).toContain('Particle 증가');
  });

  it('carries the layer through to the mapped relation (PRD-L M2)', () => {
    const res: LlmParseResult = {
      entities: [
        { name: 'MW Power', type: '파라미터', evidence: 'x' },
        { name: 'Particle', type: '결과', evidence: 'y' },
      ],
      relations: [
        { source: 'MW Power', target: 'Particle', type: '증가시킨다', layer: 'semantic', evidence: 'e', confidence: 0.9 },
      ],
    };
    const out = mapParseResult(res, new Set());
    expect(out.relations[0].layer).toBe('semantic');
  });

  it('does not re-create existing classes (node reuse)', () => {
    const res: LlmParseResult = {
      entities: [{ name: 'Chuck', type: '하드웨어', evidence: 'x' }],
      relations: [],
    };
    const out = mapParseResult(res, new Set(['Chuck']));
    expect(out.classes.find((c) => c.name === 'Chuck')).toBeUndefined();
  });

  it('materializes relation endpoints that were not extracted as entities', () => {
    const res: LlmParseResult = {
      entities: [{ name: 'Chuck', type: '하드웨어', evidence: 'x' }],
      relations: [
        { source: 'Chuck', target: 'RF Matcher', type: '연결', layer: 'semantic', evidence: 'z', confidence: 0.6 },
      ],
    };
    const out = mapParseResult(res, new Set());
    // RF Matcher was only referenced by a relation — still becomes a node so the edge resolves.
    expect(out.classes.find((c) => c.name === 'RF Matcher')).toBeDefined();
    // H1: the fabricated endpoint must surface as a warning, not vanish silently.
    expect(out.warnings.some((w) => w.kind === 'placeholder_endpoint' && w.name === 'RF Matcher')).toBe(true);
  });

  it('never produces properties or instances from class-only extraction', () => {
    const res: LlmParseResult = {
      entities: [{ name: 'A', type: 'T', evidence: 'x' }],
      relations: [],
    };
    const out = mapParseResult(res, new Set());
    expect(out.properties).toEqual([]);
    expect(out.instances).toEqual([]);
  });

  it('defaults missing nodeKind to class (back-compat)', () => {
    const res: LlmParseResult = {
      entities: [{ name: 'Equipment', type: 'Category', evidence: 'x' }],
      relations: [],
    };
    const out = mapParseResult(res, new Set());
    expect(out.classes.find((c) => c.name === 'Equipment')).toBeDefined();
    expect(out.instances).toEqual([]);
  });
});

describe('mapParseResult class/instance split (A-1.1)', () => {
  it('classifies an instance under its parentType class with values, and puts the property DEFINITION on the class', () => {
    const res: LlmParseResult = {
      entities: [
        { name: '하드웨어 부품', type: '범주', nodeKind: 'class', parentType: null, evidence: '', properties: [] },
        {
          name: 'PLATE_ELECTRODE',
          type: '하드웨어 부품',
          nodeKind: 'instance',
          parentType: '하드웨어 부품',
          evidence: 'PLATE_ELECTRODE KC0330655',
          properties: [{ name: 'partNumber', value: 'KC0330655', dataType: 'string', enumValues: null }],
        },
      ],
      relations: [],
    };
    const out = mapParseResult(res, new Set());

    // class exists, instance attached, instance is NOT a class
    expect(out.classes.find((c) => c.name === '하드웨어 부품')).toBeDefined();
    expect(out.classes.find((c) => c.name === 'PLATE_ELECTRODE')).toBeUndefined();
    const inst = out.instances.find((i) => i.name === 'PLATE_ELECTRODE');
    expect(inst?.className).toBe('하드웨어 부품');

    // KC0330655 is an instance VALUE, not on the class schema
    expect(inst?.values?.[0]).toMatchObject({ propertyName: 'partNumber', value: 'KC0330655' });

    // class gains the property DEFINITION (no value)
    const def = out.properties.find((p) => p.className === '하드웨어 부품' && p.name === 'partNumber');
    expect(def?.dataType).toBe('string');
    expect(def).not.toHaveProperty('value');
  });

  it('carries enumValues from an instance mode-property into the class property definition (PR1 목표②)', () => {
    const res: LlmParseResult = {
      entities: [
        {
          name: 'Chatbot-1',
          type: '봇',
          nodeKind: 'instance',
          parentType: '봇',
          evidence: 'Chatbot-1 runs in RAG mode',
          properties: [
            { name: 'mode', value: 'RAG', dataType: 'enum', enumValues: ['RAG', 'Agent'] },
          ],
        },
      ],
      relations: [],
    };
    const out = mapParseResult(res, new Set());
    const def = out.properties.find((p) => p.className === '봇' && p.name === 'mode');
    expect(def?.dataType).toBe('enum');
    expect(def?.enumValues).toEqual(['RAG', 'Agent']);
  });

  it('creates the parent class if the instance references one not extracted', () => {
    const res: LlmParseResult = {
      entities: [
        { name: 'Chuck', type: '하드웨어 부품', nodeKind: 'instance', parentType: '하드웨어 부품', evidence: 'x', properties: [] },
      ],
      relations: [],
    };
    const out = mapParseResult(res, new Set());
    expect(out.classes.find((c) => c.name === '하드웨어 부품')).toBeDefined();
    expect(out.instances.find((i) => i.name === 'Chuck')?.className).toBe('하드웨어 부품');
  });

  it('does not duplicate an instance that already exists in the graph', () => {
    const res: LlmParseResult = {
      entities: [
        { name: 'Chuck', type: 'HW', nodeKind: 'instance', parentType: 'HW', evidence: 'x', properties: [] },
      ],
      relations: [],
    };
    const out = mapParseResult(res, new Set(), new Set(['Chuck']));
    expect(out.instances.find((i) => i.name === 'Chuck')).toBeUndefined();
  });
});

describe('findPossibleDuplicates (A-2)', () => {
  it('flags a near / normalized-equal match to an existing class', () => {
    const dups = findPossibleDuplicates(['Dry Asher'], ['DryAsher', 'Chuck']);
    expect(dups.get('Dry Asher')).toBe('DryAsher');
  });

  it('ignores names that are clearly distinct', () => {
    const dups = findPossibleDuplicates(['RF Matcher'], ['Chuck', 'MW Power']);
    expect(dups.size).toBe(0);
  });

  it('picks the closest existing name when several are similar', () => {
    const dups = findPossibleDuplicates(['Asher'], ['Ashar', 'Crusher']);
    expect(dups.get('Asher')).toBe('Ashar');
  });
});

describe('partitionRelationsByLayer (PRD-L M2: semantic/kinetic 표시 분할)', () => {
  const rels = [
    { sourceName: 'A', targetName: 'B', relationName: '증가', layer: 'semantic' as const },
    { sourceName: 'C', targetName: 'D', relationName: '점검한다', layer: 'kinetic' as const },
    { sourceName: 'E', targetName: 'F', relationName: 'relates_to' }, // no layer → semantic
  ];

  it('splits into semantic and kinetic; missing layer counts as semantic', () => {
    const { semantic, kinetic } = partitionRelationsByLayer(rels);
    expect(kinetic.map((d) => d.rel.relationName)).toEqual(['점검한다']);
    expect(semantic.map((a) => a.rel.relationName)).toEqual(['증가', 'relates_to']);
  });

  it('preserves original indices for edit/remove operations', () => {
    const { semantic, kinetic } = partitionRelationsByLayer(rels);
    expect(kinetic[0].index).toBe(1);
    expect(semantic.map((a) => a.index)).toEqual([0, 2]);
  });
});

describe('computeIslands (A-5)', () => {
  it('flags nodes with no relation and no hierarchy place', () => {
    const res: LlmParseResult = {
      entities: [
        { name: 'Lonely', type: 'Misc', evidence: 'x' },
        { name: 'MW Power', type: 'Param', evidence: 'y' },
        { name: 'Particle', type: 'Result', evidence: 'z' },
      ],
      relations: [
        { source: 'MW Power', target: 'Particle', type: '증가', layer: 'semantic', evidence: 'e', confidence: 0.8 },
      ],
    };
    const parsed = mapParseResult(res, new Set());
    const islands = computeIslands(parsed);
    // MW Power & Particle are related; their types are parents. Misc parents Lonely,
    // so the only true island would be a node with no relation and no hierarchy.
    expect(islands).not.toContain('MW Power');
    expect(islands).not.toContain('Particle');
  });

  it('treats a node with neither relation nor hierarchy as an island', () => {
    const parsed = {
      classes: [{ name: 'Floating', description: '', color: null, parentName: null }],
      properties: [],
      relations: [],
      instances: [],
      warnings: [],
    };
    expect(computeIslands(parsed)).toEqual(['Floating']);
  });
});
