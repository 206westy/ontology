import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocalPatternShelf } from '../LocalPatternShelf';
import type { Pattern } from '../../../lib/patterns/types';

// 훅을 주입해 셸(컨테이너) 로직만 검증한다(네트워크·스토어 없음).
const hooks = {
  patterns: { data: [] as Pattern[], isLoading: false },
  seed: {
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    variables: undefined as { pattern: Pattern; source: string } | undefined,
  },
};

vi.mock('../../../hooks/usePatterns', () => ({
  usePatterns: () => hooks.patterns,
}));
vi.mock('../../../hooks/usePatternSeed', () => ({
  usePatternSeed: () => hooks.seed,
}));

function makePattern(overrides: Partial<Pattern> = {}): Pattern {
  return {
    id: 'pat-1',
    key: 'k',
    name: 'Name',
    nameKo: '이름',
    version: 1,
    domain: 'domain',
    roles: [{ name: 'A', nodeKind: 'class', description: '' }],
    relationTypes: [],
    competencyQuestions: [],
    traversalTemplates: [],
    method: 'synthesized',
    sourceRepo: null,
    sourceUri: null,
    sourceLabel: null,
    license: 'CC0-1.0',
    occurrenceCount: 1,
    isDraft: false,
    previousVersionId: null,
    createdAt: '2026-07-13T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  hooks.patterns = { data: [], isLoading: false };
  hooks.seed = { mutate: vi.fn(), isPending: false, isSuccess: false, variables: undefined };
});

describe('LocalPatternShelf', () => {
  it('캐시가 비면 아무것도 렌더하지 않는다', () => {
    const { container } = render(<LocalPatternShelf />);
    expect(container).toBeEmptyDOMElement();
  });

  it('로딩 중이면 렌더하지 않는다', () => {
    hooks.patterns = { data: [makePattern()], isLoading: true };
    const { container } = render(<LocalPatternShelf />);
    expect(container).toBeEmptyDOMElement();
  });

  it('draft·역할 없는 패턴은 제외하고 사용 가능한 패턴만 카드로 노출한다', () => {
    hooks.patterns = {
      data: [
        makePattern({ id: 'usable', nameKo: '쓸수있음' }),
        makePattern({ id: 'draft', nameKo: '초안', isDraft: true }),
        makePattern({ id: 'noroles', nameKo: '역할없음', roles: [] }),
      ],
      isLoading: false,
    };
    render(<LocalPatternShelf />);
    expect(screen.getByText('쓸수있음')).toBeInTheDocument();
    expect(screen.queryByText('초안')).not.toBeInTheDocument();
    expect(screen.queryByText('역할없음')).not.toBeInTheDocument();
  });

  it('사용빈도 내림차순으로 정렬한다', () => {
    hooks.patterns = {
      data: [
        makePattern({ id: 'low', nameKo: '적음', occurrenceCount: 2 }),
        makePattern({ id: 'high', nameKo: '많음', occurrenceCount: 99 }),
      ],
      isLoading: false,
    };
    render(<LocalPatternShelf />);
    const titles = screen.getAllByText(/많음|적음/).map((el) => el.textContent);
    expect(titles[0]).toBe('많음');
  });

  it('시딩 클릭 시 source=cache 로 mutate 를 호출한다', async () => {
    const user = userEvent.setup();
    const pattern = makePattern({ id: 'seedme', nameKo: '시드대상' });
    hooks.patterns = { data: [pattern], isLoading: false };
    render(<LocalPatternShelf />);

    await user.click(screen.getByRole('button', { name: /새 구획으로 시딩/ }));

    expect(hooks.seed.mutate).toHaveBeenCalledWith({ pattern, source: 'cache' });
  });
});
