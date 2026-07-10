'use client';

import { LogOut, User as UserIcon } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { useAuthUser } from '../hooks/useAuthUser';
import { signOutAction } from '../lib/actions';

function initialsFrom(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.slice(0, 2).toUpperCase();
}

/** 인증된 사용자용 아바타 드롭다운 + 로그아웃. 미인증/로딩 시 렌더하지 않는다. */
export function UserMenu() {
  const { user } = useAuthUser();

  if (!user) return null;

  const displayName =
    (user.user_metadata?.display_name as string | undefined) ??
    user.email ??
    '사용자';
  const email = user.email ?? '';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="사용자 메뉴"
          className="flex items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
              {initialsFrom(displayName)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center gap-2">
          <UserIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-body-sm font-medium text-foreground">
              {displayName}
            </p>
            {email ? (
              <p className="truncate text-caption text-muted-foreground">{email}</p>
            ) : null}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          asChild
          className="text-destructive focus:text-destructive"
        >
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              로그아웃
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
