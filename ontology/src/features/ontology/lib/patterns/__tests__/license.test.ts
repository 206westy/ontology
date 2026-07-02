import { describe, it, expect } from 'vitest';
import {
  hasUnverifiedLicense,
  unverifiedLicensePatterns,
  buildPublishLicenseWarning,
} from '../license';

describe('hasUnverifiedLicense', () => {
  it('flags null license', () => {
    expect(hasUnverifiedLicense({ license: null })).toBe(true);
  });

  it('flags "unknown" (case-insensitive)', () => {
    expect(hasUnverifiedLicense({ license: 'Unknown' })).toBe(true);
    expect(hasUnverifiedLicense({ license: '  unknown ' })).toBe(true);
  });

  it('accepts a real license', () => {
    expect(hasUnverifiedLicense({ license: 'CC0-1.0' })).toBe(false);
  });
});

describe('unverifiedLicensePatterns', () => {
  it('returns only the unverified ones', () => {
    const rows = [
      { license: 'CC-BY-4.0' },
      { license: null },
      { license: 'unknown' },
    ];
    expect(unverifiedLicensePatterns(rows)).toHaveLength(2);
  });
});

describe('buildPublishLicenseWarning (T7/M2 publish gate)', () => {
  it('returns null when no patterns are involved', () => {
    expect(buildPublishLicenseWarning([])).toBeNull();
    expect(buildPublishLicenseWarning([null, undefined])).toBeNull();
  });

  it('returns null when every involved pattern has a verified license', () => {
    expect(
      buildPublishLicenseWarning([{ name: 'FMEA', license: 'CC0-1.0' }]),
    ).toBeNull();
  });

  it('returns a Korean warning naming the unverified pattern(s)', () => {
    const warning = buildPublishLicenseWarning([
      { name: 'FMEA', license: 'CC0-1.0' },
      { name: '진단 트리', license: null },
    ]);
    expect(warning).toContain('라이선스');
    expect(warning).toContain('진단 트리');
    expect(warning).not.toContain('FMEA'); // 확인된 패턴은 문구에 안 들어감
  });

  it('warns even without a name (license unknown)', () => {
    const warning = buildPublishLicenseWarning([{ license: 'unknown' }]);
    expect(warning).toContain('라이선스가 확인되지 않았습니다');
  });
});

// M5: 발행 게이트 종단 — NeoConfirmSheet 가 store.activePattern 을 그대로
// `buildPublishLicenseWarning([activePattern])` 로 넘긴다. 그 선택 로직을 store
// activePattern 모양({id,name,license})으로 검증한다(시트 렌더 없이 판정만).
describe('publish gate wiring (activePattern → NeoConfirmSheet)', () => {
  type ActivePattern = { id: string | null; name: string; license: string | null };

  const warnFor = (p: ActivePattern | null) => buildPublishLicenseWarning([p]);

  it('미확인 라이선스 활성 패턴은 발행 경고를 낸다', () => {
    const activePattern: ActivePattern = { id: 'p1', name: '진단/FMEA', license: null };
    const warning = warnFor(activePattern);
    expect(warning).toContain('라이선스');
    expect(warning).toContain('진단/FMEA');
  });

  it('확인된 라이선스면 경고가 없다', () => {
    const activePattern: ActivePattern = { id: 'p1', name: '진단/FMEA', license: 'CC0-1.0' };
    expect(warnFor(activePattern)).toBeNull();
  });

  it('활성 패턴이 없으면(비패턴 생성) 경고가 없다', () => {
    expect(warnFor(null)).toBeNull();
  });
});
