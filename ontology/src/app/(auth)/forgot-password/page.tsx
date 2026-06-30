'use client';

import Link from 'next/link';

import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { ForgotPasswordForm } from '@/features/auth/components/ForgotPasswordForm';

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="비밀번호 재설정"
      description="가입한 이메일로 재설정 링크를 보내드립니다."
      footer={
        <Link
          href="/login"
          className="text-primary underline-offset-4 hover:underline"
        >
          로그인으로 돌아가기
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
