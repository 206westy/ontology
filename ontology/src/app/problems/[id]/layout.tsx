'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Boxes } from 'lucide-react';
import { toast } from 'sonner';
import StepperNav from '@/features/problems/components/StepperNav';
import CopilotPanel from '@/features/copilot/components/CopilotPanel';
import { problemsApi } from '@/features/problems/api';
import { useProblemWorkflowStore } from '@/features/problems/hooks/useProblemWorkflowStore';
import { WORKFLOW_STEPS, type WorkflowStep } from '@/features/problems/schemas';
import { isStepAccessible, type WorkflowState } from '@/features/problems/workflow';

function currentStage(pathname: string): WorkflowStep | null {
  const seg = pathname.split('/').pop() ?? '';
  return (WORKFLOW_STEPS as readonly string[]).includes(seg)
    ? (seg as WorkflowStep)
    : null;
}

// PRD-PF-C M3: 문제 워크플로우 공통 셸. 상단 스텝퍼 + 좌측 작업영역 + 우측 AI 코파일럿(PF-E).
// studio 단계만 예외적으로 풀 와이드(기존 3패널 캔버스 보존, §5.1).
export default function ProblemWorkflowLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const id = params.id;
  const detail = useProblemWorkflowStore((s) => s.detail);
  const setDetail = useProblemWorkflowStore((s) => s.setDetail);
  const clear = useProblemWorkflowStore((s) => s.clear);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    problemsApi
      .get(id)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
      clear();
    };
  }, [id, setDetail, clear]);

  const stage = currentStage(pathname);
  const isStudio = stage === 'studio';
  const loaded = detail?.id === id;

  // PRD-PF-C M3: 잠긴 단계 직접 URL 접근 차단 — 마지막으로 접근 가능한 단계로 안내·리다이렉트.
  useEffect(() => {
    if (!loaded || !detail || !stage) return;
    const ws = detail.workflowState as WorkflowState;
    if (isStepAccessible(ws, stage)) return;
    const lastOpen = [...WORKFLOW_STEPS].reverse().find((s) => isStepAccessible(ws, s)) ?? 'define';
    toast.info('이전 단계를 먼저 확정하세요.');
    router.replace(`/problems/${id}/${lastOpen}`);
  }, [loaded, detail, stage, id, router]);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* 상단: 문제명 + 뒤로 */}
      <div className="flex items-center gap-3 px-4 h-11 border-b border-border bg-card/60 shrink-0">
        <Link href="/problems" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> 문제
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-medium truncate flex items-center gap-1.5">
          <Boxes className="w-4 h-4 text-primary" />
          {detail?.title ?? '불러오는 중…'}
        </span>
      </div>

      {/* 스텝퍼 */}
      {loaded && <StepperNav problemId={id} workflowState={detail.workflowState} />}

      {/* 본문 */}
      {error ? (
        <div className="flex-1 flex items-center justify-center text-sm text-destructive">
          문제를 불러오지 못했습니다.
        </div>
      ) : !loaded ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : isStudio ? (
        <div className="flex-1 min-h-0">{children}</div>
      ) : (
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 overflow-y-auto">{children}</div>
          <aside className="w-[380px] shrink-0 border-l border-border overflow-y-auto bg-card/30">
            {stage && <CopilotPanel stage={stage} problemId={id} />}
          </aside>
        </div>
      )}
    </div>
  );
}
