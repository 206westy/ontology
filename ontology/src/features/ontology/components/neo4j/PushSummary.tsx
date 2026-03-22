'use client';

import { Badge } from '@/components/ui/badge';
import type { Change } from '../../lib/types';

export interface PushSummaryData {
  classes: { add: number; mod: number; del: number };
  relations: { add: number; mod: number; del: number };
  instances: { add: number; mod: number; del: number };
  properties: { add: number; mod: number; del: number };
  edges: { add: number; mod: number; del: number };
}

export function computePushSummary(changes: Change[]): PushSummaryData {
  const tables = ['classes', 'relations', 'instances', 'properties', 'edges'] as const;
  const summary = {} as PushSummaryData;

  for (const table of tables) {
    const tableChanges = changes.filter((c) => {
      const t = c.targetTable.toLowerCase();
      if (table === 'relations') return t === 'relation_types' || t === 'relations';
      return t === table;
    });
    summary[table] = {
      add: tableChanges.filter((c) => c.operation === 'ADD').length,
      mod: tableChanges.filter((c) => c.operation === 'MOD').length,
      del: tableChanges.filter((c) => c.operation === 'DEL').length,
    };
  }

  return summary;
}

const OP_COLORS = {
  add: 'text-emerald-600 dark:text-emerald-400',
  mod: 'text-amber-600 dark:text-amber-400',
  del: 'text-red-600 dark:text-red-400',
} as const;

const TABLE_LABELS: Record<string, string> = {
  classes: '클래스',
  relations: '관계',
  instances: '인스턴스',
  properties: '프로퍼티',
  edges: '엣지',
};

interface PushSummaryProps {
  summary: PushSummaryData;
}

export default function PushSummary({ summary }: PushSummaryProps) {
  const entries = Object.entries(summary) as [keyof PushSummaryData, { add: number; mod: number; del: number }][];
  const activeEntries = entries.filter(([, v]) => v.add + v.mod + v.del > 0);

  if (activeEntries.length === 0) {
    return (
      <div className="text-xs text-muted-foreground text-center py-3">
        변경사항이 없습니다
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        변경 요약
      </h4>
      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
        {activeEntries.map(([table, counts]) => (
          <div key={table} className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground w-16 shrink-0">{TABLE_LABELS[table]}</span>
            <div className="flex items-center gap-2 font-mono text-[11px]">
              {counts.add > 0 && (
                <span className={OP_COLORS.add}>+{counts.add}</span>
              )}
              {counts.mod > 0 && (
                <span className={OP_COLORS.mod}>~{counts.mod}</span>
              )}
              {counts.del > 0 && (
                <span className={OP_COLORS.del}>-{counts.del}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
