'use client';

import { useDeferredValue, useMemo } from 'react';
import { Gauge } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { computeHealth } from '../lib/metrics/health';

// S5 — 상시 모델 헬스 점수 배지. S0 computeHealth를 store에서 라이브로 계산해
// 툴바에 항상 노출한다. 입력/편집으로 모델이 바뀌면 점수가 즉시 갱신되므로
// "입력 전후 델타"가 눈에 보인다. 클릭 시 건강도 대시보드를 연다.

function scoreColor(score: number): string {
  if (score >= 80) return 'border-emerald-400 text-emerald-600';
  if (score >= 50) return 'border-amber-400 text-amber-600';
  return 'border-red-400 text-red-600';
}

export default function HealthScoreBadge() {
  // PRD-Perf M1-3: 전체 그래프 순회가 편집/드래그 프레임을 막지 않도록
  // 입력을 지연값으로 — 값은 동일하고 갱신만 유휴 시점으로 미뤄진다.
  const classes = useDeferredValue(useOntologyStore((s) => s.classes));
  const instances = useDeferredValue(useOntologyStore((s) => s.instances));
  const edges = useDeferredValue(useOntologyStore((s) => s.edges));

  const report = useMemo(
    () => computeHealth({ classes, instances, edges }),
    [classes, instances, edges],
  );

  // 빈 모델에서는 점수가 의미 없으므로 숨긴다.
  if (report.nodeCount === 0) return null;

  const open = () => window.dispatchEvent(new Event('ontology:health'));
  const pct = (n: number) => Math.round(n * 100);

  return (
    <button
      type="button"
      onClick={open}
      title={`구조 건강도 ${report.score}/100 · 별모양 ${pct(report.starIndex)}% · 고립 ${pct(
        report.isolationRate,
      )}% · 출처 ${pct(report.provenanceCoverage)}%`}
      aria-label={`구조 건강도 ${report.score}점, 클릭하면 건강도 대시보드 열림`}
    >
      <Badge
        variant="outline"
        className={`h-6 text-[11px] px-1.5 gap-1 tabular-nums ${scoreColor(report.score)}`}
      >
        <Gauge className="w-3 h-3" />
        {report.score}
      </Badge>
    </button>
  );
}
