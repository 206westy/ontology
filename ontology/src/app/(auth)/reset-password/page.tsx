'use client';

import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { ResetPasswordForm } from '@/features/auth/components/ResetPasswordForm';

export default function ResetPasswordPage() {
  return (
    <AuthLayout
      title="새 비밀번호 설정"
      description="새로 사용할 비밀번호를 입력하세요."
    >
      <ResetPasswordForm />
    </AuthLayout>
  );
}
