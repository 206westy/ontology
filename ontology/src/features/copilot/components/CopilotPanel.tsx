'use client';

import { Sparkles, ShieldCheck } from 'lucide-react';
import type { WorkflowStep } from '@/features/problems/schemas';
import DefineCopilot from './stages/DefineCopilot';
import DataCopilot from './stages/DataCopilot';
import FunctionsCopilot from './stages/FunctionsCopilot';
import BoardCopilot from './stages/BoardCopilot';

interface Props {
  stage: WorkflowStep;
  problemId: string;
}

const STAGE_TITLE: Record<WorkflowStep, string> = {
  define: '문제정의 코파일럿',
  data: '데이터 충분성 코파일럿',
  studio: '온톨로지 코파일럿',
  functions: '키네틱 코파일럿',
  spc: 'SPC/FDC 코파일럿',
  board: '보드 코파일럿',
  operate: '운영 코파일럿',
};

// PRD-PF-E M1: 전 단계 공통 AI 코파일럿 셸. stage 별 툴콜 스위칭. 모든 제안은 초안 —
// 확정은 항상 사람(HITL), 근거·출처 표기, 근거 없으면 '모름'.
export default function CopilotPanel({ stage, problemId }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="w-4 h-4 text-primary" /> {STAGE_TITLE[stage]}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
          <ShieldCheck className="w-3 h-3" /> 제안은 초안입니다 · 확정은 사람이 합니다
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {stage === 'define' && <DefineCopilot />}
        {stage === 'data' && <DataCopilot problemId={problemId} />}
        {stage === 'functions' && <FunctionsCopilot problemId={problemId} />}
        {stage === 'board' && <BoardCopilot />}
        {stage === 'studio' && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            온톨로지 구축 단계의 AI(파싱·Critic·확장)는 스튜디오 우측 속성 패널의
            AI 어시스턴트 탭에 있습니다.
          </p>
        )}
      </div>
    </div>
  );
}
