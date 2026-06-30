'use client';

import { useState, useMemo } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Info,
  CheckCircle2,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type { ValidationResult, ValidationIssue } from '../lib/types';
import { useOntologyStore } from '../hooks/useOntologyStore';

const RULE_LABELS: Record<string, string> = {
  cyclic_isa: '순환 is-a 관계',
  required_properties: '필수 프로퍼티 누락',
  cardinality: '카디널리티 위반',
  orphan_nodes: '고아 노드',
  similar_names: '유사 이름 감지',
};

// 비전문가용: 각 규칙이 "무엇이 문제인지" + "어떻게 고치는지"를 평이한 말로 설명.
const RULE_HELP: Record<string, { what: string; fix: string }> = {
  cyclic_isa: {
    what: '두 클래스가 서로 상위이면서 하위가 되어 계층이 빙빙 돕니다.',
    fix: '관련 클래스의 부모(상위 클래스)를 다른 것으로 바꾸거나 비우세요.',
  },
  required_properties: {
    what: '필수로 지정된 속성에 값이 비어 있는 인스턴스가 있습니다.',
    fix: '해당 인스턴스를 열어 빠진 필수 속성 값을 채우세요.',
  },
  cardinality: {
    what: '허용된 관계 개수(최소/최대 범위)를 벗어났습니다.',
    fix: '관계를 더 연결하거나 줄여서 허용 범위에 맞추세요.',
  },
  orphan_nodes: {
    what: '아무 관계도 없는 외톨이 노드입니다.',
    fix: '다른 노드와 관계로 연결하거나, 불필요하면 삭제하세요.',
  },
  similar_names: {
    what: '이름이 비슷한 항목이 있어 중복일 수 있습니다.',
    fix: '중복이면 ‘중복 검사/병합’에서 하나로 합치세요.',
  },
};

const SEVERITY_CONFIG = {
  error: {
    icon: ShieldAlert,
    label: '오류',
    badgeClass: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-400 dark:border-red-700',
    dotClass: 'bg-red-500',
  },
  warning: {
    icon: AlertTriangle,
    label: '경고',
    badgeClass: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-700',
    dotClass: 'bg-amber-500',
  },
  info: {
    icon: Info,
    label: '참고',
    badgeClass: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/40 dark:text-blue-400 dark:border-blue-700',
    dotClass: 'bg-blue-500',
  },
} as const;

interface ValidationResultsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: ValidationResult | null;
  isLoading: boolean;
}

interface GroupedIssues {
  ruleCode: string;
  label: string;
  issues: ValidationIssue[];
  maxSeverity: 'error' | 'warning' | 'info';
}

function groupByRule(result: ValidationResult): GroupedIssues[] {
  const allIssues = [...result.errors, ...result.warnings, ...result.infos];
  const grouped = new Map<string, ValidationIssue[]>();

  for (const issue of allIssues) {
    const existing = grouped.get(issue.ruleCode) ?? [];
    existing.push(issue);
    grouped.set(issue.ruleCode, existing);
  }

  const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };

  return Array.from(grouped.entries())
    .map(([ruleCode, issues]) => {
      const maxSeverity = issues.reduce<'error' | 'warning' | 'info'>((max, issue) => {
        return severityOrder[issue.severity] < severityOrder[max] ? issue.severity : max;
      }, 'info');

      return {
        ruleCode,
        label: RULE_LABELS[ruleCode] ?? ruleCode,
        issues,
        maxSeverity,
      };
    })
    .sort((a, b) => severityOrder[a.maxSeverity] - severityOrder[b.maxSeverity]);
}

function IssueRow({ issue, onNavigate }: { issue: ValidationIssue; onNavigate: (id: string, table: string) => void }) {
  const config = SEVERITY_CONFIG[issue.severity];
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-muted/50 transition-colors group">
      <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: `var(--${issue.severity === 'error' ? 'destructive' : issue.severity === 'warning' ? 'amber' : 'blue'})` }} />
      <span className="text-xs text-foreground flex-1 leading-relaxed">{issue.message}</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        onClick={() => onNavigate(issue.targetId, issue.targetTable)}
        title="해당 노드로 이동"
        aria-label="해당 노드로 이동"
      >
        <ExternalLink className="w-3 h-3" />
      </Button>
    </div>
  );
}

export default function ValidationResultsPanel({
  open,
  onOpenChange,
  result,
  isLoading,
}: ValidationResultsPanelProps) {
  const selectNode = useOntologyStore((s) => s.selectNode);
  const focusNode = useOntologyStore((s) => s.focusNode);

  const grouped = useMemo(() => {
    if (!result) return [];
    return groupByRule(result);
  }, [result]);

  const handleNavigate = (targetId: string, targetTable: string) => {
    const nodeType = targetTable === 'instances' ? 'instance' : 'class';
    selectNode(targetId, nodeType);
    focusNode(targetId);
    onOpenChange(false);
  };

  const isSuccess = result && result.summary.total === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:max-w-[420px] flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            검증 결과
          </SheetTitle>
          <SheetDescription className="text-xs">
            온톨로지 스키마 규칙에 따른 검증 결과입니다.
          </SheetDescription>
        </SheetHeader>

        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">검증 실행 중...</span>
            </div>
          </div>
        )}

        {!isLoading && result && (
          <>
            {/* Summary bar */}
            <div className="flex items-center gap-3 py-3 px-1 border-b border-border">
              {result.summary.errors > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-xs font-medium text-red-600 dark:text-red-400">
                    오류 {result.summary.errors}
                  </span>
                </div>
              )}
              {result.summary.warnings > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    경고 {result.summary.warnings}
                  </span>
                </div>
              )}
              {result.summary.infos > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                    참고 {result.summary.infos}
                  </span>
                </div>
              )}
              <span className="text-[10px] text-muted-foreground ml-auto font-mono">
                {result.runId.slice(0, 8)}
              </span>
            </div>

            {/* Success state */}
            {isSuccess && (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">검증 통과</p>
                    <p className="text-xs text-muted-foreground mt-1">문제가 발견되지 않았습니다.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Issues grouped by rule */}
            {!isSuccess && (
              <ScrollArea className="flex-1 -mx-6 px-6">
                <Accordion type="multiple" defaultValue={grouped.map((g) => g.ruleCode)} className="w-full">
                  {grouped.map((group) => {
                    const config = SEVERITY_CONFIG[group.maxSeverity];
                    return (
                      <AccordionItem key={group.ruleCode} value={group.ruleCode}>
                        <AccordionTrigger className="py-2.5 text-xs hover:no-underline">
                          <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
                            <span className="font-medium">{group.label}</span>
                            <Badge variant="outline" className={`h-4 text-[9px] px-1 font-mono ${config.badgeClass}`}>
                              {group.issues.length}
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-2">
                          {RULE_HELP[group.ruleCode] && (
                            <div className="mb-1.5 rounded-md bg-muted/40 px-2 py-1.5 space-y-0.5">
                              <p className="text-[11px] text-foreground/80 leading-relaxed">
                                {RULE_HELP[group.ruleCode].what}
                              </p>
                              <p className="text-[11px] text-primary/90 leading-relaxed">
                                <span className="font-medium">고치는 법: </span>
                                {RULE_HELP[group.ruleCode].fix}
                              </p>
                            </div>
                          )}
                          <div className="space-y-0.5">
                            {group.issues.map((issue, idx) => (
                              <IssueRow
                                key={`${issue.targetId}-${idx}`}
                                issue={issue}
                                onNavigate={handleNavigate}
                              />
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </ScrollArea>
            )}
          </>
        )}

        {!isLoading && !result && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">검증을 실행하면 결과가 표시됩니다.</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
