import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublishPatternCard } from '../PublishPatternCard';
import type { Pattern } from '../../../lib/patterns/types';

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
      { name: 'Engineer', nodeKind: 'class', description: '' },
    ],
    relationTypes: [{ name: 'located_at', layer: 'semantic', sourceRole: 'Equipment', targetRole: 'Site' }],
    competencyQuestions: ['q1', 'q2', 'q3'],
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

describe('PublishPatternCard', () => {
  it('헬스와 마스킹 여부를 근거로 노출한다', () => {
    render(<PublishPatternCard pattern={makePattern()} onPublish={vi.fn()} />);
    expect(screen.getByText(/헬스 100/)).toBeInTheDocument();
    expect(screen.getByText(/마스킹할 식별자 없음/)).toBeInTheDocument();
  });

  it('라이선스 확인된 패턴은 바로 발행할 수 있고 기본 스코프는 org', async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();
    render(<PublishPatternCard pattern={makePattern()} onPublish={onPublish} />);

    await user.click(screen.getByRole('button', { name: /^발행$/ }));
    expect(onPublish).toHaveBeenCalledWith({ visibility: 'org', acknowledgeLicense: false });
  });

  it('라이선스 미확인이면 동의 전까지 발행을 막고, 동의 후 허용한다', async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();
    render(<PublishPatternCard pattern={makePattern({ license: null })} onPublish={onPublish} />);

    expect(screen.getByText('검증 필요')).toBeInTheDocument();
    const publishBtn = screen.getByRole('button', { name: /^발행$/ });
    expect(publishBtn).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: /라이선스 검토 동의/ }));
    expect(publishBtn).toBeEnabled();

    await user.click(publishBtn);
    expect(onPublish).toHaveBeenCalledWith({ visibility: 'org', acknowledgeLicense: true });
  });

  it('스코프를 public 으로 바꾸면 그 값으로 발행한다', async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();
    render(<PublishPatternCard pattern={makePattern()} onPublish={onPublish} />);

    await user.click(screen.getByRole('button', { name: '공개' }));
    await user.click(screen.getByRole('button', { name: /^발행$/ }));
    expect(onPublish).toHaveBeenCalledWith({ visibility: 'public', acknowledgeLicense: false });
  });

  it('민감 식별자가 있으면 마스킹됨을 알린다', () => {
    render(
      <PublishPatternCard
        pattern={makePattern({
          roles: [
            { name: 'KC0330655', nodeKind: 'class', description: '' },
            { name: 'Site', nodeKind: 'class', description: '' },
          ],
        })}
        onPublish={vi.fn()}
      />,
    );
    expect(screen.getByText(/민감 식별자 마스킹됨/)).toBeInTheDocument();
  });
});
