'use client';

import { Check, X, ShieldAlert, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { GovernanceProposal, GovernanceKind } from '../../lib/schemas';

const KIND_LABELS: Record<GovernanceKind, string> = {
  constraint_cardinality: '카디널리티',
  constraint_disjoint: '배타(disjoint)',
  constraint_domain_range: '도메인/레인지',
  constraint_property_value: '값 제약',
  property_required: '필수 속성',
  property_enum: 'enum 후보',
  edge_cardinality: '관계 다중성',
  axiom: '공리',
};

interface GovernanceProposalCardProps {
  proposal: GovernanceProposal;
  applied: boolean;
  applying?: boolean;
  onApprove: () => void;
  onIgnore: () => void;
}

// PRD-E P2-7: 거버넌스 제안 카드. 모든 제안은 evidence+confidence 와 "검증 필요"를
// 달고, 자동 적용되지 않는다 — 사용자가 승인할 때만 반영된다(HITL).
export default function GovernanceProposalCard({
  proposal,
  applied,
  applying = false,
  onApprove,
  onIgnore,
}: GovernanceProposalCardProps) {
  const detail = [
    proposal.targetClass && `클래스: ${proposal.targetClass}`,
    proposal.relationType && `관계: ${proposal.relationType}`,
    proposal.property && `속성: ${proposal.property}`,
    proposal.minCardinality != null && `min ${proposal.minCardinality}`,
    proposal.maxCardinality != null && `max ${proposal.maxCardinality}`,
    proposal.enumValues?.length && `[${proposal.enumValues.join(', ')}]`,
    proposal.disjointWith && `↔ ${proposal.disjointWith}`,
    proposal.axiomLogic && `규칙: ${proposal.axiomLogic}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className={`rounded-lg border p-2 ${
        applied ? 'border-primary bg-primary/5' : 'border-border'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
        <Badge variant="secondary" className="text-[9px] h-4 px-1">
          {KIND_LABELS[proposal.kind]}
        </Badge>
        <Badge
          variant="outline"
          className="text-[9px] h-4 px-1 border-amber-400 text-amber-600 gap-0.5 ml-auto"
        >
          <ShieldAlert className="w-2.5 h-2.5" />
          검증 필요
        </Badge>
      </div>

      <p className="text-[11px] font-medium">{proposal.title}</p>
      {detail && (
        <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{detail}</p>
      )}
      {proposal.evidence && (
        <p className="text-[9px] text-muted-foreground/70 mt-0.5 italic">
          {proposal.evidence}
        </p>
      )}

      <div className="flex justify-end gap-1.5 mt-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px] gap-0.5"
          onClick={onIgnore}
          disabled={applied}
        >
          <X className="w-3 h-3" />
          무시
        </Button>
        <Button
          variant={applied ? 'default' : 'outline'}
          size="sm"
          className="h-6 px-2 text-[10px] gap-0.5"
          onClick={onApprove}
          disabled={applied || applying}
        >
          {applying ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Check className="w-3 h-3" />
          )}
          {applied ? '반영됨' : '승인'}
        </Button>
      </div>
    </div>
  );
}
