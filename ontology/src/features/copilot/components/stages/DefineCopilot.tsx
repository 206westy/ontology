'use client';

import { CircleCheck, CircleAlert } from 'lucide-react';
import { useProblemWorkflowStore } from '@/features/problems/hooks/useProblemWorkflowStore';

interface Check {
  ok: boolean;
  label: string;
  hint: string;
}

// PRD-PF-E M2: 문제정의 코파일럿. 결정-우선 프레이밍 점검(결정론·즉시·환각 없음).
export default function DefineCopilot() {
  const detail = useProblemWorkflowStore((s) => s.detail);
  if (!detail) return null;

  const goal = detail.goalMetric ?? {};
  const checks: Check[] = [
    { ok: !!detail.title?.trim(), label: '문제가 한 줄로 정의됨', hint: '무엇을 결정하려는지 한 문장으로.' },
    { ok: !!goal.name?.trim(), label: '목표 지표가 있음', hint: '성공을 무엇으로 측정하나(예: 불량률).' },
    { ok: (detail.actionSlots?.length ?? 0) > 0, label: '결정 결과(액션)가 정의됨', hint: '통과/불통과처럼 산출할 결정을 명시.' },
    { ok: (detail.decisionQuestions?.length ?? 0) > 0, label: '결정 질문이 있음', hint: '무엇을 물어 결정할지(CQ→결정 승격).' },
    { ok: detail.links.length > 0, label: '온톨로지에 연결됨', hint: '어떤 지식 위에서 풀지 선택(재사용/분기).' },
  ];
  const done = checks.filter((c) => c.ok).length;

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        문제를 결정-우선으로 프레이밍했는지 점검합니다. ({done}/{checks.length})
      </div>
      <div className="space-y-1.5">
        {checks.map((c, i) => (
          <div key={i} className="flex items-start gap-2 rounded-md border border-border px-2.5 py-2">
            {c.ok ? (
              <CircleCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <CircleAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5">
              <div className="text-sm">{c.label}</div>
              {!c.ok && <div className="text-xs text-muted-foreground">{c.hint}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
