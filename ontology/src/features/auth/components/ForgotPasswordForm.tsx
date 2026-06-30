'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, MailCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

import { requestPasswordResetAction } from '../lib/actions';
import { forgotPasswordSchema, type ForgotPasswordInput } from '../lib/schemas';
import { FormError } from './FormError';

export function ForgotPasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = (values: ForgotPasswordInput) => {
    setFormError(null);
    startTransition(async () => {
      const result = await requestPasswordResetAction(values);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      setSent(true);
    });
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <MailCheck className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <h2 className="text-heading-sm font-semibold text-foreground">
          메일을 확인하세요
        </h2>
        <p className="text-body-sm text-muted-foreground">
          입력하신 주소로 가입된 계정이 있다면 비밀번호 재설정 링크를
          보냈습니다.
        </p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormError message={formError} />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>이메일</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          재설정 링크 받기
        </Button>
      </form>
    </Form>
  );
}
