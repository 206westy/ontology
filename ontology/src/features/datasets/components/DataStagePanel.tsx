'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Database, Upload, Loader2, Table2, Link2, ChevronRight, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { datasetsApi, type DatasetListItem, type ProblemDatasetLink } from '../api';
import DatasetMappingView from './DatasetMappingView';

interface Props {
  problemId: string;
}

// PRD-PF-D M4: 데이터 연결 단계. CSV 등록 → 여러 문제가 재사용. 재파싱 제거·provenance 추적.
export default function DataStagePanel({ problemId }: Props) {
  const [connected, setConnected] = useState<ProblemDatasetLink[]>([]);
  const [registry, setRegistry] = useState<DatasetListItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const refreshRef = useRef<HTMLInputElement>(null);
  const refreshTargetRef = useRef<string | null>(null);

  const refresh = useCallback(() => {
    datasetsApi.listForProblem(problemId).then(setConnected).catch(() => {});
    datasetsApi.list().then(setRegistry).catch(() => {});
  }, [problemId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const csvText = await file.text();
      const name = file.name.replace(/\.csv$/i, '');
      const ds = await datasetsApi.registerCsv({ name, csvText });
      await datasetsApi.attachToProblem(problemId, { datasetId: ds.id, role: 'primary' });
      toast.success(`"${ds.name}" 등록·연결 (${ds.columnCount}컬럼 · ${ds.rowCount ?? 0}행)`);
      setSelected(ds.id);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '업로드 실패');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function attach(datasetId: string) {
    try {
      await datasetsApi.attachToProblem(problemId, { datasetId, role: 'reference' });
      toast.success('데이터셋을 연결했습니다(재파싱 없음).');
      setSelected(datasetId);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '연결 실패');
    }
  }

  function startRefresh(datasetId: string) {
    refreshTargetRef.current = datasetId;
    refreshRef.current?.click();
  }

  async function onRefreshFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const datasetId = refreshTargetRef.current;
    if (!file || !datasetId) return;
    setRefreshingId(datasetId);
    try {
      const csvText = await file.text();
      const res = await datasetsApi.refresh(datasetId, csvText);
      if (res.drifted) {
        const diff = [
          res.addedColumns.length ? `+${res.addedColumns.join(', ')}` : '',
          res.removedColumns.length ? `-${res.removedColumns.join(', ')}` : '',
        ].filter(Boolean).join(' / ');
        toast.warning(`원본이 변경됐습니다(재검토 필요). ${diff}`);
      } else {
        toast.success('원본이 동일합니다(드리프트 없음).');
      }
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '재검사 실패');
    } finally {
      setRefreshingId(null);
      refreshTargetRef.current = null;
      if (refreshRef.current) refreshRef.current.value = '';
    }
  }

  const connectedIds = new Set(connected.map((c) => c.datasetId));
  const reusable = registry.filter((d) => !connectedIds.has(d.id));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Database className="w-4 h-4 text-primary" /> 데이터 연결
        </div>
        <div className="flex items-center gap-1.5">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
          <input ref={refreshRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onRefreshFile} />
          <Button size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            CSV 업로드
          </Button>
          {/* PRD-PF-D M2: 읽기전용 DB뷰/parquet 커넥터는 후속(1차 범위 = CSV 레지스트리). */}
          <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" disabled title="읽기전용 DB뷰·parquet 커넥터는 준비 중입니다">
            DB뷰·parquet (준비 중)
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        정제된 CSV 를 한 번 등록하면 여러 문제가 재사용합니다. 무거운 ETL·실시간 동기화는 지원하지 않습니다.
      </p>

      {/* 연결된 데이터셋 */}
      <div className="space-y-2">
        <div className="text-sm font-medium">연결된 데이터셋 ({connected.length})</div>
        {connected.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
            아직 연결된 데이터셋이 없습니다. CSV 를 업로드하거나 아래에서 재사용하세요.
          </div>
        ) : (
          connected.map((c) => (
            <div key={c.id} className="rounded-lg border border-border">
              <div
                role="button"
                tabIndex={0}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40 cursor-pointer"
                onClick={() => setSelected(selected === c.datasetId ? null : c.datasetId)}
              >
                <Table2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate">{c.datasetName}</span>
                <Badge variant="secondary" className="text-[10px]">{c.role === 'primary' ? '주' : '참조'}</Badge>
                {c.status && c.status !== 'ready' && (
                  <Badge variant="outline" className="text-[10px] gap-1 border-amber-500 text-amber-600">
                    <AlertTriangle className="w-3 h-3" /> 재검토
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground ml-auto">{c.rowCount ?? 0}행</span>
                <button
                  type="button"
                  className="p-1 rounded hover:bg-muted text-muted-foreground"
                  title="원본 재업로드로 드리프트 검사"
                  onClick={(e) => { e.stopPropagation(); startRefresh(c.datasetId); }}
                >
                  {refreshingId === c.datasetId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                </button>
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${selected === c.datasetId ? 'rotate-90' : ''}`} />
              </div>
              {c.status === 'stale' && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50/60 dark:bg-amber-950/10 text-xs text-amber-700 dark:text-amber-500 border-t border-amber-500/20">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  원본이 변경됐습니다. 컬럼·매핑을 재확인하세요(자동 재매핑 없음).
                </div>
              )}
              {selected === c.datasetId && (
                <div className="border-t border-border p-3">
                  <DatasetMappingView datasetId={c.datasetId} />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 재사용: 기존 데이터셋에서 선택 */}
      {reusable.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium">기존 데이터셋에서 선택 (재사용)</div>
          {reusable.map((d) => (
            <div key={d.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <Database className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm truncate">{d.name}</span>
              <span className="text-xs text-muted-foreground">{d.columnCount}컬럼 · {d.rowCount ?? 0}행</span>
              <Button size="sm" variant="outline" className="h-7 gap-1 ml-auto" onClick={() => attach(d.id)}>
                <Link2 className="w-3.5 h-3.5" /> 연결
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
