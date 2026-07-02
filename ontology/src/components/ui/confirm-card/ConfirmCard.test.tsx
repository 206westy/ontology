import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/button';
import { ConfirmCard } from './ConfirmCard';

describe('ConfirmCard (PRD-I §3 공통 컨펌 문법)', () => {
  it('renders the four anatomy slots in fixed order: 판정 → 근거 → 미리보기 → 액션', () => {
    const { container } = render(
      <ConfirmCard
        eyebrow="드리프트"
        verdict="extend"
        title="새 개념 2개가 패턴 밖"
        evidence="원문: 윤활유 부족으로 정지"
        preview={<span>v1 → v2 미리보기</span>}
        actions={<Button>패턴 확장</Button>}
      />,
    );
    const text = container.textContent ?? '';
    const idxEvidence = text.indexOf('원문');
    const idxPreview = text.indexOf('미리보기');
    const idxAction = text.indexOf('패턴 확장');
    expect(idxEvidence).toBeGreaterThan(-1);
    expect(idxPreview).toBeGreaterThan(idxEvidence);
    expect(idxAction).toBeGreaterThan(idxPreview);
  });

  it('always exposes evidence for transparency', () => {
    render(
      <ConfirmCard title="t" evidence="근거 스팬" actions={<Button>ok</Button>} />,
    );
    expect(screen.getByText('근거 스팬')).toBeInTheDocument();
  });

  it('shows the 검증 필요 flag when attention is set', () => {
    render(<ConfirmCard title="t" attention actions={<Button>ok</Button>} />);
    expect(screen.getByText('검증 필요')).toBeInTheDocument();
  });

  it('does not show 검증 필요 by default', () => {
    render(<ConfirmCard title="t" actions={<Button>ok</Button>} />);
    expect(screen.queryByText('검증 필요')).not.toBeInTheDocument();
  });

  it('confirm gate: no action fires on render', () => {
    const onAct = vi.fn();
    render(
      <ConfirmCard title="t" actions={<Button onClick={onAct}>승인</Button>} />,
    );
    expect(onAct).not.toHaveBeenCalled();
  });

  it('fires the action callback only when the user clicks', async () => {
    const user = userEvent.setup();
    const onAct = vi.fn();
    render(
      <ConfirmCard title="t" actions={<Button onClick={onAct}>승인</Button>} />,
    );
    await user.click(screen.getByRole('button', { name: '승인' }));
    expect(onAct).toHaveBeenCalledOnce();
  });

  it('applies the applied styling when applied is true', () => {
    const { container } = render(
      <ConfirmCard title="t" applied actions={<span />} />,
    );
    expect(container.querySelector('.border-primary')).toBeInTheDocument();
  });
});
