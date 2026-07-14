'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import {
  buildControlChartOption,
  buildTrendOption,
  buildHistogramOption,
} from '@/lib/boards/build-option';
import { readPalette } from '@/lib/charts/echarts-theme';
import WidgetFrame from './WidgetFrame';

// ECharts 지연 로딩(ssr:false) → 메인 캔버스 번들 영향 0(PRD-PF-G §2 지표).
const EChart = dynamic(() => import('./EChart'), {
  ssr: false,
  loading: () => <Skeleton className="h-[240px] w-full" />,
});

interface SpcPoint {
  label: string;
  value: number;
  verdict: 'pass' | 'warn' | 'fail';
}
interface SpcSeries {
  points: SpcPoint[];
  ucl: number | null;
  lcl: number | null;
  centerline: number | null;
  chartType: string | null;
}

interface Props {
  widgetType: 'control_chart' | 'trend' | 'histogram';
  functionId?: string;
  propertyId?: string;
  title: string;
  onRemove?: () => void;
}

// PRD-PF-G: SPC 판정 시계열 위젯(관리도=UCL/LCL·이상점, 추세=선, 분포=히스토그램). spc_runs 소비.
export default function SpcSeriesWidget({ widgetType, functionId, propertyId, title, onRemove }: Props) {
  const [data, setData] = useState<SpcSeries | null>(null);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    const qs = functionId ? `functionId=${functionId}` : propertyId ? `propertyId=${propertyId}` : '';
    if (!qs) return;
    fetch(`/api/spc-runs?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: SpcSeries | null) => {
        setData(d);
        setEmpty(!d || d.points.length === 0);
      });
  }, [functionId, propertyId]);

  const option = useMemo(() => {
    if (!data || data.points.length === 0) return null;
    const p = readPalette();
    if (widgetType === 'trend') {
      return buildTrendOption({ points: data.points.map((pt) => ({ label: pt.label, value: pt.value })) }, p);
    }
    if (widgetType === 'histogram') {
      return buildHistogramOption({ values: data.points.map((pt) => pt.value) }, p);
    }
    return buildControlChartOption(
      { points: data.points, ucl: data.ucl, lcl: data.lcl, centerline: data.centerline },
      p,
    );
  }, [data, widgetType]);

  const source = `SPC 판정(${data?.chartType ?? '—'}) · 준실시간(배치)`;

  return (
    <WidgetFrame title={title} source={source} onRemove={onRemove}>
      {empty ? (
        <div className="flex h-[240px] items-center justify-center text-xs text-muted-foreground">
          아직 판정 데이터가 없습니다. SPC 함수를 실행하면 채워집니다.
        </div>
      ) : option ? (
        <EChart option={option} ariaLabel={`${title} ${widgetType}`} />
      ) : (
        <Skeleton className="h-[240px] w-full" />
      )}
    </WidgetFrame>
  );
}
