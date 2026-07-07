'use client';

import { useState } from 'react';
import { GitBranch, Plus, Check, Home, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { useBranchList, useBranchActions } from '../hooks/useBranches';
import { toast } from 'sonner';

// PRD-J M2: 브랜치 전환기 — 현재 브랜치 표시 + main 복귀 + 전환 + 새 브랜치.
// PartitionSwitcher 의 상호작용 문법을 미러링한다(구획=도메인 분리, 브랜치=작업 격리).
export default function BranchSwitcher() {
  const currentBranch = useOntologyStore((s) => s.currentBranch);
  const { data: branchList, isLoading } = useBranchList('active');
  const { checkoutBranch, checkoutMain, createBranch } = useBranchActions();

  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const label = currentBranch ? currentBranch.name : 'main';

  const handleCheckout = async (branchId: string) => {
    setIsBusy(true);
    try {
      const ok = await checkoutBranch(branchId);
      if (ok) setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '브랜치 전환 실패');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCheckoutMain = async () => {
    setIsBusy(true);
    try {
      const ok = await checkoutMain();
      if (ok) setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'main 복귀 실패');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setIsBusy(true);
    try {
      const created = await createBranch(name);
      if (created) {
        setNewName('');
        toast.success(`브랜치 "${name}" 생성됨`);
        // 생성 직후 바로 체크아웃 — "분기해서 작업 시작" 흐름을 한 번에.
        await handleCheckout(created.id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '브랜치 생성 실패');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 text-xs gap-1.5 max-w-[160px] ${currentBranch ? 'text-sky-600 dark:text-sky-400' : ''}`}
          title="브랜치 선택 — 격리된 작업 공간에서 편집하고, 병합으로 main에 반영합니다"
          data-testid="branch-switcher"
        >
          <GitBranch className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        <button
          type="button"
          disabled={isBusy}
          onClick={handleCheckoutMain}
          className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-muted disabled:opacity-50 ${!currentBranch ? 'text-primary font-medium' : 'text-foreground'}`}
        >
          <Home className="w-3.5 h-3.5" />
          <span className="flex-1 text-left">main (공유 작업본)</span>
          {!currentBranch && <Check className="w-3.5 h-3.5" />}
        </button>

        <div className="my-1 h-px bg-border" />

        <div className="max-h-56 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && (branchList?.length ?? 0) === 0 && (
            <p className="px-2 py-2 text-[11px] text-muted-foreground">
              활성 브랜치가 없습니다. 아래에서 새 브랜치를 만들어 격리된 작업을 시작하세요.
            </p>
          )}
          {branchList?.map((b) => {
            const active = currentBranch?.id === b.id;
            return (
              <button
                key={b.id}
                type="button"
                disabled={isBusy}
                onClick={() => handleCheckout(b.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-muted disabled:opacity-50 ${active ? 'text-primary font-medium' : 'text-foreground'}`}
              >
                <GitBranch className="w-3 h-3 shrink-0 text-sky-500" />
                <span className="flex-1 text-left truncate">{b.name}</span>
                {b.authorEmail && (
                  <span className="text-[9px] text-muted-foreground truncate max-w-[70px]">
                    {b.authorEmail.split('@')[0]}
                  </span>
                )}
                {active && <Check className="w-3.5 h-3.5" />}
              </button>
            );
          })}
        </div>

        <div className="my-1 h-px bg-border" />

        <div className="flex items-center gap-1.5 px-1 py-1">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreate();
              }
            }}
            placeholder="새 브랜치 이름"
            className="h-7 text-xs"
            data-testid="new-branch-name"
          />
          <Button
            size="sm"
            className="h-7 px-2 shrink-0"
            disabled={!newName.trim() || isBusy}
            onClick={handleCreate}
            title="새 브랜치 생성 (현재 main 상태에서 분기)"
            data-testid="create-branch-btn"
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
