'use client';

import { Check, Circle, CircleDot } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

// PRD-I (M2): 가이드 여정용 경량 세로 스테퍼. shadcn sidebar 없이 기존 프리미티브
// (Badge/Separator + lucide 아이콘)만으로 상태(완료/현재/예정)를 표현한다.

export interface JourneyStep {
  id: string;
  label: string;
}

interface JourneyStepperProps {
  steps: JourneyStep[];
  currentStepId: string;
  completedIds: string[];
}

type StepState = 'completed' | 'current' | 'upcoming';

const ICON_BY_STATE: Record<StepState, React.ComponentType<{ className?: string }>> = {
  completed: Check,
  current: CircleDot,
  upcoming: Circle,
};

const ICON_CLASS: Record<StepState, string> = {
  completed: 'text-success',
  current: 'text-primary',
  upcoming: 'text-muted-foreground',
};

const LABEL_CLASS: Record<StepState, string> = {
  completed: 'text-foreground',
  current: 'text-primary font-medium',
  upcoming: 'text-muted-foreground',
};

function resolveState(id: string, currentStepId: string, completed: Set<string>): StepState {
  if (completed.has(id)) return 'completed';
  if (id === currentStepId) return 'current';
  return 'upcoming';
}

export default function JourneyStepper({ steps, currentStepId, completedIds }: JourneyStepperProps) {
  const completed = new Set(completedIds);
  const currentIndex = steps.findIndex((s) => s.id === currentStepId);
  const progress = currentIndex >= 0 ? currentIndex + 1 : Math.min(completed.size, steps.length);

  return (
    <div data-testid="journey-stepper" className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-foreground">가이드</span>
        <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-mono">
          {progress}/{steps.length}
        </Badge>
      </div>
      <Separator className="my-1" />
      <ol className="flex flex-col gap-1.5">
        {steps.map((step) => {
          const state = resolveState(step.id, currentStepId, completed);
          const Icon = ICON_BY_STATE[state];
          return (
            <li
              key={step.id}
              data-testid={`step-${step.id}`}
              data-state={state}
              className="flex items-center gap-1.5"
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 ${ICON_CLASS[state]}`} />
              <span className={`text-[11px] leading-tight ${LABEL_CLASS[state]}`}>{step.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
