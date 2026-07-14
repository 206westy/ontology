import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DriftDecisionCard from './DriftDecisionCard';
import type { Pattern } from '../../lib/patterns/types';
import type { DriftJudgment } from '../../lib/patterns/drift';

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
  occurrenceCount: 1,
  isDraft: false,
  previousVersionId: null,
  createdAt: '2026-07-02T00:00:00.000Z',
};

const judgments: DriftJudgment[] = [
  {
    element: { kind: 'concept', name: '윤활유 부족' },
    decision: 'extend',
    target: null,
    rationale: '진단 도메인 내부의 새 원인',
    confidence: 0.82,
  },
  {
    element: { kind: 'concept', name: '결재 승인' },
    decision: 'fork',
    target: null,
    rationale: '행정 승인 절차 — 다른 도메인',
    confidence: 0.9,
  },
  {
    element: { kind: 'concept', name: '증상' },
    decision: 'map',
    target: { kind: 'role', name: '증상' },
    rationale: '정렬됨',
    confidence: 0.95,
  },
];

function setup(overrides = {}) {
  const props = {
    pattern,
    judgments,
    onExtend: vi.fn(),
    onFork: vi.fn(),
    onIgnore: vi.fn(),
    ...overrides,
  };
  render(<DriftDecisionCard {...props} />);
  return props;
}

describe('DriftDecisionCard (H8-d)', () => {
  it('counts only out-of-pattern elements (map excluded)', () => {
    setup();
    expect(screen.getByText(/새 개념 2개가 현재 패턴 밖/)).toBeInTheDocument();
  });

  it('shows the extend version-up preview (v1 → v2)', () => {
    setup();
    expect(screen.getByText(/v1 → v2/)).toBeInTheDocument();
    expect(screen.getByText(/윤활유 부족/)).toBeInTheDocument();
  });

  it('shows a new-partition preview for fork elements', () => {
    setup();
    expect(screen.getByText(/새 구획으로 분리 미리보기/)).toBeInTheDocument();
    expect(screen.getByText(/결재 승인/)).toBeInTheDocument();
  });

  it('confirm gate: nothing fires on render', () => {
    const { onExtend, onFork, onIgnore } = setup();
    expect(onExtend).not.toHaveBeenCalled();
    expect(onFork).not.toHaveBeenCalled();
    expect(onIgnore).not.toHaveBeenCalled();
  });

  it('extends with a version-up draft when 패턴 확장 is clicked', async () => {
    const user = userEvent.setup();
    const { onExtend } = setup();
    await user.click(screen.getByRole('button', { name: /패턴 확장/ }));
    expect(onExtend).toHaveBeenCalledOnce();
    const draft = onExtend.mock.calls[0][0];
    expect(draft.version).toBe(2);
    expect(draft.previousVersionId).toBe('pat-1');
    expect(draft.roles.map((r: { name: string }) => r.name)).toContain('윤활유 부족');
  });

  it('calls onFork (discovery re-call) with fork elements when 새 구획으로 분리 is clicked', async () => {
    const user = userEvent.setup();
    const { onFork } = setup();
    await user.click(screen.getByRole('button', { name: /새 구획으로 분리/ }));
    expect(onFork).toHaveBeenCalledOnce();
    expect(onFork.mock.calls[0][0][0].name).toBe('결재 승인');
  });

  it('calls onIgnore when 무시 is clicked', async () => {
    const user = userEvent.setup();
    const { onIgnore } = setup();
    await user.click(screen.getByRole('button', { name: /무시/ }));
    expect(onIgnore).toHaveBeenCalledOnce();
  });
});
