import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BridgeSuggestCard from './BridgeSuggestCard';
import type { BridgeSuggestion } from '../../lib/bridge/cross-partition';

const P1 = '00000000-0000-0000-0000-000000000001';
const P2 = '00000000-0000-0000-0000-000000000002';

const suggestion: BridgeSuggestion = {
  sourceId: 'a',
  targetId: 'b',
  sourceName: '펌프447',
  targetName: '펌프447',
  sourcePartition: P1,
  targetPartition: P2,
  kind: 'instance',
  score: 0.93,
  relationType: 'same_as',
  evidence: '동일 설비 번호 · 두 구획 등장',
};

function setup(overrides = {}) {
  const props = {
    suggestion,
    partitionNames: { [P1]: '메인트', [P2]: '행정' },
    onConnect: vi.fn(),
    onDistinct: vi.fn(),
    ...overrides,
  };
  render(<BridgeSuggestCard {...props} />);
  return props;
}

describe('BridgeSuggestCard (H8-f)', () => {
  it('names the entity and both partitions', () => {
    setup();
    expect(
      screen.getByText(/펌프447.*\[메인트\]·\[행정\] 양쪽에 등장/),
    ).toBeInTheDocument();
  });

  it('surfaces the bridge type and evidence', () => {
    setup();
    expect(screen.getByText(/타입: same_as/)).toBeInTheDocument();
    expect(screen.getByText(/동일 설비 번호/)).toBeInTheDocument();
  });

  it('confirm gate: nothing fires on render', () => {
    const { onConnect, onDistinct } = setup();
    expect(onConnect).not.toHaveBeenCalled();
    expect(onDistinct).not.toHaveBeenCalled();
  });

  it('connects with the suggestion when 연결 is clicked', async () => {
    const user = userEvent.setup();
    const { onConnect } = setup();
    await user.click(screen.getByRole('button', { name: /연결/ }));
    expect(onConnect).toHaveBeenCalledWith(suggestion);
  });

  it('marks the pair as distinct when 별개 is clicked', async () => {
    const user = userEvent.setup();
    const { onDistinct } = setup();
    await user.click(screen.getByRole('button', { name: /별개/ }));
    expect(onDistinct).toHaveBeenCalledOnce();
  });
});
