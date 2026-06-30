'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

import { AuthLayout } from '@/features/auth/components/AuthLayout';

export default function AuthCodeErrorPage() {
  return (
    <AuthLayout
      title="링크를 확인할 수 없습니다"
      description="인증 링크가 만료되었거나 이미 사용되었습니다."
    >
      <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-card p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
          <AlertTriangle className="h-6 w-6 text-warning" aria-hidden="true" />
        </div>
        <p className="text-body-sm text-muted-foreground">
          새 링크를 요청하거나 다시 로그인해주세요.
        </p>
        <div className="flex flex-col gap-2 text-body-sm">
          <Link
            href="/forgot-password"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            비밀번호 재설정 링크 다시 받기
          </Link>
          <Link
            href="/login"
            className="text-primary underline-offset-4 hover:underline"
          >
            로그인으로 돌아가기
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
