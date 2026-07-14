'use client';

import { useEffect, useRef } from 'react';
import { echarts } from '@/lib/charts/echarts-core';

interface Props {
  option: Record<string, unknown>;
  height?: number;
  className?: string;
  ariaLabel?: string;
}

// PRD-PF-G: ECharts Canvas 래퍼. init/dispose·ResizeObserver·테마 재적용. 접근성: role=img+요약 라벨.
export default function EChart({ option, height = 240, className, ariaLabel }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, null, { renderer: 'canvas' });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ width: '100%', height }}
      role="img"
      aria-label={ariaLabel ?? '차트'}
    />
  );
}
