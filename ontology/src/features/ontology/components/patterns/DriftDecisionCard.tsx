'use client';

import { GitBranch, PlusCircle, ShieldAlert, X, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Pattern } from '../../lib/patterns/types';
import type { DriftElement, DriftJudgment } from '../../lib/patterns/drift';
import {
  extendPattern,
  driftElementsToExtension,
  type ExtendedPatternDraft,
} from '../../lib/patterns/extend';

interface DriftDecisionCardProps {
  pattern: Pattern;
  judgments: DriftJudgment[];
  onExtend: (draft: ExtendedPatternDraft) => void;
  onFork: (elements: DriftElement[]) => void;
  onIgnore: () => void;
  forking?: boolean;
}

function elementLabel(el: DriftElement): string {
  return el.kind === 'concept' ? `${el.name}(개념)` : `${el.name}(관계)`;
}

// PRD-H H8-d: 확장 vs 분기 결정 카드. 패턴 밖 신규 요소(N개)를 놓고 각 선택의 미리보기를
// 함께 보여준다 — 확장=패턴 버전업 미리보기, 분기=새 구획(발견 재호출) 미리보기.
// 확정 전에는 패턴·구획이 바뀌지 않는다. 분기 선택 시 발견 파이프라인을 호출한다.
export default function DriftDecisionCard({
  pattern,
  judgments,
  onExtend,
  onFork,
  onIgnore,
  forking = false,
}: DriftDecisionCardProps) {
  const outside = judgments.filter((j) => j.decision !== 'map');
  const extendEls = outside.filter((j) => j.decision === 'extend').map((j) => j.element);
  const forkEls = outside.filter((j) => j.decision === 'fork').map((j) => j.element);

  if (outside.length === 0) return null;

  const extendDraft = extendPattern(pattern, driftElementsToExtension(extendEls));

  return (
    <div className="rounded-lg border border-amber-400/50 bg-amber-500/5 p-2">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="h-4 px-1 text-[9px]">
          패턴 드리프트
        </Badge>
        <Badge
          variant="outline"
          className="ml-auto h-4 gap-0.5 px-1 text-[9px] border-amber-400 text-amber-600"
        >
          <ShieldAlert className="h-2.5 w-2.5" />
          검증 필요
        </Badge>
      </div>

      <p className="mb-2 text-[11px] font-medium">
        새 개념 {outside.length}개가 현재 패턴 밖입니다
      </p>

      {extendEls.length > 0 && (
        <div className="mb-2 rounded-md border border-border bg-card/60 p-1.5">
          <p className="text-[10px] font-medium text-foreground">
            패턴 확장 미리보기 · v{pattern.version} → v{extendDraft.version}
          </p>
          <p className="mt-0.5 text-[9px] text-muted-foreground">
            같은 구획 유지 · 추가: {extendEls.map(elementLabel).join(', ')}
          </p>
          <div className="mt-1.5 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="h-6 gap-0.5 px-2 text-[10px]"
              onClick={() => onExtend(extendDraft)}
            >
              <PlusCircle className="h-3 w-3" />
              패턴 확장
            </Button>
          </div>
        </div>
      )}

      {forkEls.length > 0 && (
        <div className="mb-2 rounded-md border border-border bg-card/60 p-1.5">
          <p className="text-[10px] font-medium text-foreground">
            새 구획으로 분리 미리보기
          </p>
          <p className="mt-0.5 text-[9px] text-muted-foreground">
            다른 도메인 · 발견 파이프라인으로 새 패턴/구획 생성:{' '}
            {forkEls.map(elementLabel).join(', ')}
          </p>
          <div className="mt-1.5 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="h-6 gap-0.5 px-2 text-[10px]"
              onClick={() => onFork(forkEls)}
              disabled={forking}
            >
              {forking ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <GitBranch className="h-3 w-3" />
              )}
              새 구획으로 분리
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-0.5 px-2 text-[10px]"
          onClick={onIgnore}
        >
          <X className="h-3 w-3" />
          무시
        </Button>
      </div>
    </div>
  );
}
