import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PatternDiscoveryPanel from '../PatternDiscoveryPanel';
import type { DiscoverPatternResult } from '../../../api';
import type { PatternReviewData } from '../PatternReviewSequence';

// usePatterns 훅을 목킹해 네트워크 없이 게이트 동작만 검증한다(hermetic).
const hooks = vi.hoisted(() => ({
  discover: {
    mutate: vi.fn(),
    data: undefined as DiscoverPatternResult | undefined,
    isPending: false,
    isError: false,
  },
  promote: { mutate: vi.fn(), isPending: false },
}));

vi.mock('../../../hooks/usePatterns', () => ({
  useDiscoverPattern: () => hooks.discover,
  usePromotePattern: () => hooks.promote,
  usePatterns: () => ({ data: [], isLoading: false }),
}));

const cachedResult: DiscoverPatternResult = {
  cached: true,
  recognize: {
    domain: 'diagnostic',
    domainKo: '진단',
    confidence: 0.82,
    mixture: [{ domain: 'diagnostic', ratio: 1 }],
    recommendedPatternKey: 'diagnostic-fmea',
    competencyQuestionPreview: ['증상 X의 원인은?'],
  },
  pattern: {
    id: 'pat-1',
    key: 'diagnostic-fmea',
    name: 'FMEA',
    nameKo: '고장모드영향분석',
    version: 1,
    domain: 'diagnostic',
    roles: [
      { name: '증상', nodeKind: 'class', description: '관측된 이상' },
      { name: '원인', nodeKind: 'class', description: '근본 원인' },
    ],
    relationTypes: [
      { name: 'caused_by', layer: 'semantic', sourceRole: '증상', targetRole: '원인' },
    ],
    competencyQuestions: ['증상 X의 원인은?'],
    traversalTemplates: [],
    method: 'retrieved',
    sourceRepo: null,
    sourceUri: null,
    sourceLabel: null,
    license: 'CC0-1.0',
    occurrenceCount: 1,
    isDraft: false,
    previousVersionId: null,
    createdAt: '2026-01-01T00:00:00Z',
  },
};

describe('PatternDiscoveryPanel gate (H3/M2)', () => {
  beforeEach(() => {
    hooks.discover.mutate.mockClear();
    hooks.discover.data = undefined;
    hooks.discover.isPending = false;
    hooks.discover.isError = false;
    hooks.promote.mutate.mockClear();
  });

  it('does NOT trigger generation before confirm — analyzing only calls discover', async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();
    render(<PatternDiscoveryPanel onGenerate={onGenerate} />);

    await user.type(screen.getByRole('textbox'), 'particle이 증가하면 Chuck을 점검한다');
    await user.click(screen.getByRole('button', { name: /도메인 분석/ }));

    expect(hooks.discover.mutate).toHaveBeenCalledOnce();
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('does not render a confirm/generate control until a domain is recognized', () => {
    const onGenerate = vi.fn();
    render(<PatternDiscoveryPanel onGenerate={onGenerate} initialText="some text" />);
    expect(screen.queryByRole('button', { name: /이 패턴으로/ })).not.toBeInTheDocument();
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('triggers generation with the pattern context only after confirm', async () => {
    hooks.discover.data = cachedResult;
    const onGenerate = vi.fn();
    const user = userEvent.setup();
    render(<PatternDiscoveryPanel onGenerate={onGenerate} initialText="particle 초과" />);

    // 컨펌 전: 아직 호출 없음.
    expect(onGenerate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /이 패턴으로/ }));

    expect(onGenerate).toHaveBeenCalledOnce();
    const arg = onGenerate.mock.calls[0][0];
    expect(arg.patternContext.domain).toBe('diagnostic');
    expect(arg.patternContext.roles.map((r: { name: string }) => r.name)).toEqual([
      '증상',
      '원인',
    ]);
    expect(arg.patternContext.relationTypes[0].name).toBe('caused_by');
    expect(arg.pattern).toEqual({ id: 'pat-1', name: '고장모드영향분석', license: 'CC0-1.0' });
  });
});

describe('PatternDiscoveryPanel review mode (H8/M5)', () => {
  beforeEach(() => {
    hooks.discover.data = undefined;
  });

  const review: PatternReviewData = {
    termResolutions: [
      {
        term: 'VV',
        contextInjected: '반도체 유지보수 맥락 · 인접 노드 솔레노이드',
        candidates: [
          { term: 'VV', meaning: '밸브', confidence: 0.92, source: 'context', rationale: '인접' },
        ],
      },
    ],
    driftPattern: null,
    driftJudgments: [],
    bridges: [],
  };

  it('does NOT show the review sequence in the default (pre-generation) gate', () => {
    render(<PatternDiscoveryPanel onGenerate={vi.fn()} />);
    expect(screen.queryByTestId('review-progress')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /도메인 분석/ })).toBeInTheDocument();
  });

  it('renders the review sequence and forwards the term confirm when review data is provided', async () => {
    const onReviewConfirmTerm = vi.fn();
    const user = userEvent.setup();
    render(
      <PatternDiscoveryPanel
        onGenerate={vi.fn()}
        review={review}
        onReviewConfirmTerm={onReviewConfirmTerm}
      />,
    );

    // 검수 모드: 게이트(도메인 분석)는 사라지고 용어 스텝이 뜬다.
    expect(screen.queryByRole('button', { name: /도메인 분석/ })).not.toBeInTheDocument();
    expect(screen.getByText(/1\/1 단계/)).toBeInTheDocument();
    expect(screen.getByText(/솔레노이드/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /이 뜻으로/ }));
    expect(onReviewConfirmTerm).toHaveBeenCalledOnce();
    expect(onReviewConfirmTerm.mock.calls[0][0]).toBe('VV');
  });
});
