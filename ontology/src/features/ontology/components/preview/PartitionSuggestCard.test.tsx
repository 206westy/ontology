import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PartitionSuggestCard from './PartitionSuggestCard';
import type { BridgeSuggestion } from '../../lib/bridge/cross-partition';

const bridge: BridgeSuggestion = {
  sourceId: 'pending:펌프447',
  targetId: 'i-pump',
  sourceName: '펌프447',
  targetName: '펌프447',
  sourcePartition: '__new__',
  targetPartition: '00000000-0000-0000-0000-000000000001',
  kind: 'instance',
  score: 0.95,
  relationType: 'same_as',
  evidence: '동일 설비 번호',
};

function setup(overrides = {}) {
  const props = {
    decision: 'new' as const,
    suggestedPartitionName: '행정',
    rationale: '결재·품의 등 행정 도메인',
    bridges: [],
    onSeparate: vi.fn(),
    onKeepCurrent: vi.fn(),
    onConnectBridge: vi.fn(),
    onDistinctBridge: vi.fn(),
    ...overrides,
  };
  const utils = render(<PartitionSuggestCard {...props} />);
  return { ...utils, props };
}

describe('PartitionSuggestCard (PRD-N M1)', () => {
  it('attach 는 아무것도 렌더하지 않는다(무소음)', () => {
    setup({ decision: 'attach' });
    expect(screen.queryByTestId('partition-suggest')).toBeNull();
  });

  it('new: 새 구획 이름과 근거를 노출한다', () => {
    setup();
    const titleEl = screen.getByText(/다른 도메인으로 보입니다/);
    expect(titleEl).toBeInTheDocument();
    expect(titleEl.textContent).toContain('행정');
    expect(screen.getByText(/행정 도메인/)).toBeInTheDocument();
  });

  it('확정 게이트: 렌더만으로는 아무 콜백도 안 부른다', () => {
    const { props } = setup();
    expect(props.onSeparate).not.toHaveBeenCalled();
    expect(props.onKeepCurrent).not.toHaveBeenCalled();
  });

  it('"새 구획으로 분리" 클릭 → onSeparate', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByRole('button', { name: /새 구획으로 분리/ }));
    expect(props.onSeparate).toHaveBeenCalledOnce();
  });

  it('"현재 구획 유지" 클릭 → onKeepCurrent (HITL, 자동 확정 없음)', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByRole('button', { name: /현재 구획 유지/ }));
    expect(props.onKeepCurrent).toHaveBeenCalledOnce();
  });

  it('bridge: 교차 개념 bridge 카드를 렌더하고 연결 시 콜백한다', async () => {
    const user = userEvent.setup();
    const { props } = setup({ decision: 'bridge', bridges: [bridge] });
    // 새 구획 분리 문구 + bridge 카드 공존.
    expect(screen.getByText(/bridge로 이을까요/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /연결/ }));
    expect(props.onConnectBridge).toHaveBeenCalledWith(bridge);
  });
});
