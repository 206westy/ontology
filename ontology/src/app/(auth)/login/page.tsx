'use client';

import Link from 'next/link';

import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { LoginForm } from '@/features/auth/components/LoginForm';

export default function LoginPage() {
  return (
    <AuthLayout
      title="다시 오신 것을 환영합니다"
      description="계정에 로그인하고 작업을 이어가세요."
      footer={
        <div className="space-y-1.5">
          <Link
            href="/forgot-password"
            className="text-primary underline-offset-4 hover:underline"
          >
            비밀번호를 잊으셨나요?
          </Link>
          <p>
            아직 계정이 없으신가요?{' '}
            <Link
              href="/signup"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              회원가입
            </Link>
          </p>
        </div>
      }
    >
      <LoginForm />
    </AuthLayout>
  );
}
