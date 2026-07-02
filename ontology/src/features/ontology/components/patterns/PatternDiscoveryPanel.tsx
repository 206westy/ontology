'use client';

import { useState, useCallback } from 'react';
import { Sparkles, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useDiscoverPattern, usePromotePattern } from '../../hooks/usePatterns';
import DomainSummaryCard from './DomainSummaryCard';
import PatternDiscoveryCard from './PatternDiscoveryCard';
import CachePromotionCard from './CachePromotionCard';
import PatternReviewSequence, {
  type PatternReviewData,
} from './PatternReviewSequence';
import type { ParsePatternContext } from '../../lib/schemas';
import type {
  Pattern,
  PromotePatternRequestInput,
} from '../../lib/patterns/types';
import type { TermCandidate } from '../../lib/terms/types';
import type { DriftElement } from '../../lib/patterns/drift';
import type { ExtendedPatternDraft } from '../../lib/patterns/extend';
import type { BridgeSuggestion } from '../../lib/bridge/cross-partition';
import type { DiscoverPatternResult } from '../../api';

// PRD-H H3 (M2): 패턴 발견/컨펌 게이트 진입 패널. 입력 → useDiscoverPattern →
// DomainSummaryCard(+발견/승격 카드) → 컨펌 시에만 패턴 시드 생성을 트리거한다.
// 컨펌 전에는 절대 생성이 시작되지 않는다(게이트).

export interface PatternGenerateArgs {
  text: string;
  patternContext: ParsePatternContext;
  // 발행 라이선스 경고용: 이 생성에 사용된 패턴 참조.
  pattern: { id: string | null; name: string; license: string | null };
  // PRD-H (H7/M5): 검수 CQ 통과율용 — 이 패턴의 CQ + traversal 번들.
  cq: {
    competencyQuestions: string[];
    traversalTemplates: Pattern['traversalTemplates'];
  };
}

interface PatternDiscoveryPanelProps {
  initialText?: string;
  onGenerate: (args: PatternGenerateArgs) => void;
  onCancel?: () => void;
  // PRD-H (H8/M5): 생성 완료 후 부모가 채우는 HITL 검수 데이터. 있으면 발견/컨펌 게이트
  // 대신 검수 시퀀스를 렌더한다(생성 이후에만 등장). 없으면 기존 게이트 동작 그대로.
  review?: PatternReviewData | null;
  onReviewConfirmTerm?: (term: string, candidate: TermCandidate) => void;
  onReviewManualTerm?: (term: string, meaning: string) => void;
  onReviewExtend?: (draft: ExtendedPatternDraft) => void;
  onReviewFork?: (elements: DriftElement[]) => void;
  onReviewConnectBridge?: (suggestion: BridgeSuggestion) => void;
  onReviewComplete?: () => void;
}

const noop = () => {};

// 확정된 패턴(캐시 히트 Pattern 또는 발견 초안 draft)을 추출 시드 컨텍스트로 변환.
export function buildParsePatternContext(
  source: Pattern | PromotePatternRequestInput,
): ParsePatternContext {
  return {
    domain: source.domain,
    roles: source.roles.map((r) => ({ name: r.name, description: r.description })),
    relationTypes: source.relationTypes.map((rt) => ({
      name: rt.name,
      category: rt.category,
      sourceRole: rt.sourceRole,
      targetRole: rt.targetRole,
    })),
    competencyQuestions: source.competencyQuestions,
  };
}

export default function PatternDiscoveryPanel({
  initialText = '',
  onGenerate,
  onCancel,
  review = null,
  onReviewConfirmTerm = noop,
  onReviewManualTerm = noop,
  onReviewExtend = noop,
  onReviewFork = noop,
  onReviewConnectBridge = noop,
  onReviewComplete,
}: PatternDiscoveryPanelProps) {
  const [text, setText] = useState(initialText);
  // 승격(저장) 후 얻은 실제 Pattern(있으면 draft 대신 이걸 시드로 사용).
  const [promoted, setPromoted] = useState<Pattern | null>(null);

  const discover = useDiscoverPattern();
  const promote = usePromotePattern();

  const result = discover.data as DiscoverPatternResult | undefined;

  const handleAnalyze = useCallback(() => {
    if (!text.trim()) return;
    setPromoted(null);
    discover.mutate({ text: text.trim() });
  }, [text, discover]);

  // 게이트: 컨펌 시에만 호출된다. 확정된 패턴을 시드로 생성 트리거.
  const handleConfirm = useCallback(() => {
    if (!result) return;
    const source: Pattern | PromotePatternRequestInput | undefined =
      promoted ?? result.pattern ?? result.draft;
    if (!source) return;
    const license =
      'license' in source ? source.license ?? null : result.source?.license ?? null;
    const id = promoted?.id ?? result.pattern?.id ?? null;
    const name =
      ('nameKo' in source && source.nameKo) || source.name || result.recognize.domainKo;
    onGenerate({
      text: text.trim(),
      patternContext: buildParsePatternContext(source),
      pattern: { id, name, license },
      cq: {
        competencyQuestions: source.competencyQuestions,
        traversalTemplates: source.traversalTemplates,
      },
    });
  }, [result, promoted, text, onGenerate]);

  const handleSaveDraft = useCallback(() => {
    if (!result?.draft) return;
    promote.mutate(result.draft, {
      onSuccess: (pattern) => setPromoted(pattern),
    });
  }, [result, promote]);

  const draftName =
    result?.draft?.nameKo || result?.draft?.name || result?.recognize.domainKo || '';

  return (
    <div
      className="w-[420px] max-w-[92vw] rounded-xl border border-border bg-card p-4 shadow-elevation-2"
      data-testid="pattern-discovery-panel"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          {review ? '생성 검수' : '패턴으로 시작'}
        </h3>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {review ? (
        <PatternReviewSequence
          termResolutions={review.termResolutions}
          driftPattern={review.driftPattern}
          driftJudgments={review.driftJudgments}
          bridges={review.bridges}
          partitionNames={review.partitionNames}
          onConfirmTerm={onReviewConfirmTerm}
          onManualTerm={onReviewManualTerm}
          onExtend={onReviewExtend}
          onFork={onReviewFork}
          onConnectBridge={onReviewConnectBridge}
          onComplete={onReviewComplete}
        />
      ) : (
        <>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="아는 내용을 붙여넣으면 도메인 패턴을 찾아 그 패턴으로 구조화합니다."
        className="mb-2 min-h-[100px] resize-none text-xs"
      />

      <div className="flex justify-end">
        <Button
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={handleAnalyze}
          disabled={!text.trim() || discover.isPending}
        >
          {discover.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          도메인 분석
        </Button>
      </div>

      {discover.isError && (
        <p className="mt-2 text-[11px] text-destructive">
          도메인 분석에 실패했습니다. 다시 시도해 주세요.
        </p>
      )}

      {result && (
        <div className="mt-3 space-y-2">
          <DomainSummaryCard recognize={result.recognize} onConfirm={handleConfirm} />

          {!result.cached && result.method && !promoted && (
            <>
              <PatternDiscoveryCard
                patternName={draftName}
                method={result.method}
                source={result.source ?? null}
                onUse={handleConfirm}
              />
              <CachePromotionCard
                patternName={draftName}
                saving={promote.isPending}
                onSave={handleSaveDraft}
                onOnce={handleConfirm}
              />
            </>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
}
