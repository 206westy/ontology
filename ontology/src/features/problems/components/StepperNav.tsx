'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock, Check, CircleDot, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { WORKFLOW_STEPS, type WorkflowStep } from '../schemas';
import type { StepState } from '../workflow';

const STEP_LABEL: Record<WorkflowStep, string> = {
  define: '문제정의',
  data: '데이터 연결',
  studio: '온톨로지 구축',
  functions: '결정함수',
  spc: 'SPC/FDC',
  board: '대시보드·액션',
  operate: 'AIP·자동화',
};

const STATE_META: Record<
  StepState,
  { label: string; badge: 'default' | 'secondary' | 'outline'; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  confirmed: { label: '확정', badge: 'default', className: '', icon: Check },
  draft: { label: '진행중', badge: 'secondary', className: '', icon: CircleDot },
  stale: { label: '재검토', badge: 'outline', className: 'border-amber-500 text-amber-600', icon: AlertTriangle },
  locked: { label: '잠김', badge: 'outline', className: 'text-muted-foreground', icon: Lock },
};

interface Props {
  problemId: string;
  workflowState: Record<string, { state: StepState }>;
  spcEnabled?: boolean;
}

export default function StepperNav({ problemId, workflowState, spcEnabled = true }: Props) {
  const pathname = usePathname();
  // SPC/FDC 모듈 토글 OFF 면 시퀀스에서 spc 스테이지 숨김(끊김 없이 functions→board).
  const steps = WORKFLOW_STEPS.filter((s) => s !== 'spc' || spcEnabled);

  return (
    <nav
      aria-label="문제 워크플로우 단계"
      className="flex items-center gap-1 overflow-x-auto px-4 h-12 border-b border-border bg-card/60 backdrop-blur-sm"
      data-testid="stepper-nav"
    >
      {steps.map((step, i) => {
        const state = (workflowState[step]?.state ?? 'locked') as StepState;
        const meta = STATE_META[state];
        const href = `/problems/${problemId}/${step}`;
        const isActive = pathname === href;
        const isLocked = state === 'locked';
        const Icon = meta.icon;

        const inner = (
          <div
            className={cn(
              'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors',
              isActive && 'bg-muted font-medium',
              isLocked ? 'opacity-60 cursor-not-allowed' : 'hover:bg-muted/60',
            )}
          >
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-muted text-[11px] font-medium shrink-0">
              {i + 1}
            </span>
            <span>{STEP_LABEL[step]}</span>
            <Badge variant={meta.badge} className={cn('text-[10px] gap-1 px-1.5', meta.className)}>
              <Icon className="w-3 h-3" />
              {meta.label}
            </Badge>
          </div>
        );

        return (
          <div key={step} className="flex items-center">
            {i > 0 && <span className="text-muted-foreground/40 px-0.5">›</span>}
            {isLocked ? (
              <div title="이전 단계를 먼저 확정하세요">{inner}</div>
            ) : (
              <Link href={href}>{inner}</Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
