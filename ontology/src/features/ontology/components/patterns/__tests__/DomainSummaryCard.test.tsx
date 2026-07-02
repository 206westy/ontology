import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DomainSummaryCard from '../DomainSummaryCard';
import type { RecognizeResult } from '../../../lib/patterns/types';

const single: RecognizeResult = {
  domain: 'diagnostic',
  domainKo: '진단',
  confidence: 0.82,
  mixture: [{ domain: 'diagnostic', ratio: 1 }],
  recommendedPatternKey: 'diagnostic-fmea',
  competencyQuestionPreview: ['증상 X의 원인은?'],
};

const mixed: RecognizeResult = {
  ...single,
  mixture: [
    { domain: 'diagnostic', ratio: 0.7 },
    { domain: 'administrative', ratio: 0.3 },
  ],
};

describe('DomainSummaryCard', () => {
  it('shows the domain, confidence and CQ preview in Korean', () => {
    render(<DomainSummaryCard recognize={single} onConfirm={() => {}} />);
    expect(screen.getByText(/진단/)).toBeInTheDocument();
    expect(screen.getByText(/신뢰 82%/)).toBeInTheDocument();
    expect(screen.getByText(/증상 X의 원인은\?/)).toBeInTheDocument();
  });

  it('calls onConfirm when "이 패턴으로" is clicked', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<DomainSummaryCard recognize={single} onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: /이 패턴으로/ }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('hides split/merge for a single domain', () => {
    render(
      <DomainSummaryCard recognize={single} onConfirm={() => {}} onSplit={() => {}} onMerge={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: /분할/ })).not.toBeInTheDocument();
  });

  it('shows split/merge for a mixed domain', () => {
    render(
      <DomainSummaryCard recognize={mixed} onConfirm={() => {}} onSplit={() => {}} onMerge={() => {}} />,
    );
    expect(screen.getByRole('button', { name: /분할/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /하나로/ })).toBeInTheDocument();
  });
});
