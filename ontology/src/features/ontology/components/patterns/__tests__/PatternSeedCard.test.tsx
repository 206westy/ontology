import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatternSeedCard } from '../PatternSeedCard';
import type { Pattern } from '../../../lib/patterns/types';

function makePattern(overrides: Partial<Pattern> = {}): Pattern {
  return {
    id: 'pat-1',
    key: 'equipment',
    name: 'Equipment Domain',
    nameKo: '장비 도메인',
    version: 1,
    domain: 'equipment',
    roles: [
      { name: 'Equipment', nodeKind: 'class', description: '장비' },
      { name: 'Site', nodeKind: 'class', description: '사이트' },
    ],
    relationTypes: [
      { name: 'located_at', layer: 'semantic', sourceRole: 'Equipment', targetRole: 'Site' },
    ],
    competencyQuestions: [],
    traversalTemplates: [],
    method: 'synthesized',
    sourceRepo: 'schemaorg/schemaorg',
    sourceUri: null,
    sourceLabel: 'schema.org',
    license: 'CC0-1.0',
    occurrenceCount: 7,
    isDraft: false,
    previousVersionId: null,
    createdAt: '2026-07-13T00:00:00.000Z',
    ...overrides,
  };
}

describe('PatternSeedCard', () => {
  it('신뢰 3신호(도메인·출처·사용빈도)를 표면화한다', () => {
    render(<PatternSeedCard pattern={makePattern()} onSeed={vi.fn()} />);

    expect(screen.getByText('equipment')).toBeInTheDocument(); // 도메인 eyebrow
    expect(screen.getByText(/출처 schema\.org/)).toBeInTheDocument();
    expect(screen.getByText(/사용 7회/)).toBeInTheDocument();
    expect(screen.getByText(/CC0-1\.0/)).toBeInTheDocument();
  });

  it('시드 프리뷰에 생성될 클래스/관계 수를 보여준다', () => {
    render(<PatternSeedCard pattern={makePattern()} onSeed={vi.fn()} />);
    expect(screen.getByText(/클래스 2개/)).toBeInTheDocument();
    expect(screen.getByText(/관계 1개/)).toBeInTheDocument();
  });

  it('라이선스 미확인 시 "검증 필요" + "라이선스 미확인"을 노출한다', () => {
    render(<PatternSeedCard pattern={makePattern({ license: null })} onSeed={vi.fn()} />);
    expect(screen.getByText('검증 필요')).toBeInTheDocument();
    expect(screen.getByText(/라이선스 미확인/)).toBeInTheDocument();
  });

  it('시딩 버튼 클릭 시 onSeed(pattern)을 호출한다(HITL 컨펌)', async () => {
    const user = userEvent.setup();
    const onSeed = vi.fn();
    const pattern = makePattern();
    render(<PatternSeedCard pattern={pattern} onSeed={onSeed} />);

    await user.click(screen.getByRole('button', { name: /새 구획으로 시딩/ }));

    expect(onSeed).toHaveBeenCalledTimes(1);
    expect(onSeed).toHaveBeenCalledWith(pattern);
  });

  it('생성할 클래스가 없는(빈) 패턴은 시딩 버튼이 비활성화된다', () => {
    render(
      <PatternSeedCard pattern={makePattern({ roles: [], relationTypes: [] })} onSeed={vi.fn()} />,
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('applied 상태면 "시딩됨"으로 표시하고 재클릭을 막는다', () => {
    render(<PatternSeedCard pattern={makePattern()} onSeed={vi.fn()} applied />);
    expect(screen.getByRole('button', { name: /시딩됨/ })).toBeDisabled();
  });
});
