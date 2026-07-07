'use client';

import { ArrowLeftRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// PRD-L M4: 클래스/인스턴스 확정을 "AI 확신-초안 + 평문 질문 + 원탭 전환"의
// 하나의 어포던스로 수렴한다. 아래 상수는 3곳(빠른입력 탭·AI 미리보기 트리·
// RightPanel 배지)이 같은 문구를 쓰도록 단일 출처로 export 한다.

export type NodeKind = 'class' | 'instance';

// 배지 라벨(짧은 이름).
export const NODE_KIND_LABELS: Record<NodeKind, string> = {
  class: '클래스',
  instance: '인스턴스',
};

// 배지 옆/툴팁의 한 줄 요약(판정이 무엇인지).
export const NODE_KIND_SUMMARY: Record<NodeKind, string> = {
  class: '개념의 종류·카테고리',
  instance: '실제 사례 한 개',
};

// 결정 시점 평문 질문.
export const NODE_KIND_QUESTION = '이건 종류(클래스)인가요, 실제 하나(인스턴스)인가요?';

// 각 선택지의 쉬운 말 설명(예시 포함).
export const NODE_KIND_DESCRIPTIONS: Record<NodeKind, string> = {
  class: '비슷한 것들을 대표하는 유형 — 예: 호랑이',
  instance: '그 유형의 실제 한 개 — 예: 범이(우리집 호랑이)',
};

interface NodeKindToggleProps {
  kind: NodeKind;
  // 없으면 전환 버튼 없이 배지(+툴팁)만 표시 — 전환 로직이 없는 표면용.
  onToggle?: (next: NodeKind) => void;
  // 배지 + 전환 버튼만(평문 질문·설명 생략). 트리 행 등 좁은 자리용.
  compact?: boolean;
  disabled?: boolean;
  className?: string;
}

export function NodeKindToggle({
  kind,
  onToggle,
  compact = false,
  disabled = false,
  className,
}: NodeKindToggleProps) {
  const next: NodeKind = kind === 'class' ? 'instance' : 'class';
  const label = NODE_KIND_LABELS[kind];

  const badge = (
    <Badge
      variant="outline"
      className="h-6 shrink-0 px-2 text-xs"
      title={`${label} — ${NODE_KIND_SUMMARY[kind]}`}
    >
      {label}
    </Badge>
  );

  // 원탭 전환 버튼 — 항상 보임(hover 전용 금지), 최소 24px 타깃(h-6).
  const toggleButton = onToggle && (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(next)}
      title={`${NODE_KIND_LABELS[next]}로 바꾸기 — ${NODE_KIND_SUMMARY[next]}`}
      className="inline-flex h-6 min-w-6 items-center gap-1 rounded border border-border px-2 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
    >
      <ArrowLeftRight className="h-3 w-3" />
      {NODE_KIND_LABELS[next]}
    </button>
  );

  if (compact) {
    return (
      <span className={cn('inline-flex items-center gap-1.5', className)}>
        {badge}
        {toggleButton}
      </span>
    );
  }

  return (
    <div className={cn('space-y-1', className)}>
      <p className="text-xs leading-snug text-muted-foreground">{NODE_KIND_QUESTION}</p>
      <div className="flex items-center gap-1.5">
        {badge}
        {toggleButton}
      </div>
      <p className="text-xs leading-snug text-muted-foreground/80">
        {NODE_KIND_DESCRIPTIONS[kind]}
      </p>
    </div>
  );
}
