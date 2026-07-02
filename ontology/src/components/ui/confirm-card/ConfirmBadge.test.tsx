import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfirmBadge } from './ConfirmBadge';

describe('ConfirmBadge (PRD-I §3 배지 taxonomy)', () => {
  it('renders the Korean label for each verdict kind', () => {
    render(<ConfirmBadge verdict="possible_duplicate" />);
    expect(screen.getByText('중복 가능')).toBeInTheDocument();
  });

  it('applies the semantic tone class for the verdict (no hardcoded palette)', () => {
    const { container } = render(<ConfirmBadge verdict="block" />);
    // block → destructive tone
    expect(container.querySelector('.text-destructive')).toBeInTheDocument();
  });

  it('shows a qualitative confidence band, not a raw percentage', () => {
    render(<ConfirmBadge verdict="reuse" confidence={0.92} />);
    expect(screen.getByText(/높음/)).toBeInTheDocument();
    expect(screen.queryByText(/92/)).not.toBeInTheDocument();
  });

  it('maps mid confidence to 보통 and low to 낮음', () => {
    const { rerender } = render(<ConfirmBadge verdict="relate" confidence={0.7} />);
    expect(screen.getByText(/보통/)).toBeInTheDocument();
    rerender(<ConfirmBadge verdict="relate" confidence={0.4} />);
    expect(screen.getByText(/낮음/)).toBeInTheDocument();
  });

  it('omits the confidence band when confidence is not provided', () => {
    render(<ConfirmBadge verdict="new" />);
    expect(screen.queryByText(/높음|보통|낮음/)).not.toBeInTheDocument();
  });
});
