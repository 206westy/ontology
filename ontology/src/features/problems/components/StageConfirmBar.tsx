'use client';

import { useState } from 'react';
import { Check, RotateCcw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { problemsApi } from '../api';
import { useProblemWorkflowStore } from '../hooks/useProblemWorkflowStore';
import type { WorkflowStep } from '../schemas';
import type { StepState } from '../workflow';

interface Props {
  problemId: string;
  step: WorkflowStep;
  /** 확정 버튼 라벨 커스텀(기본: "이 단계 확정하고 다음으로"). */
  confirmLabel?: string;
}

// PRD-PF-C M3: confirm-gate 공통 바. 확정 시 workflow_state[step]='confirmed'(감사),
// 재오픈 시 이후 단계 stale(경고만, 데이터 파괴 없음).
export default function StageConfirmBar({ problemId, step, confirmLabel }: Props) {
  const detail = useProblemWorkflowStore((s) => s.detail);
  const patch = useProblemWorkflowStore((s) => s.patchWorkflowState);
  const [busy, setBusy] = useState(false);

  const state = (detail?.workflowState?.[step]?.state ?? 'locked') as StepState;
  const isConfirmed = state === 'confirmed';

  async function run(action: 'confirm' | 'reopen') {
    setBusy(true);
    try {
      const updated = await problemsApi.confirmStep(problemId, step, action);
      patch(updated.workflowState);
      toast.success(action === 'confirm' ? '단계를 확정했습니다.' : '단계를 재오픈했습니다.');
    } catch {
      toast.error('처리에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
      <div className="text-sm text-muted-foreground">
        {isConfirmed
          ? '이 단계는 확정되었습니다. 수정하려면 재오픈하세요(이후 단계는 재검토 표시됩니다).'
          : '검토를 마쳤으면 이 단계를 확정하고 다음으로 넘어가세요.'}
      </div>
      {isConfirmed ? (
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => run('reopen')} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          재오픈(수정)
        </Button>
      ) : (
        <Button size="sm" className="gap-1.5 shrink-0" onClick={() => run('confirm')} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {confirmLabel ?? '이 단계 확정하고 다음으로'}
        </Button>
      )}
    </div>
  );
}
