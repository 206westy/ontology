'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Loader2,
  Boxes,
  Box,
  Link2,
  Unplug,
  CircleDashed,
  Copy,
  ShieldAlert,
  PieChart,
  UploadCloud,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { healthApi, validateApi, type HealthMetrics, type ValidationResult } from '../api';
import MetricCard from './health/MetricCard';
import ViolationList from './health/ViolationList';

export default function HealthDashboardSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const selectNode = useOntologyStore((s) => s.selectNode);
  const focusNode = useOntologyStore((s) => s.focusNode);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([healthApi.get(), validateApi.run()])
      .then(([h, v]) => {
        setMetrics(h.metrics);
        setValidation(v);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : '건강도를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleJump = useCallback(
    (targetId: string, targetTable: string) => {
      if (targetTable === 'classes') selectNode(targetId, 'class');
      else if (targetTable === 'instances') selectNode(targetId, 'instance');
      focusNode(targetId);
      onOpenChange(false);
    },
    [selectNode, focusNode, onOpenChange],
  );

  const errorCount = validation?.summary.errors ?? 0;
  const warningCount = validation?.summary.warnings ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[440px] sm:max-w-[440px] flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <Activity className="w-4 h-4 text-primary" />
            온톨로지 건강도
          </SheetTitle>
          <SheetDescription className="text-[11px]">
            working 그래프의 품질 지표와 검증 위반을 한눈에 확인합니다.
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center justify-end py-2">
          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : '새로고침'}
          </Button>
        </div>

        <ScrollArea className="flex-1 min-h-0 -mx-1 px-1">
          {loading && !metrics ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : metrics ? (
            <div className="space-y-4 pb-4">
              <div className="grid grid-cols-2 gap-2">
                <MetricCard icon={Boxes} label="클래스" value={metrics.classes} />
                <MetricCard icon={Box} label="인스턴스" value={metrics.instances} />
                <MetricCard icon={Link2} label="관계(엣지)" value={metrics.edges} />
                <MetricCard
                  icon={PieChart}
                  label="인스턴스 커버리지"
                  value={`${Math.round(metrics.coverage * 100)}%`}
                  hint="인스턴스를 가진 클래스 비율"
                />
                <MetricCard
                  icon={Unplug}
                  label="고아 노드"
                  value={metrics.orphanNodes}
                  tone={metrics.orphanNodes > 0 ? 'warning' : 'default'}
                />
                <MetricCard
                  icon={CircleDashed}
                  label="빈 클래스"
                  value={metrics.emptyClasses}
                  tone={metrics.emptyClasses > 0 ? 'warning' : 'default'}
                />
                <MetricCard
                  icon={Copy}
                  label="중복 후보"
                  value={metrics.duplicateCandidates}
                  tone={metrics.duplicateCandidates > 0 ? 'warning' : 'default'}
                />
                <MetricCard
                  icon={ShieldAlert}
                  label="검증 위반"
                  value={errorCount + warningCount}
                  tone={errorCount > 0 ? 'danger' : warningCount > 0 ? 'warning' : 'success'}
                  hint={`오류 ${errorCount} · 경고 ${warningCount}`}
                />
                <MetricCard
                  icon={UploadCloud}
                  label="미반영 커밋"
                  value={metrics.unpushedChanges}
                  tone={metrics.unpushedChanges > 0 ? 'warning' : 'success'}
                  hint="Neo4j에 push되지 않은 커밋"
                />
              </div>

              <div>
                <h3 className="text-[11px] font-semibold text-muted-foreground mb-1.5">검증 위반</h3>
                <ViolationList result={validation} onJump={handleJump} />
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-muted-foreground">데이터가 없습니다</div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
