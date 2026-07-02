'use client';

import { useState } from 'react';
import { Check, ShieldAlert, Pencil, SkipForward, Shuffle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmCard } from '@/components/ui/confirm-card';
import type {
  TermCandidate,
  TermCandidateSource,
  TermResolution,
} from '../../lib/terms/types';

const SOURCE_LABELS: Record<TermCandidateSource, string> = {
  internal: '용어집',
  context: '맥락',
  web: '웹',
};

const SOURCE_BADGE_CLASS: Record<TermCandidateSource, string> = {
  internal: 'border-emerald-400 text-emerald-600',
  context: 'border-blue-400 text-blue-600',
  web: 'border-amber-400 text-amber-600',
};

const RANK_MARKS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];

interface TermConfirmCardProps {
  resolution: TermResolution;
  // 확정 후 재확인 상태를 부모가 제어할 때(선택). 없으면 카드가 로컬로 안내를 띄운다.
  confirmed?: boolean;
  onConfirm: (candidate: TermCandidate) => void;
  onOther?: () => void;
  onManual: (meaning: string) => void;
  onSkip: () => void;
}

// PRD-H H8-e: 용어 확인 카드. 후보(랭킹+신뢰도+출처)와 "무엇을 근거로 이 뜻을 골랐는지"
// (주입한 맥락)를 투명하게 보여준다. 웹 후보는 "검증 필요". 확정 전에는 아무 뜻도 정해지지 않는다.
// PRD-I §3: 공통 ConfirmCard 껍데기로 재정규화(판정→근거→미리보기→액션).
export default function TermConfirmCard({
  resolution,
  confirmed = false,
  onConfirm,
  onOther,
  onManual,
  onSkip,
}: TermConfirmCardProps) {
  const { term, candidates, contextInjected } = resolution;
  const [selected, setSelected] = useState(0);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState('');
  const [confirmedMeaning, setConfirmedMeaning] = useState<string | null>(null);

  const hasCandidates = candidates.length > 0;

  const handleConfirm = () => {
    const candidate = candidates[selected];
    if (!candidate) return;
    setConfirmedMeaning(candidate.meaning);
    onConfirm(candidate);
  };

  const handleManualSubmit = () => {
    const value = manual.trim();
    if (!value) return;
    setConfirmedMeaning(value);
    onManual(value);
  };

  const guidance = confirmedMeaning ?? (confirmed ? candidates[selected]?.meaning : null);

  const preview = (
    <>
      {hasCandidates ? (
        <ul className="space-y-1">
          {candidates.map((c, i) => {
            const pct = Math.round(c.confidence * 100);
            const isSelected = i === selected;
            return (
              <li key={`${c.meaning}-${i}`}>
                <button
                  type="button"
                  onClick={() => setSelected(i)}
                  aria-pressed={isSelected}
                  className={`w-full rounded-md px-1.5 py-1 text-left ${
                    isSelected ? 'bg-primary/10 ring-1 ring-primary/40' : 'bg-muted/40'
                  }`}
                >
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[11px] font-medium">
                      {RANK_MARKS[i] ?? `${i + 1}.`} {c.meaning}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{pct}%</span>
                    <Badge
                      variant="outline"
                      className={`ml-auto h-4 px-1 text-[9px] ${SOURCE_BADGE_CLASS[c.source]}`}
                    >
                      {SOURCE_LABELS[c.source]}
                    </Badge>
                    {c.source === 'web' && (
                      <Badge
                        variant="outline"
                        className="h-4 gap-0.5 px-1 text-[9px] border-amber-400 text-amber-600"
                      >
                        <ShieldAlert className="h-2.5 w-2.5" />
                        검증 필요
                      </Badge>
                    )}
                  </div>
                  {c.rationale && (
                    <p className="mt-0.5 text-[9px] italic text-muted-foreground/70">
                      {c.rationale}
                    </p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[10px] text-muted-foreground">
          맥락에서 뜻 후보를 찾지 못했습니다. 직접 입력하거나 건너뛰세요.
        </p>
      )}

      {showManual && (
        <div className="mt-2 flex gap-1.5">
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="직접 뜻 입력"
            className="h-7 text-[11px]"
            aria-label="직접 뜻 입력"
          />
          <Button
            variant="default"
            size="sm"
            className="h-7 px-2 text-[10px]"
            onClick={handleManualSubmit}
          >
            확정
          </Button>
        </div>
      )}

      {guidance && (
        <p className="mt-1.5 rounded-md bg-emerald-500/10 px-1.5 py-1 text-[10px] text-emerald-700">
          이후 이 온톨로지에서 {term}={guidance}로 사용
        </p>
      )}
    </>
  );

  const actions = (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 gap-0.5 px-2 text-[10px]"
        onClick={onSkip}
      >
        <SkipForward className="h-3 w-3" />
        건너뛰기
      </Button>
      {onOther && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-0.5 px-2 text-[10px]"
          onClick={onOther}
        >
          <Shuffle className="h-3 w-3" />
          다른 뜻
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-6 gap-0.5 px-2 text-[10px]"
        onClick={() => setShowManual((v) => !v)}
      >
        <Pencil className="h-3 w-3" />
        직접 입력
      </Button>
      <Button
        variant="default"
        size="sm"
        className="h-6 gap-0.5 px-2 text-[10px]"
        onClick={handleConfirm}
        disabled={!hasCandidates}
      >
        <Check className="h-3 w-3" />
        이 뜻으로
      </Button>
    </>
  );

  return (
    <ConfirmCard
      eyebrow="용어 확인"
      title={term}
      evidence={
        <>
          근거 맥락: <span className="italic">{contextInjected}</span>
        </>
      }
      preview={preview}
      actions={actions}
    />
  );
}
