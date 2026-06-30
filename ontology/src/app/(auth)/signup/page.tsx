'use client';

import Link from 'next/link';

import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { SignupForm } from '@/features/auth/components/SignupForm';

export default function SignupPage() {
  return (
    <AuthLayout
      title="온톨로지를 지금 시작하세요"
      description="이메일로 가입하고 첫 지식 그래프를 만들어보세요."
      footer={
        <p>
          이미 계정이 있으신가요?{' '}
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            로그인
          </Link>
        </p>
      }
    >
      <SignupForm />
    </AuthLayout>
  );
}
