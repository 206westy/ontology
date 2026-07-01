'use client';

import { Check, X, ShieldAlert, Sparkles, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  type EnrichmentItem,
  type EnrichSourceType,
  GAP_KIND_LABELS,
  SOURCE_TYPE_LABELS,
  SEVERITY_LABELS,
} from '../../lib/enrich-types';

const SOURCE_BADGE_CLASS: Record<EnrichSourceType, string> = {
  existing_graph: 'border-emerald-400 text-emerald-600',
  session_doc: 'border-blue-400 text-blue-600',
  web: 'border-amber-400 text-amber-600',
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
    <div
      className={`rounded-lg border p-2 ${
        adopted ? 'border-primary bg-primary/5' : 'border-border'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Badge variant="secondary" className="text-[9px] h-4 px-1">
          {GAP_KIND_LABELS[gap.kind]}
        </Badge>
        <span className="text-[11px] font-medium truncate">{gap.targetName}</span>
        <span className="text-[9px] text-muted-foreground ml-auto shrink-0">
          {SEVERITY_LABELS[gap.severity]}
        </span>
      </div>

      <p className="text-[10px] text-muted-foreground mb-1.5">{gap.reason}</p>

      {proposals.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {proposals.map((p, i) => (
            <div key={i} className="rounded-md bg-muted/40 px-1.5 py-1">
              <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                <Badge
                  variant="outline"
                  className={`text-[9px] h-4 px-1 ${SOURCE_BADGE_CLASS[p.sourceType]}`}
                >
                  {SOURCE_TYPE_LABELS[p.sourceType]}
                </Badge>
                {p.needsReview && (
                  <Badge
                    variant="outline"
                    className="text-[9px] h-4 px-1 border-amber-400 text-amber-600 gap-0.5"
                  >
                    <ShieldAlert className="w-2.5 h-2.5" />
                    검증 필요
                  </Badge>
                )}
              </div>
              <p className="text-[11px]">{p.value}</p>
              {p.evidence && (
                <p className="text-[9px] text-muted-foreground/70 mt-0.5 italic">
                  {p.evidence}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px] gap-0.5"
          onClick={onIgnore}
        >
          <X className="w-3 h-3" />
          무시
        </Button>
        {!hasProposals ? (
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[10px] gap-0.5"
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
            className="h-6 px-2 text-[10px] gap-0.5"
            onClick={onAdopt}
          >
            <Check className="w-3 h-3" />
            {adopted ? '채택됨' : '채택'}
          </Button>
        )}
      </div>
    </div>
  );
}
