'use client';

import { useMemo } from 'react';
import { AlertCircle, AlertTriangle, Info, ChevronRight, CheckCircle2 } from 'lucide-react';
import type { ValidationResult, ValidationIssue } from '../../api';

const RULE_LABELS: Record<string, string> = {
  cyclic_isa: '순환 is-a',
  required_properties: '필수 프로퍼티 누락',
  cardinality: '카디널리티 위반',
  orphan_nodes: '고아 노드',
  similar_names: '유사/중복 이름',
};

function severityIcon(sev: ValidationIssue['severity']) {
  if (sev === 'error') return <AlertCircle className="w-3 h-3 text-destructive" />;
  if (sev === 'warning') return <AlertTriangle className="w-3 h-3 text-amber-500" />;
  return <Info className="w-3 h-3 text-sky-500" />;
}

export default function ViolationList({
  result,
  onJump,
}: {
  result: ValidationResult | null;
  onJump: (targetId: string, targetTable: string) => void;
}) {
  const grouped = useMemo(() => {
    if (!result) return [];
    const all = [...result.errors, ...result.warnings, ...result.infos];
    const byRule = new Map<string, ValidationIssue[]>();
    for (const issue of all) {
      const arr = byRule.get(issue.ruleCode) ?? [];
      arr.push(issue);
      byRule.set(issue.ruleCode, arr);
    }
    return [...byRule.entries()];
  }, [result]);

  if (!result) return null;

  if (grouped.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <CheckCircle2 className="w-7 h-7 text-emerald-500/70 mb-2" />
        <p className="text-xs text-muted-foreground">검증 위반이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {grouped.map(([rule, issues]) => (
        <div key={rule} className="rounded-md border border-border overflow-hidden">
          <div className="flex items-center justify-between px-2.5 py-1.5 bg-muted/40 border-b border-border">
            <span className="text-[11px] font-medium text-foreground">
              {RULE_LABELS[rule] ?? rule}
            </span>
            <span className="text-[10px] text-muted-foreground">{issues.length}건</span>
          </div>
          <div>
            {issues.map((issue, i) => (
              <button
                key={i}
                className="w-full text-left flex items-start gap-1.5 px-2.5 py-1.5 hover:bg-muted/40 transition-colors border-b border-border/40 last:border-b-0"
                onClick={() => onJump(issue.targetId, issue.targetTable)}
              >
                <span className="mt-0.5 shrink-0">{severityIcon(issue.severity)}</span>
                <span className="text-[10px] text-foreground leading-relaxed flex-1">
                  {issue.message}
                </span>
                <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0 mt-0.5" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
