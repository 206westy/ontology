'use client';

import { Check, X, Plus, Pencil, Link2, Box, Tag, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmCard } from '@/components/ui/confirm-card';
import type { OntologyAction } from '../../lib/schemas';

export type ActionState = 'pending' | 'applied' | 'ignored' | 'skipped';

// PRD-L M3: 관계유형+엣지 이중성 제거 — 단일 "관계 추가" 카드.
const OP_META: Record<
  OntologyAction['op'],
  { label: string; icon: typeof Plus }
> = {
  add_class: { label: '클래스', icon: Layers },
  add_property: { label: '프로퍼티', icon: Tag },
  add_instance: { label: '인스턴스', icon: Box },
  add_relation: { label: '관계', icon: Link2 },
  update_class: { label: '클래스 수정', icon: Pencil },
};

// PRD-L M2/M3: 레이어 배지 — semantic(지식)/kinetic(행동).
const LAYER_LABEL: Record<string, string> = { semantic: '지식', kinetic: '행동' };

function previewText(action: OntologyAction): string {
  switch (action.op) {
    case 'add_class':
      return action.payload.parentName
        ? `${action.payload.name} ⊂ ${action.payload.parentName}`
        : action.payload.name;
    case 'add_property':
      return `${action.payload.className}.${action.payload.name} : ${action.payload.dataType}`;
    case 'add_instance':
      return `${action.payload.className} → ${action.payload.name}`;
    case 'add_relation':
      return `${action.payload.sourceName} —[${action.payload.relationName}]→ ${action.payload.targetName}`;
    case 'update_class':
      return action.payload.className;
  }
}

// PRD-I §3: 공통 ConfirmCard 껍데기로 정규화. op 유형은 eyebrow, 적용 미리보기는 preview.
// 적용 불가(skipped)는 block 판정으로 표시하고, applied 상태는 applied 플래그로 매핑한다.
export default function ActionCard({
  action,
  state,
  skipReason,
  onApply,
  onIgnore,
}: {
  action: OntologyAction;
  state: ActionState;
  skipReason?: string;
  onApply: () => void;
  onIgnore: () => void;
}) {
  const meta = OP_META[action.op];
  const Icon = meta.icon;
  const isResolved = state !== 'pending';
  // PRD-L M3: 관계 카드는 레이어(지식/행동) 배지를 함께 노출한다.
  const layerLabel =
    action.op === 'add_relation'
      ? LAYER_LABEL[action.payload.layer ?? 'semantic']
      : undefined;

  return (
    <ConfirmCard
      eyebrow={
        <span className="inline-flex items-center gap-0.5">
          <Icon className="w-2.5 h-2.5" />
          {meta.label}
          {layerLabel && (
            <span className="ml-0.5 rounded border px-1 text-[9px] leading-tight text-muted-foreground">
              {layerLabel}
            </span>
          )}
        </span>
      }
      verdict={state === 'skipped' ? 'block' : undefined}
      applied={state === 'applied'}
      className={state === 'ignored' ? 'opacity-60' : undefined}
      title={action.label}
      preview={
        <>
          <p className="text-[10px] font-mono text-muted-foreground break-all">
            {previewText(action)}
          </p>
          {state === 'skipped' && skipReason && (
            <p className="text-[10px] text-destructive mt-1">{skipReason}</p>
          )}
        </>
      }
      actions={
        !isResolved ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[10px] px-1.5"
              onClick={onIgnore}
            >
              <X className="w-3 h-3 mr-0.5" />
              무시
            </Button>
            <Button size="sm" className="h-5 text-[10px] px-2 gap-0.5" onClick={onApply}>
              <Plus className="w-3 h-3" />
              적용
            </Button>
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
            {state === 'applied' && (
              <>
                <Check className="w-3 h-3 text-emerald-500" /> 적용됨
              </>
            )}
            {state === 'ignored' && '무시함'}
            {state === 'skipped' && '적용 불가'}
          </span>
        )
      }
    />
  );
}
