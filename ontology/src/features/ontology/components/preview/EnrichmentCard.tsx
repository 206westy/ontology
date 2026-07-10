'use client';

import { Check, X, ShieldAlert, Sparkles, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmCard } from '@/components/ui/confirm-card';
import {
  type EnrichmentItem,
  type EnrichSourceType,
  GAP_KIND_LABELS,
  SOURCE_TYPE_LABELS,
  SEVERITY_LABELS,
} from '../../lib/enrich-types';

const SOURCE_BADGE_CLASS: Record<EnrichSourceType, string> = {
  existing_graph: 'border-success/40 text-success',
  session_doc: 'border-border text-muted-foreground',
  web: 'border-warning/40 text-warning',
  inferred: 'border-muted-foreground/40 text-muted-foreground',
};

interface EnrichmentCardProps {
  item: EnrichmentItem;
  adopted: boolean;
  sourcing?: boolean;
  onAdopt: () => void;
  onIgnore: () => void;
  onSource: () => void;
}

// A-5 preview: one enrichment suggestion. Shows the detected gap, each sourced
// proposal with a provenance badge + confidence, and adopt/ignore controls.
// Web-sourced proposals carry a "검증 필요" badge. Nothing is auto-applied.
// PRD-I §3: 공통 ConfirmCard 껍데기로 정규화 — gap 종류는 eyebrow, 제안 목록은 preview.
export default function EnrichmentCard({
  item,
  adopted,
  sourcing = false,
  onAdopt,
  onIgnore,
  onSource,
}: EnrichmentCardProps) {
  const { gap, proposals } = item;
  const hasProposals = proposals.length > 0;

  return (
    <ConfirmCard
      eyebrow={GAP_KIND_LABELS[gap.kind]}
      applied={adopted}
      title={
        <span className="flex items-center gap-1.5">
          <span className="truncate">{gap.targetName}</span>
          <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">
            {SEVERITY_LABELS[gap.severity]}
          </span>
        </span>
      }
      preview={
        <>
          <p className="text-xs text-muted-foreground mb-1.5">{gap.reason}</p>

          {proposals.length > 0 && (
            <div className="space-y-1.5">
              {proposals.map((p, i) => (
                <div key={i} className="rounded-md bg-muted/40 px-1.5 py-1">
                  <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                    <Badge
                      variant="outline"
                      className={`text-xs h-5 px-1 ${SOURCE_BADGE_CLASS[p.sourceType]}`}
                    >
                      {SOURCE_TYPE_LABELS[p.sourceType]}
                    </Badge>
                    {p.needsReview && (
                      <Badge
                        variant="outline"
                        className="text-xs h-5 px-1 border-warning/40 text-warning gap-0.5"
                      >
                        <ShieldAlert className="w-2.5 h-2.5" />
                        검증 필요
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs">{p.value}</p>
                  {p.evidence && (
                    <p className="text-xs text-muted-foreground/70 mt-0.5 italic">
                      {p.evidence}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      }
      actions={
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-0.5"
            onClick={onIgnore}
          >
            <X className="w-3 h-3" />
            무시
          </Button>
          {!hasProposals ? (
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs gap-0.5"
              onClick={onSource}
              disabled={sourcing}
            >
              {sourcing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              {sourcing ? '소싱 중' : '보강 소싱'}
            </Button>
          ) : (
            <Button
              variant={adopted ? 'default' : 'outline'}
              size="sm"
              className="h-6 px-2 text-xs gap-0.5"
              onClick={onAdopt}
            >
              <Check className="w-3 h-3" />
              {adopted ? '채택됨' : '채택'}
            </Button>
          )}
        </>
      }
    />
  );
}
