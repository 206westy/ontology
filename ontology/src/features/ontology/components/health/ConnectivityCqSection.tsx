'use client';

import { Split, CheckCircle2, HelpCircle, XCircle, CircleCheck } from 'lucide-react';
import type { ConnectivityReport } from '../../lib/validate/connectivity';
import type { CqPassRate } from '../../lib/validate/cq';

// PRD-H (H7/M5): 검수에 연결성 경고 + CQ 통과율을 얹는 표시 컴포넌트(순수 프레젠테이션).
// 기존 건강도 시트에 additive 로 붙는다 — 재구축 아님.
interface ConnectivityCqSectionProps {
  connectivity: ConnectivityReport;
  cq: CqPassRate | null;
}

export default function ConnectivityCqSection({
  connectivity,
  cq,
}: ConnectivityCqSectionProps) {
  return (
    <div className="space-y-3">
      {/* 연결성(도달성) */}
      <div>
        <h3 className="mb-1.5 text-[11px] font-semibold text-muted-foreground">
          연결성
        </h3>
        {connectivity.isConnected ? (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>
              단일 연결 그래프입니다
              {connectivity.nodeCount > 0 && ` (노드 ${connectivity.nodeCount}개)`}.
            </span>
          </div>
        ) : (
          <div
            className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400"
            data-testid="connectivity-warning"
          >
            <Split className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{connectivity.warning}</span>
          </div>
        )}
      </div>

      {/* CQ 통과율 */}
      {cq && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold text-muted-foreground">
              CQ 통과율
            </h3>
            <span
              className="flex items-center gap-1 text-[11px] font-medium text-foreground"
              data-testid="cq-pass-rate"
            >
              <CircleCheck className="h-3.5 w-3.5 text-primary" />
              CQ {cq.label}
            </span>
          </div>
          <ul className="space-y-1">
            {cq.results.map((r, i) => (
              <li
                key={`${r.cq}-${i}`}
                className="flex items-start gap-1.5 text-[10px] text-muted-foreground"
              >
                {r.passed ? (
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                )}
                <span className={r.passed ? '' : 'text-amber-700 dark:text-amber-400'}>
                  {r.cq}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!cq && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
          <HelpCircle className="h-3 w-3" />
          패턴으로 생성하면 CQ 통과율이 표시됩니다.
        </div>
      )}
    </div>
  );
}
