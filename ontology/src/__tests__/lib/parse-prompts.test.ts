import { describe, it, expect } from 'vitest';
import {
  buildStage1System,
  buildStage1User,
  buildStage2System,
  buildStage2User,
} from '@/features/ontology/lib/parse-prompts';

describe('parse-prompts (A-1)', () => {
  it('stage 1 system forbids the title hub and merging look-alike concepts', () => {
    const sys = buildStage1System();
    expect(sys).toMatch(/title.*hub|hub/i);
    expect(sys.toLowerCase()).toContain('do not use the document');
    expect(sys).toContain('Chuck');
  });

  it('stage 1 system has class/instance classification rules and property value guidance (A-1.1)', () => {
    const sys = buildStage1System();
    expect(sys).toContain('nodeKind');
    expect(sys).toContain('parentType');
    expect(sys.toLowerCase()).toContain('instance');
    expect(sys).toContain('KC0330655'); // value belongs to the instance, not the class
  });

  it('stage 1 user embeds the text and existing schema context', () => {
    const user = buildStage1User({
      text: 'plasma strip report',
      existingSchema: '- 하드웨어\n  - Chuck',
    });
    expect(user).toContain('plasma strip report');
    expect(user).toContain('Chuck');
  });

  it('stage 2 system requires grounding and allows islands', () => {
    const sys = buildStage2System();
    expect(sys.toLowerCase()).toContain('co-occurrence is not grounding');
    expect(sys.toLowerCase()).toContain('island');
    expect(sys.toLowerCase()).toContain('confidence');
  });

  it('stage 2 user lists the extracted entities and the original text', () => {
    const user = buildStage2User({ text: 'orig text' }, [
      { name: 'MW Power', type: '파라미터', evidence: 'x' },
      { name: 'Particle', type: '결과', evidence: 'y' },
    ]);
    expect(user).toContain('MW Power (파라미터)');
    expect(user).toContain('Particle (결과)');
    expect(user).toContain('orig text');
  });
});
