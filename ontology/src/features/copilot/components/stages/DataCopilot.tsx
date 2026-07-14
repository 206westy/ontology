'use client';

import { useState } from 'react';
import { Sparkles, Loader2, CircleCheck, CircleX, HelpCircle, ArrowDownToLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { copilotApi, type SufficiencyReport } from '../../api';

const VERDICT_META: Record<string, { badge: 'default' | 'secondary' | 'outline'; className: string; label: string }> = {
  충분: { badge: 'default', className: 'bg-emerald-600', label: '충분' },
  부족: { badge: 'outline', className: 'border-amber-500 text-amber-600', label: '부족' },
  모름: { badge: 'secondary', className: '', label: '모름' },
};

// PRD-PF-E M3(핵심): 데이터 충분성 진단. 결정론 룰 우선 + LLM 의미매칭. 근거 없으면 '모름'.
export default function DataCopilot({ problemId }: { problemId: string }) {
  const [report, setReport] = useState<SufficiencyReport | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      setReport(await copilotApi.sufficiency(problemId));
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  const meta = report ? VERDICT_META[report.verdict] : null;

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        연결된 데이터가 이 문제를 풀기에 충분한지 진단합니다(도메인 필수 컬럼 대비).
      </div>
      <Button size="sm" className="w-full gap-1.5" onClick={run} disabled={loading}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        충분성 분석
      </Button>

      {report && meta && (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <div className="text-xs text-muted-foreground">유형: {report.problemType}</div>
              <div className="text-2xl font-semibold">{report.score}<span className="text-sm text-muted-foreground">/100</span></div>
            </div>
            <Badge variant={meta.badge} className={meta.className}>{meta.label}</Badge>
          </div>

          {report.verdict === '모름' ? (
            <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground flex items-start gap-2">
              <HelpCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">{report.evidence.map((e, i) => <div key={i}>{e}</div>)}</div>
            </div>
          ) : (
            <>
              {/* 필수 컬럼 체크 */}
              <div className="space-y-1">
                <div className="text-xs font-medium">필수 컬럼</div>
                {report.requiredColumns.map((r) => (
                  <div key={r.role} className="flex items-center gap-2 text-xs">
                    {r.present ? (
                      <CircleCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <CircleX className="w-3.5 h-3.5 text-destructive shrink-0" />
                    )}
                    <span>{r.role}</span>
                    {r.matchedTo && <span className="text-muted-foreground truncate">← {r.matchedTo}</span>}
                  </div>
                ))}
              </div>

              {/* 결측 추천 */}
              {report.missing.length > 0 && (
                <div className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/10 p-3">
                  <div className="text-xs font-medium text-amber-700 dark:text-amber-500">결측 데이터 추천</div>
                  {report.missing.map((m) => (
                    <div key={m.what} className="text-xs space-y-0.5">
                      <div className="flex items-center gap-1 font-medium">
                        <ArrowDownToLine className="w-3 h-3" /> {m.what}
                      </div>
                      <div className="text-muted-foreground pl-4">{m.why} · {m.howToGet}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* 근거(provenance) 상시 노출 */}
          {report.evidence.length > 0 && report.verdict !== '모름' && (
            <div className="text-[11px] text-muted-foreground border-t border-border pt-2">
              <div className="font-medium mb-0.5">근거</div>
              {report.evidence.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
