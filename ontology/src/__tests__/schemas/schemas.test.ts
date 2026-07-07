import { describe, it, expect } from 'vitest';
import {
  createClassSchema,
  updateClassSchema,
  createPropertySchema,
  createInstanceSchema,
  createEdgeSchema,
  createRelationTypeSchema,
  createConstraintSchema,
  createCommitSchema,
  parsedRelationSchema,
  parsedEntityPropertySchema,
} from '@/features/ontology/lib/schemas';

describe('createClassSchema', () => {
  it('should accept valid input with just name', () => {
    const result = createClassSchema.safeParse({ name: 'Person' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Person');
      expect(result.data.color).toBe('#7c3aed');
      expect(result.data.positionX).toBe(0);
    }
  });

  it('should reject empty name', () => {
    const result = createClassSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid color', () => {
    const result = createClassSchema.safeParse({ name: 'X', color: 'red' });
    expect(result.success).toBe(false);
  });

  it('should accept valid hex color', () => {
    const result = createClassSchema.safeParse({ name: 'X', color: '#ff00aa' });
    expect(result.success).toBe(true);
  });
});

describe('updateClassSchema', () => {
  it('should accept partial updates', () => {
    const result = updateClassSchema.safeParse({ description: 'Updated' });
    expect(result.success).toBe(true);
  });

  it('should reject empty name if provided', () => {
    const result = updateClassSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });
});

describe('createPropertySchema', () => {
  it('should accept valid property', () => {
    const result = createPropertySchema.safeParse({
      classId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'age',
    });
    expect(result.success).toBe(true);
  });

  it('should reject enum type without enumValues', () => {
    const result = createPropertySchema.safeParse({
      classId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'status',
      dataType: 'enum',
      enumValues: null,
    });
    expect(result.success).toBe(false);
  });

  it('should accept enum type with enumValues', () => {
    const result = createPropertySchema.safeParse({
      classId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'status',
      dataType: 'enum',
      enumValues: ['active', 'inactive'],
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid dataType', () => {
    const result = createPropertySchema.safeParse({
      classId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'x',
      dataType: 'bigint',
    });
    expect(result.success).toBe(false);
  });
});

describe('createInstanceSchema', () => {
  it('should accept valid instance', () => {
    const result = createInstanceSchema.safeParse({
      classId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'John',
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing classId', () => {
    const result = createInstanceSchema.safeParse({ name: 'John' });
    expect(result.success).toBe(false);
  });
});

describe('createEdgeSchema', () => {
  const validEdge = {
    relationTypeId: '550e8400-e29b-41d4-a716-446655440000',
    sourceId: '550e8400-e29b-41d4-a716-446655440001',
    targetId: '550e8400-e29b-41d4-a716-446655440002',
    sourceKind: 'class' as const,
    targetKind: 'class' as const,
  };

  it('should accept valid edge', () => {
    const result = createEdgeSchema.safeParse(validEdge);
    expect(result.success).toBe(true);
  });

  it('should reject self-loop (source === target)', () => {
    const result = createEdgeSchema.safeParse({
      ...validEdge,
      targetId: validEdge.sourceId,
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid kind', () => {
    const result = createEdgeSchema.safeParse({
      ...validEdge,
      sourceKind: 'other',
    });
    expect(result.success).toBe(false);
  });
});

describe('createRelationTypeSchema', () => {
  it('should accept valid relation type', () => {
    const result = createRelationTypeSchema.safeParse({ name: 'has_part' });
    expect(result.success).toBe(true);
  });

  it('should reject empty name', () => {
    const result = createRelationTypeSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });
});

describe('parsedRelationSchema (PRD-L M2: 2레이어 layer)', () => {
  const base = {
    source: 'MW Power',
    target: 'Particle',
    type: '증가시킨다',
    evidence: 'MW Power가 높으면 Particle 증가',
    confidence: 0.9,
  };

  it('requires a layer (strict 모드 — optional 불가)', () => {
    const result = parsedRelationSchema.safeParse(base);
    expect(result.success).toBe(false);
  });

  it('accepts a valid layer (semantic|kinetic)', () => {
    expect(parsedRelationSchema.safeParse({ ...base, layer: 'semantic' }).success).toBe(true);
    expect(parsedRelationSchema.safeParse({ ...base, layer: 'kinetic' }).success).toBe(true);
  });

  it('rejects an unknown layer', () => {
    const result = parsedRelationSchema.safeParse({ ...base, layer: 'causal' });
    expect(result.success).toBe(false);
  });
});

describe('parsedEntityPropertySchema (PR1: 동작 모드 enum 속성)', () => {
  it('carries enumValues for a mode-style property', () => {
    const result = parsedEntityPropertySchema.safeParse({
      name: 'mode',
      value: 'RAG',
      dataType: 'enum',
      enumValues: ['RAG', 'Agent'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts null enumValues for non-enum properties (strict required+nullable)', () => {
    const result = parsedEntityPropertySchema.safeParse({
      name: 'partNumber',
      value: 'KC0330655',
      dataType: 'string',
      enumValues: null,
    });
    expect(result.success).toBe(true);
  });
});

// PRD-L M1: 단일 "규칙" 모델 — kind ↔ constraintType 정합(refine) 검증.
describe('createConstraintSchema (PRD-L M1 kind refine)', () => {
  it('should default kind to enforced and require constraintType', () => {
    const result = createConstraintSchema.safeParse({
      constraintType: 'cardinality',
      description: '최소 1개 관계',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe('enforced');
      expect(result.data.constraintType).toBe('cardinality');
    }
  });

  it("should reject kind='enforced' without constraintType", () => {
    const result = createConstraintSchema.safeParse({
      kind: 'enforced',
      description: '타입 없는 강제 규칙',
    });
    expect(result.success).toBe(false);
  });

  it("should accept kind='memo' with description only (constraintType null)", () => {
    const result = createConstraintSchema.safeParse({
      kind: 'memo',
      constraintType: null,
      description: '참고용 설명 메모',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe('memo');
      expect(result.data.constraintType).toBeNull();
    }
  });

  it("should reject kind='memo' with a constraintType", () => {
    const result = createConstraintSchema.safeParse({
      kind: 'memo',
      constraintType: 'cardinality',
      description: '메모인데 타입이 있음',
    });
    expect(result.success).toBe(false);
  });
});

describe('createCommitSchema', () => {
  it('should accept valid commit', () => {
    const result = createCommitSchema.safeParse({
      message: 'Initial commit',
      details: [
        {
          operation: 'ADD',
          targetTable: 'classes',
          targetId: '550e8400-e29b-41d4-a716-446655440000',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid operation', () => {
    const result = createCommitSchema.safeParse({
      details: [
        {
          operation: 'PATCH',
          targetTable: 'classes',
          targetId: '550e8400-e29b-41d4-a716-446655440000',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  // PRD-J M1: 브랜치 커밋
  it('should accept branchId (branch commit)', () => {
    const result = createCommitSchema.safeParse({
      message: 'branch work',
      branchId: '550e8400-e29b-41d4-a716-446655440001',
      details: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.branchId).toBe('550e8400-e29b-41d4-a716-446655440001');
    }
  });

  it('should default branchId to undefined (main commit) when omitted', () => {
    const result = createCommitSchema.safeParse({ message: 'main', details: [] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.branchId ?? null).toBeNull();
    }
  });

  it('should reject non-uuid branchId', () => {
    const result = createCommitSchema.safeParse({
      branchId: 'not-a-uuid',
      details: [],
    });
    expect(result.success).toBe(false);
  });
});
