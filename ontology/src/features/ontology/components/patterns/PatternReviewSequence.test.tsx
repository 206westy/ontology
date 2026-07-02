import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PatternReviewSequence from './PatternReviewSequence';
import type { PatternReviewData } from './PatternReviewSequence';
import type { Pattern } from '../../lib/patterns/types';
import type { TermResolution } from '../../lib/terms/types';
import type { DriftJudgment } from '../../lib/patterns/drift';
import type { BridgeSuggestion } from '../../lib/bridge/cross-partition';
import type { HitlDedupItem } from '../../lib/patterns/hitl';
import type { GovernanceProposal } from '../../lib/schemas';
import type { EnrichmentItem } from '../../lib/enrich-types';
import type { CriticIssue } from '../../lib/critic/review';

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
    dedup: data.dedup ?? [],
    governance: data.governance ?? [],
    enrichment: data.enrichment ?? [],
    critic: data.critic ?? [],
    onConfirmTerm: vi.fn(),
    onManualTerm: vi.fn(),
    onExtend: vi.fn(),
    onFork: vi.fn(),
    onConnectBridge: vi.fn(),
    onConfirmDedup: vi.fn(),
    onIgnoreDedup: vi.fn(),
    onApproveGovernance: vi.fn(),
    onIgnoreGovernance: vi.fn(),
    onAdoptEnrichment: vi.fn(),
    onIgnoreEnrichment: vi.fn(),
    onSourceEnrichment: vi.fn(),
    onAckCritic: vi.fn(),
    onIgnoreCritic: vi.fn(),
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

// PRD-I (M3, Task 3.2): 팝오버의 다섯 결정을 별개 스텝으로 렌더한다.
const dedupItem: HitlDedupItem = {
  name: '펌프447',
  decision: 'reuse',
  targetName: '펌프 447',
  confidence: 0.95,
  evidence: '동일 설비 번호',
};

const governanceProposal: GovernanceProposal = {
  kind: 'constraint_cardinality',
  title: '증상은 최소 1개의 원인을 가진다',
  targetClass: '증상',
  relationType: 'caused_by',
  property: null,
  minCardinality: 1,
  maxCardinality: null,
  enumValues: null,
  disjointWith: null,
  axiomLogic: null,
  evidence: '문서 3.2절',
  confidence: 0.8,
};

const enrichmentItem: EnrichmentItem = {
  id: 'VV::no_definition',
  gap: { targetName: 'VV밸브', kind: 'no_definition', reason: '정의가 없습니다', severity: 'high' },
  proposals: [
    {
      kind: 'no_definition',
      value: '진공 밸브',
      sourceType: 'session_doc',
      evidence: '세션 문서',
      confidence: 0.9,
      needsReview: false,
    },
  ],
};

const criticIssue: CriticIssue = {
  kind: 'duplicate_existing',
  severity: 'high',
  targetName: '펌프447',
  relatedName: '펌프 447',
  reason: '기존 노드와 유사',
  suggestion: '재사용을 검토하세요',
  ruleId: 'dup-exist',
};

describe('PatternReviewSequence 새 스텝 (PRD-I M3)', () => {
  it('중복 대조 스텝을 렌더하고 확정 콜백을 넘긴다', async () => {
    const user = userEvent.setup();
    const props = setup({ dedup: [dedupItem] });
    expect(screen.getByText(/1\/1 단계/)).toBeInTheDocument();
    expect(screen.getByText('펌프447')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /이 판정으로/ }));
    expect(props.onConfirmDedup).toHaveBeenCalledWith(dedupItem);
    expect(await screen.findByText(/검수 완료/)).toBeInTheDocument();
  });

  it('거버넌스 스텝을 렌더하고 승인 콜백을 넘긴다', async () => {
    const user = userEvent.setup();
    const props = setup({ governance: [governanceProposal] });
    expect(screen.getByText(/거버넌스/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /승인/ }));
    expect(props.onApproveGovernance).toHaveBeenCalledWith(governanceProposal);
  });

  it('보강 스텝을 렌더하고 채택 콜백을 넘긴다', async () => {
    const user = userEvent.setup();
    const props = setup({ enrichment: [enrichmentItem] });
    expect(screen.getByText(/VV밸브/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /채택/ }));
    expect(props.onAdoptEnrichment).toHaveBeenCalledWith(enrichmentItem);
  });

  it('Critic 자문 스텝을 렌더하고 확인 콜백을 넘긴다(읽기전용 자문)', async () => {
    const user = userEvent.setup();
    const props = setup({ critic: [criticIssue] });
    expect(screen.getByText(/1\/1 단계/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /확인/ }));
    expect(props.onAckCritic).toHaveBeenCalledWith(criticIssue);
    expect(await screen.findByText(/검수 완료/)).toBeInTheDocument();
  });

  it('confirm gate: 렌더만으로는 새 스텝 콜백이 발화하지 않는다', () => {
    const props = setup({
      dedup: [dedupItem],
      governance: [governanceProposal],
      enrichment: [enrichmentItem],
      critic: [criticIssue],
    });
    expect(props.onConfirmDedup).not.toHaveBeenCalled();
    expect(props.onApproveGovernance).not.toHaveBeenCalled();
    expect(props.onAdoptEnrichment).not.toHaveBeenCalled();
    expect(props.onAckCritic).not.toHaveBeenCalled();
  });

  it('전체 순서: 용어 → 중복 → 거버넌스 → 보강 → 자문 → 브릿지 (7단계 중 6)', () => {
    setup({
      termResolutions: [termResolution],
      dedup: [dedupItem],
      governance: [governanceProposal],
      enrichment: [enrichmentItem],
      critic: [criticIssue],
      bridges: [bridge],
    });
    // 용어가 먼저(1/6), 총 6스텝(드리프트 없음). 진행률 라벨로 첫 스텝이 용어임을 확인.
    expect(screen.getByText(/1\/6 단계/)).toBeInTheDocument();
    expect(screen.getByText('· 용어 확인')).toBeInTheDocument();
  });
});
