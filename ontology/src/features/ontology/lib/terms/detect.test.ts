import { describe, it, expect } from 'vitest';
import {
  detectTermsNeedingResolution,
  isAbbreviationLike,
  type DetectableEntity,
} from './detect';

describe('isAbbreviationLike', () => {
  it('flags short all-caps tokens (VV, EMO, RF)', () => {
    expect(isAbbreviationLike('VV')).toBe(true);
    expect(isAbbreviationLike('EMO')).toBe(true);
    expect(isAbbreviationLike('RF')).toBe(true);
  });

  it('does not flag ordinary words or defined names', () => {
    expect(isAbbreviationLike('밸브')).toBe(false);
    expect(isAbbreviationLike('Valve')).toBe(false);
    expect(isAbbreviationLike('Solenoid')).toBe(false);
  });
});

describe('detectTermsNeedingResolution', () => {
  it('collects undefined abbreviations', () => {
    const entities: DetectableEntity[] = [
      { name: 'VV', description: null },
      { name: '솔레노이드', description: '전기로 여닫는 밸브' },
    ];
    expect(detectTermsNeedingResolution(entities)).toEqual(['VV']);
  });

  it('does NOT flag an abbreviation that already has a definition', () => {
    const entities: DetectableEntity[] = [
      { name: 'VV', description: '진공 밸브(vacuum valve)' },
    ];
    expect(detectTermsNeedingResolution(entities)).toEqual([]);
  });

  it('flags low-confidence type judgements', () => {
    const entities: DetectableEntity[] = [
      { name: 'Regulator', type: 'unknown', typeConfidence: 0.3 },
    ];
    expect(detectTermsNeedingResolution(entities)).toEqual(['Regulator']);
  });

  it('batches: dedupes case-insensitively (no per-item spam)', () => {
    const entities: DetectableEntity[] = [
      { name: 'VV' },
      { name: 'vv' },
      { name: 'VV ' },
    ];
    expect(detectTermsNeedingResolution(entities)).toEqual(['VV']);
  });

  it('returns empty when nothing is ambiguous', () => {
    const entities: DetectableEntity[] = [
      { name: '밸브', description: '유체를 여닫는 부품', typeConfidence: 0.95 },
    ];
    expect(detectTermsNeedingResolution(entities)).toEqual([]);
  });
});
