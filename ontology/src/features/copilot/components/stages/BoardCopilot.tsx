'use client';

import { useEffect, useState } from 'react';
import { LayoutDashboard, ListChecks, Gauge, Sparkles } from 'lucide-react';
import { functionsApi, type DecisionFunction } from '@/features/functions/api';

// 출력형태 → 뷰 매핑(결정론 룰, PF-G 로 이관 여지). 판정→액션보드, 점수→KPI, 추천→리스트.
const VIEW_RULE: Record<string, { view: string; icon: React.ComponentType<{ className?: string }>; why: string }> = {
  pass_fail: { view: '액션보드 / 알림 카드', icon: ListChecks, why: '불통과 대상을 처리 큐로' },
  score: { view: 'KPI · 게이지', icon: Gauge, why: '점수 추이·분포를 지표로' },
  recommend: { view: '추천 리스트', icon: Sparkles, why: '추천 라벨을 우선순위 목록으로' },
};

// PRD-PF-E M6: 보드 코파일럿(얇은 룰). 확정 결정함수의 출력형태로 뷰를 제안.
export default function BoardCopilot() {
  const [fns, setFns] = useState<DecisionFunction[] | null>(null);

  useEffect(() => {
    functionsApi.list().then(setFns).catch(() => setFns([]));
  }, []);

  const confirmed = (fns ?? []).filter((f) => f.status === 'confirmed');

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        확정된 결정함수의 출력형태에 맞는 보드 뷰를 제안합니다(실제 차트 빌더는 PF-G).
      </div>
      {fns === null ? null : confirmed.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          확정된 결정함수가 없습니다. 키네틱 단계에서 함수를 먼저 확정하세요.
        </div>
      ) : (
        confirmed.map((f) => {
          const kind = (f.outputSpec as { kind?: string })?.kind ?? 'pass_fail';
          const rule = VIEW_RULE[kind] ?? VIEW_RULE.pass_fail;
          const Icon = rule.icon;
          return (
            <div key={f.id} className="flex items-start gap-2 rounded-lg border border-border p-3">
              <LayoutDashboard className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="space-y-0.5 min-w-0">
                <div className="text-sm font-medium truncate">{f.name}</div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Icon className="w-3.5 h-3.5 text-primary" />
                  <span className="font-medium">{rule.view}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">근거: {kind} → {rule.why}</div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
