'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/client';

/** 현재 인증 사용자 구독. 로그인/로그아웃 시 자동 갱신(탭 간 동기화 포함). */
export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!active) return;
        setUser(data.user);
      })
      .catch(() => {
        // 네트워크 실패 등 — 미인증으로 간주하고 조용히 진행한다.
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, isLoading };
}
