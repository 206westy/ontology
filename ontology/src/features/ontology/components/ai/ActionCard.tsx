'use client';

import { Check, X, Plus, Pencil, Link2, Box, Tag, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { OntologyAction } from '../../lib/schemas';

export type ActionState = 'pending' | 'applied' | 'ignored' | 'skipped';

const OP_META: Record<
  OntologyAction['op'],
  { label: string; icon: typeof Plus }
> = {
  add_class: { label: '클래스', icon: Layers },
  add_property: { label: '프로퍼티', icon: Tag },
  add_instance: { label: '인스턴스', icon: Box },
  add_relation_type: { label: '관계 타입', icon: Link2 },
  add_edge: { label: '관계', icon: Link2 },
  update_class: { label: '클래스 수정', icon: Pencil },
};

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
    case 'add_relation_type':
      return action.payload.name;
    case 'add_edge':
      return `${action.payload.sourceName} —[${action.payload.relationTypeName}]→ ${action.payload.targetName}`;
    case 'update_class':
      return action.payload.className;
  }
}

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

  return (
    <div
      className={`rounded-md border p-2 space-y-1.5 transition-colors ${
        state === 'applied'
          ? 'border-emerald-500/40 bg-emerald-500/5'
          : state === 'skipped'
            ? 'border-destructive/30 bg-destructive/5'
            : state === 'ignored'
              ? 'border-border bg-muted/30 opacity-60'
              : 'border-border bg-card'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <Badge variant="outline" className="h-4 text-[9px] px-1 gap-0.5 shrink-0">
          <Icon className="w-2.5 h-2.5" />
          {meta.label}
        </Badge>
        <span className="text-[11px] font-medium text-foreground truncate">{action.label}</span>
      </div>

      <p className="text-[10px] font-mono text-muted-foreground break-all">{previewText(action)}</p>

      {state === 'skipped' && skipReason && (
        <p className="text-[10px] text-destructive">{skipReason}</p>
      )}

      {!isResolved ? (
        <div className="flex items-center justify-end gap-1 pt-0.5">
          <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={onIgnore}>
            <X className="w-3 h-3 mr-0.5" />
            무시
          </Button>
          <Button size="sm" className="h-5 text-[10px] px-2 gap-0.5" onClick={onApply}>
            <Plus className="w-3 h-3" />
            적용
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-end">
          <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
            {state === 'applied' && (
              <>
                <Check className="w-3 h-3 text-emerald-500" /> 적용됨
              </>
            )}
            {state === 'ignored' && '무시함'}
            {state === 'skipped' && '적용 불가'}
          </span>
        </div>
      )}
    </div>
  );
}
