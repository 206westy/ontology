import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { LoginForm } from '../LoginForm';
import { signInAction } from '../../lib/actions';

vi.mock('../../lib/actions', () => ({
  signInAction: vi.fn(),
}));

const mockSignIn = vi.mocked(signInAction);

function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
}

describe('LoginForm', () => {
  beforeEach(() => {
    mockSignIn.mockReset();
  });

  it('빈 제출 시 검증 에러를 표시하고 액션을 호출하지 않는다', async () => {
    render(<LoginForm />);
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    expect(await screen.findByText('이메일을 입력하세요')).toBeInTheDocument();
    expect(screen.getByText('비밀번호를 입력하세요')).toBeInTheDocument();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('유효한 입력으로 signInAction 을 호출한다', async () => {
    mockSignIn.mockResolvedValue({});
    render(<LoginForm />);
    fillAndSubmit('user@example.com', 'password123');

    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'password123',
      }),
    );
  });

  it('액션이 에러를 반환하면 alert 로 노출한다', async () => {
    mockSignIn.mockResolvedValue({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });
    render(<LoginForm />);
    fillAndSubmit('user@example.com', 'wrongpassword');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('이메일 또는 비밀번호가 올바르지 않습니다');
  });

  it('비밀번호 표시 토글이 input type 을 전환한다', () => {
    render(<LoginForm />);
    const password = screen.getByLabelText('비밀번호') as HTMLInputElement;
    expect(password.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: '비밀번호 표시' }));
    expect(password.type).toBe('text');
  });
});
