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

    // onAuthStateChange 의 session.user 를 직접 쓰면 supabase-js 가 "insecure" 경고를 낸다
    // (일부 이벤트는 스토리지에서 온 미검증 세션). 로그아웃은 즉시 반영, 그 외엔 getUser()로 재검증.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        if (active) setUser(null);
        return;
      }
      supabase.auth
        .getUser()
        .then(({ data }) => {
          if (active) setUser(data.user);
        })
        .catch(() => {
          if (active) setUser(null);
        });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, isLoading };
}
