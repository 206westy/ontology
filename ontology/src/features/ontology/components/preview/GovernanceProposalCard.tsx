'use client';

import { Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmCard } from '@/components/ui/confirm-card';
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
// PRD-I §3: 공통 ConfirmCard 껍데기로 정규화 — 검증 필요는 항상 attention 플래그.
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
    <ConfirmCard
      eyebrow={KIND_LABELS[proposal.kind]}
      attention
      title={proposal.title}
      evidence={proposal.evidence || undefined}
      applied={applied}
      preview={
        detail ? (
          <p className="text-[10px] text-muted-foreground font-mono">{detail}</p>
        ) : undefined
      }
      actions={
        <>
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
        </>
      }
    />
  );
}
