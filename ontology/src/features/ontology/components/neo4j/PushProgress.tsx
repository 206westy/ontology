'use client';

import { Loader2, Check, Circle } from 'lucide-react';

export interface PushStep {
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  count?: number;
}

interface PushProgressProps {
  steps: PushStep[];
  currentIndex: number;
  totalSteps: number;
}

export default function PushProgress({ steps, currentIndex, totalSteps }: PushProgressProps) {
  const progress = totalSteps > 0 ? Math.round((currentIndex / totalSteps) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-mono">
            {currentIndex}/{totalSteps} 쿼리 실행 중
          </span>
          <span className="text-muted-foreground font-mono">{progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300 ease-out"
            style={{
              width: `${progress}%`,
              backgroundColor: 'hsl(var(--progress-fill))',
            }}
          />
        </div>
      </div>

      {/* Step checklist */}
      <div className="space-y-1.5">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            {step.status === 'done' && (
              <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            )}
            {step.status === 'running' && (
              <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
            )}
            {step.status === 'pending' && (
              <Circle className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
            )}
            {step.status === 'error' && (
              <span className="w-3.5 h-3.5 flex items-center justify-center text-destructive shrink-0 font-bold text-[10px]">
                ✗
              </span>
            )}
            <span
              className={`${
                step.status === 'done'
                  ? 'text-foreground'
                  : step.status === 'running'
                    ? 'text-foreground'
                    : step.status === 'error'
                      ? 'text-destructive'
                      : 'text-muted-foreground'
              }`}
            >
              {step.label}
              {step.count !== undefined && (
                <span className="text-muted-foreground ml-1">({step.count}개)</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
