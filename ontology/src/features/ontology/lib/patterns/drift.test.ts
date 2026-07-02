import { describe, it, expect, vi } from 'vitest';
import {
  judgeDrift,
  judgeDriftBatch,
  MAP_ALIGN_THRESHOLD,
  type AlignFn,
  type DomainFitFn,
  type DriftElement,
  type DriftPatternContext,
} from './drift';

const diagnosticCtx: DriftPatternContext = {
  domain: 'diagnostic',
  roles: [
    { name: '증상', nodeKind: 'class', description: '' },
    { name: '원인', nodeKind: 'class', description: '' },
    { name: '점검', nodeKind: 'class', description: '' },
  ],
  relationTypes: [
    { name: 'caused_by', category: 'causal', sourceRole: '증상', targetRole: '원인' },
  ],
};

function deps(align: AlignFn, fit: DomainFitFn) {
  return { alignFn: align, domainFitFn: fit };
}

describe('judgeDrift (H5 3분기)', () => {
  it('returns map when the element aligns to an existing role above threshold', async () => {
    const alignFn: AlignFn = vi.fn(async () => ({
      kind: 'role' as const,
      name: '원인',
      score: 0.87,
    }));
    const domainFitFn: DomainFitFn = vi.fn(async () => ({
      inDomain: true,
      rationale: 'unused',
      confidence: 1,
    }));
    const el: DriftElement = { kind: 'concept', name: '유발 원인' };

    const j = await judgeDrift(el, diagnosticCtx, deps(alignFn, domainFitFn));

    expect(j.decision).toBe('map');
    expect(j.target).toEqual({ kind: 'role', name: '원인' });
    expect(j.confidence).toBe(0.87);
    // map 이면 도메인 적합 판정은 호출하지 않는다(정렬로 확정).
    expect(domainFitFn).not.toHaveBeenCalled();
  });

  it('does NOT map when align score is below threshold, falls through to fit', async () => {
    const weak = MAP_ALIGN_THRESHOLD - 0.01;
    const alignFn: AlignFn = async () => ({ kind: 'role', name: '원인', score: weak });
    const domainFitFn: DomainFitFn = async () => ({
      inDomain: true,
      rationale: '진단 도메인의 자연스러운 새 원인',
      confidence: 0.8,
    });
    const el: DriftElement = { kind: 'concept', name: '베어링 마모' };

    const j = await judgeDrift(el, diagnosticCtx, deps(alignFn, domainFitFn));

    expect(j.decision).toBe('extend');
  });

  it('통과조건: a natural new cause in a diagnostic pattern => extend (same partition)', async () => {
    const alignFn: AlignFn = async () => null; // 기존 역할에 정렬 안 됨
    const domainFitFn: DomainFitFn = async () => ({
      inDomain: true,
      rationale: '진단 도메인 내부의 새 원인(증상→원인 인과에 부합)',
      confidence: 0.82,
    });
    const el: DriftElement = { kind: 'concept', name: '윤활유 부족' };

    const j = await judgeDrift(el, diagnosticCtx, deps(alignFn, domainFitFn));

    expect(j.decision).toBe('extend');
    expect(j.target).toBeNull();
    expect(j.confidence).toBe(0.82);
  });

  it('통과조건: administrative approval flow in diagnostic context => fork (new partition)', async () => {
    const alignFn: AlignFn = async () => null;
    const domainFitFn: DomainFitFn = async () => ({
      inDomain: false,
      rationale: '행정 승인 절차 — 진단 도메인과 다른 업무 흐름',
      confidence: 0.9,
    });
    const el: DriftElement = { kind: 'concept', name: '결재 승인' };

    const j = await judgeDrift(el, diagnosticCtx, deps(alignFn, domainFitFn));

    expect(j.decision).toBe('fork');
    expect(j.target).toBeNull();
  });

  it('judges a batch preserving order', async () => {
    const alignFn: AlignFn = async (el) =>
      el.name === '원인 A' ? { kind: 'role', name: '원인', score: 0.9 } : null;
    const domainFitFn: DomainFitFn = async (el) => ({
      inDomain: el.name === '새 원인',
      rationale: 'r',
      confidence: 0.7,
    });
    const els: DriftElement[] = [
      { kind: 'concept', name: '원인 A' },
      { kind: 'concept', name: '새 원인' },
      { kind: 'concept', name: '행정 절차' },
    ];

    const out = await judgeDriftBatch(els, diagnosticCtx, deps(alignFn, domainFitFn));

    expect(out.map((j) => j.decision)).toEqual(['map', 'extend', 'fork']);
  });
});
