'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Check, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { datasetsApi, type DatasetDetail, type ColumnMapping } from '../api';

interface TargetOption {
  value: string; // "class:<id>" | "property:<id>"
  label: string;
}

const TYPE_LABEL: Record<string, string> = {
  string: '문자', integer: '정수', float: '실수', boolean: '불리언',
  date: '날짜', datetime: '일시', enum: '범주', unknown: '미상',
};

// PRD-PF-D M3: 컬럼 프로파일 ↔ 클래스/속성 매핑(HITL, 자동확정 금지). 프로파일을 매핑 판단 근거로 노출.
export default function DatasetMappingView({ datasetId }: { datasetId: string }) {
  const [detail, setDetail] = useState<DatasetDetail | null>(null);
  const [targets, setTargets] = useState<TargetOption[]>([]);
  const [savingCol, setSavingCol] = useState<string | null>(null);

  const load = useCallback(() => {
    datasetsApi.get(datasetId).then(setDetail).catch(() => {});
  }, [datasetId]);

  useEffect(() => {
    load();
    // 매핑 대상: 활성 온톨로지의 클래스 + 속성.
    Promise.all([
      fetch('/api/classes').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/properties').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([cls, props]: [Array<{ id: string; name: string }>, Array<{ id: string; name: string; classId: string }>]) => {
        const clsOpts = (Array.isArray(cls) ? cls : []).map((c) => ({
          value: `class:${c.id}`,
          label: `클래스 · ${c.name}`,
        }));
        const clsName = new Map((Array.isArray(cls) ? cls : []).map((c) => [c.id, c.name]));
        const propOpts = (Array.isArray(props) ? props : []).map((p) => ({
          value: `property:${p.id}`,
          label: `속성 · ${clsName.get(p.classId) ?? '?'}.${p.name}`,
        }));
        setTargets([...clsOpts, ...propOpts]);
      })
      .catch(() => {});
  }, [datasetId, load]);

  function mappingFor(columnId: string): ColumnMapping | undefined {
    return detail?.mappings.find((m) => m.datasetColumnId === columnId);
  }

  async function saveMapping(columnId: string, value: string) {
    if (!value) return;
    const [kind, targetId] = value.split(':');
    setSavingCol(columnId);
    try {
      await datasetsApi.createMapping(datasetId, {
        datasetColumnId: columnId,
        targetType: kind === 'class' ? 'class' : 'property',
        targetClassId: kind === 'class' ? targetId : null,
        targetPropertyId: kind === 'property' ? targetId : null,
        source: 'user',
      });
      toast.success('매핑을 저장했습니다.');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '매핑 저장 실패');
    } finally {
      setSavingCol(null);
    }
  }

  if (!detail) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        정제는 사용자 책임입니다. 결측률·타입을 근거로 컬럼을 클래스/속성에 매핑하세요(자동 확정 없음).
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-2">컬럼</th>
              <th className="text-left font-medium px-3 py-2">프로파일</th>
              <th className="text-left font-medium px-3 py-2">매핑</th>
            </tr>
          </thead>
          <tbody>
            {detail.columns.map((c) => {
              const m = mappingFor(c.id);
              const highMissing = (c.missingRate ?? 0) > 0.3;
              return (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium">{c.name}</div>
                    <Badge variant="outline" className="text-[10px] mt-0.5">{TYPE_LABEL[c.dataType] ?? c.dataType}</Badge>
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                    <div className={highMissing ? 'text-amber-600 flex items-center gap-1' : ''}>
                      {highMissing && <AlertTriangle className="w-3 h-3" />}
                      결측 {Math.round((c.missingRate ?? 0) * 100)}% · 고유 {c.distinctCount ?? '?'}
                    </div>
                    {c.sampleValues.length > 0 && (
                      <div className="truncate max-w-[180px]">예: {c.sampleValues.slice(0, 3).join(', ')}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center gap-1.5">
                      <select
                        value={m ? `${m.targetType}:${m.targetType === 'class' ? m.targetClassId : m.targetPropertyId}` : ''}
                        onChange={(e) => saveMapping(c.id, e.target.value)}
                        disabled={savingCol === c.id}
                        className="h-8 text-xs rounded border border-border bg-background px-2 max-w-[200px]"
                      >
                        <option value="">매핑 안 함</option>
                        {targets.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                      {savingCol === c.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                      ) : m ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
