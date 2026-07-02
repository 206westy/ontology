import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TermConfirmCard from './TermConfirmCard';
import type { TermResolution } from '../../lib/terms/types';

const resolution: TermResolution = {
  term: 'VV',
  contextInjected:
    '반도체 설비 유지보수 맥락의 VV(부품 후보) — 인접 노드: 솔레노이드·에어 실린더',
  candidates: [
    { term: 'VV', meaning: '밸브', confidence: 0.92, source: 'context', rationale: '인접 노드로 추정' },
    { term: 'VV', meaning: 'Vacuum Valve', confidence: 0.6, source: 'web', rationale: '웹 스니펫 · 검증 필요' },
  ],
};

function setup(overrides = {}) {
  const props = {
    resolution,
    onConfirm: vi.fn(),
    onManual: vi.fn(),
    onSkip: vi.fn(),
    ...overrides,
  };
  render(<TermConfirmCard {...props} />);
  return props;
}

describe('TermConfirmCard (H8-e)', () => {
  it('shows ranked candidates with confidence and the injected context transparently', () => {
    setup();
    expect(screen.getByText(/밸브/)).toBeInTheDocument();
    expect(screen.getByText(/92%/)).toBeInTheDocument();
    // 주입한 맥락을 투명하게 노출(무엇을 근거로 골랐는지).
    expect(screen.getByText(/솔레노이드/)).toBeInTheDocument();
    expect(screen.getByText(/반도체 설비 유지보수/)).toBeInTheDocument();
  });

  it('marks web candidates as 검증 필요', () => {
    setup();
    expect(screen.getByText('검증 필요')).toBeInTheDocument();
  });

  it('confirms the selected candidate with 이 뜻으로 and shows adoption guidance', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    await user.click(screen.getByRole('button', { name: /이 뜻으로/ }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onConfirm.mock.calls[0][0].meaning).toBe('밸브');
    // "이후 이 온톨로지에서 VV=밸브로 사용" 안내.
    expect(screen.getByText(/이후 이 온톨로지에서 VV=밸브로 사용/)).toBeInTheDocument();
  });

  it('lets the user pick a different candidate before confirming', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    await user.click(screen.getByRole('button', { name: /Vacuum Valve/ }));
    await user.click(screen.getByRole('button', { name: /이 뜻으로/ }));
    expect(onConfirm.mock.calls[0][0].meaning).toBe('Vacuum Valve');
  });

  it('supports 직접 입력 (manual meaning)', async () => {
    const user = userEvent.setup();
    const { onManual } = setup();
    await user.click(screen.getByRole('button', { name: /직접 입력/ }));
    await user.type(screen.getByLabelText('직접 뜻 입력'), '진공 밸브');
    await user.click(screen.getByRole('button', { name: /^확정$/ }));
    expect(onManual).toHaveBeenCalledWith('진공 밸브');
  });

  it('calls onSkip with 건너뛰기 and does NOT auto-confirm', async () => {
    const user = userEvent.setup();
    const { onSkip, onConfirm } = setup();
    await user.click(screen.getByRole('button', { name: /건너뛰기/ }));
    expect(onSkip).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('invokes onOther when 다른 뜻 is provided and clicked', async () => {
    const user = userEvent.setup();
    const onOther = vi.fn();
    setup({ onOther });
    await user.click(screen.getByRole('button', { name: /다른 뜻/ }));
    expect(onOther).toHaveBeenCalledOnce();
  });
});
