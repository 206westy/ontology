import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatternGalleryCard } from '../PatternGalleryCard';
import type { Pattern } from '../../../ontology/lib/patterns/types';

function makePattern(overrides: Partial<Pattern> = {}): Pattern {
  return {
    id: 'pat-1',
    key: 'equipment',
    name: 'Equipment',
    nameKo: '장비 도메인',
    version: 1,
    domain: 'equipment',
    roles: [
      { name: 'Equipment', nodeKind: 'class', description: '' },
      { name: 'Site', nodeKind: 'class', description: '' },
    ],
    relationTypes: [{ name: 'located_at', layer: 'semantic', sourceRole: 'Equipment', targetRole: 'Site' }],
    competencyQuestions: ['장비 위치는?'],
    traversalTemplates: [],
    method: 'adapted',
    sourceRepo: null,
    sourceUri: null,
    sourceLabel: 'schema.org',
    license: 'CC0-1.0',
    occurrenceCount: 12,
    visibility: 'org',
    health: 84,
    isDraft: false,
    previousVersionId: null,
    createdAt: '2026-07-13T00:00:00.000Z',
    ...overrides,
  };
}

describe('PatternGalleryCard', () => {
  it('신뢰 신호와 구조 통계를 표면화한다(사용빈도·헬스·스코프·출처유형)', () => {
    render(<PatternGalleryCard pattern={makePattern()} onSeed={vi.fn()} onDetails={vi.fn()} />);
    expect(screen.getByText('장비 도메인')).toBeInTheDocument();
    expect(screen.getByText(/사용 12/)).toBeInTheDocument();
    expect(screen.getByText('84')).toBeInTheDocument(); // health
    expect(screen.getByText('조직 공유')).toBeInTheDocument(); // visibility
    expect(screen.getByText('적응')).toBeInTheDocument(); // method label
    expect(screen.getByText(/역할 2/)).toBeInTheDocument();
    expect(screen.getByText(/관계 1/)).toBeInTheDocument();
  });

  it('라이선스 미확인 패턴은 경고 배지를 노출한다', () => {
    render(
      <PatternGalleryCard pattern={makePattern({ license: null })} onSeed={vi.fn()} onDetails={vi.fn()} />,
    );
    expect(screen.getByText('라이선스 미확인')).toBeInTheDocument();
  });

  it('시작/자세히 버튼이 각 콜백을 호출한다', async () => {
    const user = userEvent.setup();
    const onSeed = vi.fn();
    const onDetails = vi.fn();
    const pattern = makePattern();
    render(<PatternGalleryCard pattern={pattern} onSeed={onSeed} onDetails={onDetails} />);

    await user.click(screen.getByRole('button', { name: /이 패턴으로 시작/ }));
    expect(onSeed).toHaveBeenCalledWith(pattern);

    await user.click(screen.getByRole('button', { name: /자세히/ }));
    expect(onDetails).toHaveBeenCalledWith(pattern);
  });

  it('역할이 없는 패턴은 시작 버튼이 비활성화된다', () => {
    render(
      <PatternGalleryCard pattern={makePattern({ roles: [] })} onSeed={vi.fn()} onDetails={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /이 패턴으로 시작/ })).toBeDisabled();
  });
});
