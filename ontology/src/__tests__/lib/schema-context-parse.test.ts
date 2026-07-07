import { describe, it, expect } from 'vitest';
import { buildParseSchemaContext } from '@/features/ontology/lib/schema-context';

const baseStore = {
  classes: [
    { id: 'c1', parentId: null, partitionId: '00000000-0000-0000-0000-000000000001', name: '하드웨어', description: '장비 부품', color: '#7c3aed', positionX: 0, positionY: 0, createdAt: '', updatedAt: '' },
    { id: 'c2', parentId: 'c1', partitionId: '00000000-0000-0000-0000-000000000001', name: 'Chuck', description: '', color: '#2563eb', positionX: 0, positionY: 0, createdAt: '', updatedAt: '' },
  ],
  instances: [],
  properties: [],
  relationTypes: [
    { id: 'r1', name: '관련_하드웨어', description: '', layer: 'semantic' as const, sourceClassId: '', targetClassId: '', createdAt: '' },
  ],
  edges: [],
};

describe('buildParseSchemaContext (A-2)', () => {
  it('includes the class hierarchy with nesting and existing relation types', () => {
    const ctx = buildParseSchemaContext(baseStore);
    expect(ctx).toContain('하드웨어');
    expect(ctx).toContain('Chuck');
    expect(ctx).toContain('관련_하드웨어');
    expect(ctx.toLowerCase()).toContain('class hierarchy');
  });
});
