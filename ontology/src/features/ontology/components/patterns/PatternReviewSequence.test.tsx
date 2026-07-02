import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PatternReviewSequence from './PatternReviewSequence';
import type { PatternReviewData } from './PatternReviewSequence';
import type { Pattern } from '../../lib/patterns/types';
import type { TermResolution } from '../../lib/terms/types';
import type { DriftJudgment } from '../../lib/patterns/drift';
import type { BridgeSuggestion } from '../../lib/bridge/cross-partition';

const pattern: Pattern = {
  id: 'pat-1',
  key: 'diagnostic',
  name: 'Diagnostic',
  nameKo: '진단',
  version: 1,
  domain: 'diagnostic',
  roles: [{ name: '증상', nodeKind: 'class', description: '' }],
  relationTypes: [],
  competencyQuestions: [],
  traversalTemplates: [],
  method: 'synthesized',
  sourceRepo: null,
  sourceUri: null,
  sourceLabel: null,
  license: null,
  isDraft: false,
  previousVersionId: null,
  createdAt: '2026-07-02T00:00:00.000Z',
};

const termResolution: TermResolution = {
  term: 'VV',
  contextInjected: '반도체 설비 유지보수 맥락 · 인접 노드 솔레노이드',
  candidates: [
    { term: 'VV', meaning: '밸브', confidence: 0.92, source: 'context', rationale: '인접 노드' },
  ],
};

const driftJudgments: DriftJudgment[] = [
  {
    element: { kind: 'concept', name: '윤활유 부족' },
    decision: 'extend',
    target: null,
    rationale: '진단 도메인 내부의 새 원인',
    confidence: 0.82,
  },
];

const P1 = '00000000-0000-0000-0000-000000000001';
const P2 = '00000000-0000-0000-0000-000000000002';
const bridge: BridgeSuggestion = {
  sourceId: 'a',
  targetId: 'b',
  sourceName: '펌프447',
  targetName: '펌프447',
  sourcePartition: P1,
  targetPartition: P2,
  kind: 'instance',
  score: 0.93,
  relationType: 'same_as',
  evidence: '동일 설비 번호',
};

function setup(data: Partial<PatternReviewData> = {}, extra = {}) {
  const props = {
    termResolutions: data.termResolutions ?? [],
    driftPattern: data.driftPattern ?? null,
    driftJudgments: data.driftJudgments ?? [],
    bridges: data.bridges ?? [],
    partitionNames: data.partitionNames ?? { [P1]: '메인트', [P2]: '행정' },
    onConfirmTerm: vi.fn(),
    onManualTerm: vi.fn(),
    onExtend: vi.fn(),
    onFork: vi.fn(),
    onConnectBridge: vi.fn(),
    onComplete: vi.fn(),
    ...extra,
  };
  render(<PatternReviewSequence {...props} />);
  return props;
}

describe('PatternReviewSequence (H8/M5)', () => {
  it('renders the term step first when terms exist, with step progress', () => {
    setup({
      termResolutions: [termResolution],
      driftPattern: pattern,
      driftJudgments,
      bridges: [bridge],
    });
    expect(screen.getByText(/1\/3 단계/)).toBeInTheDocument();
    // 용어 카드 고유 텍스트(주입 맥락)로 첫 스텝이 용어임을 확인.
    expect(screen.getByText(/솔레노이드/)).toBeInTheDocument();
    // 아직 드리프트/브릿지 카드는 없음.
    expect(screen.queryByText(/현재 패턴 밖/)).not.toBeInTheDocument();
    expect(screen.queryByText(/브릿지 후보/)).not.toBeInTheDocument();
  });

  it('confirm gate: no callback fires on mere render', () => {
    const props = setup({ termResolutions: [termResolution], bridges: [bridge] });
    expect(props.onConfirmTerm).not.toHaveBeenCalled();
    expect(props.onConnectBridge).not.toHaveBeenCalled();
    expect(props.onExtend).not.toHaveBeenCalled();
  });

  it('advances through term → drift → bridge, invoking the matching confirm callback per step', async () => {
    const user = userEvent.setup();
    const props = setup({
      termResolutions: [termResolution],
      driftPattern: pattern,
      driftJudgments,
      bridges: [bridge],
    });

    // Step 1: 용어 확정.
    await user.click(screen.getByRole('button', { name: /이 뜻으로/ }));
    expect(props.onConfirmTerm).toHaveBeenCalledOnce();
    expect(props.onConfirmTerm.mock.calls[0][0]).toBe('VV');
    expect(props.onConfirmTerm.mock.calls[0][1].meaning).toBe('밸브');

    // Step 2: 드리프트 확장.
    expect(await screen.findByText(/현재 패턴 밖/)).toBeInTheDocument();
    expect(screen.getByText(/2\/3 단계/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /패턴 확장/ }));
    expect(props.onExtend).toHaveBeenCalledOnce();

    // Step 3: 브릿지 연결.
    expect(await screen.findByText(/브릿지 후보/)).toBeInTheDocument();
    expect(screen.getByText(/3\/3 단계/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /연결/ }));
    expect(props.onConnectBridge).toHaveBeenCalledWith(bridge);

    // 완료 요약 + onComplete 1회.
    expect(await screen.findByText(/검수 완료/)).toBeInTheDocument();
    expect(props.onComplete).toHaveBeenCalledOnce();
  });

  it('skips empty steps (only bridges → bridge shows first as 1/1)', () => {
    setup({ bridges: [bridge] });
    expect(screen.getByText(/1\/1 단계/)).toBeInTheDocument();
    expect(screen.getByText(/브릿지 후보/)).toBeInTheDocument();
    expect(screen.queryByText(/솔레노이드/)).not.toBeInTheDocument();
  });

  it('iterates multiple terms before advancing, then shows summary', async () => {
    const user = userEvent.setup();
    const second: TermResolution = {
      term: 'RF',
      contextInjected: '고주파 바이어스 맥락',
      candidates: [
        { term: 'RF', meaning: 'Radio Frequency', confidence: 0.8, source: 'context', rationale: '' },
      ],
    };
    const props = setup({ termResolutions: [termResolution, second] });

    await user.click(screen.getByRole('button', { name: /건너뛰기/ }));
    // 두 번째 용어로 진행(같은 스텝 내 이동).
    expect(await screen.findByText(/고주파 바이어스/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /이 뜻으로/ }));
    expect(props.onConfirmTerm.mock.calls[0][0]).toBe('RF');
    expect(await screen.findByText(/검수 완료/)).toBeInTheDocument();
  });

  it('renders the summary immediately when there is nothing to review', () => {
    const props = setup();
    expect(screen.getByText(/검수 완료/)).toBeInTheDocument();
    expect(props.onComplete).toHaveBeenCalledOnce();
  });
});
