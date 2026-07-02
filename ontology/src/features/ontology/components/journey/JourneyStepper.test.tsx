import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import JourneyStepper, { type JourneyStep } from './JourneyStepper';

const STEPS: JourneyStep[] = [
  { id: 'domain', label: '도메인 인지' },
  { id: 'pattern', label: '패턴 선택' },
  { id: 'generate', label: '생성' },
  { id: 'review', label: '검수' },
];

describe('JourneyStepper', () => {
  it('marks completed, current, and upcoming steps by data-state', () => {
    render(
      <JourneyStepper
        steps={STEPS}
        currentStepId="generate"
        completedIds={['domain', 'pattern']}
      />,
    );

    expect(screen.getByTestId('step-domain')).toHaveAttribute('data-state', 'completed');
    expect(screen.getByTestId('step-pattern')).toHaveAttribute('data-state', 'completed');
    expect(screen.getByTestId('step-generate')).toHaveAttribute('data-state', 'current');
    expect(screen.getByTestId('step-review')).toHaveAttribute('data-state', 'upcoming');
  });

  it('renders every step label and a progress badge', () => {
    render(
      <JourneyStepper steps={STEPS} currentStepId="generate" completedIds={['domain', 'pattern']} />,
    );

    for (const step of STEPS) {
      expect(screen.getByText(step.label)).toBeInTheDocument();
    }
    // current step is the 3rd of 4.
    expect(screen.getByText('3/4')).toBeInTheDocument();
  });
});
