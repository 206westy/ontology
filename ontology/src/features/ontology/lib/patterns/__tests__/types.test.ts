import { describe, it, expect } from 'vitest';
import {
  patternBundleSchema,
  recognizeResultSchema,
  promotePatternRequestSchema,
} from '../types';

// T1: 패턴 LLM-facing 스키마의 유효/무효 파싱.
describe('patternBundleSchema', () => {
  const valid = {
    name: 'Diagnostic / FMEA',
    nameKo: '진단/FMEA',
    roles: [{ name: 'Symptom', nodeKind: 'class', description: '관측된 증상' }],
    relationTypes: [
      {
        name: 'caused_by',
        layer: 'semantic',
        sourceRole: 'Symptom',
        targetRole: 'Cause',
      },
    ],
    competencyQuestions: ['증상 X의 원인은?'],
    traversalTemplates: [{ cq: '증상 X의 원인은?', path: '(:Symptom)-[:caused_by]->(:Cause)' }],
  };

  it('accepts a well-formed bundle', () => {
    const parsed = patternBundleSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('rejects a role whose nodeKind is not class', () => {
    const parsed = patternBundleSchema.safeParse({
      ...valid,
      roles: [{ name: 'X', nodeKind: 'instance', description: '' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a relation with an unknown layer', () => {
    const parsed = patternBundleSchema.safeParse({
      ...valid,
      relationTypes: [
        { name: 'r', layer: 'bogus', sourceRole: 'A', targetRole: 'B' },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('recognizeResultSchema', () => {
  it('accepts a recognition with a null recommended key', () => {
    const parsed = recognizeResultSchema.safeParse({
      domain: 'diagnostic',
      domainKo: '진단',
      confidence: 0.82,
      mixture: [{ domain: 'diagnostic', ratio: 0.7 }],
      recommendedPatternKey: null,
      competencyQuestionPreview: ['증상 X의 원인은?'],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a confidence outside 0..1', () => {
    const parsed = recognizeResultSchema.safeParse({
      domain: 'd',
      domainKo: '',
      confidence: 1.5,
      mixture: [],
      recommendedPatternKey: null,
      competencyQuestionPreview: [],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('promotePatternRequestSchema', () => {
  it('defaults method to synthesized and allows null source/license', () => {
    const parsed = promotePatternRequestSchema.safeParse({
      key: 'diagnostic',
      domain: 'diagnostic',
      name: 'Diagnostic',
      nameKo: '진단',
      roles: [],
      relationTypes: [],
      competencyQuestions: [],
      traversalTemplates: [],
      license: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.method).toBe('synthesized');
  });
});
