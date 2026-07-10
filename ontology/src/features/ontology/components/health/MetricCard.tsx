'use client';

import type { LucideIcon } from 'lucide-react';

export default function MetricCard({
  icon: Icon,
  label,
  value,
  tone = 'default',
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: 'default' | 'warning' | 'danger' | 'success';
  hint?: string;
}) {
  const toneClass =
    tone === 'warning'
      ? 'text-warning'
      : tone === 'danger'
        ? 'text-destructive'
        : tone === 'success'
          ? 'text-success'
          : 'text-foreground';

  return (
    <div className="rounded-md border border-border bg-card p-2.5 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {hint && <p className="text-xs text-muted-foreground/70">{hint}</p>}
    </div>
  );
}
