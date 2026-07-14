'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, Plus, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import SpcSeriesWidget from './SpcSeriesWidget';
import WidgetFrame from './WidgetFrame';

interface Widget {
  id: string;
  widgetType: string;
  title: string;
  sourceKind: string;
  sourceRef: { functionId?: string; propertyId?: string };
}
interface Dashboard {
  id: string;
  name: string;
  widgets?: Widget[];
}
interface FnRow {
  id: string;
  name: string;
  implType: string;
}

const SELECT_CLS = 'h-9 w-full rounded-md border border-border bg-background px-2 text-sm';
const WIDGET_TYPES = [
  { v: 'control_chart', l: '관리도(UCL/LCL)' },
  { v: 'trend', l: '추세' },
  { v: 'histogram', l: '분포' },
  { v: 'kpi_card', l: 'KPI 카드' },
  { v: 'anomaly_list', l: '이상치 목록' },
];
const SPC_TYPES = new Set(['control_chart', 'trend', 'histogram']);

// PRD-PF-G M2/M4: 대시보드(모니터링) + 뷰 빌더(그리드+설정패널, 노코드 위젯 조립).
export default function DashboardView() {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [active, setActive] = useState<Dashboard | null>(null);
  const [functions, setFunctions] = useState<FnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const loadActive = useCallback(async (id: string) => {
    const r = await fetch(`/api/dashboards/${id}`);
    if (r.ok) setActive(await r.json());
  }, []);

  const loadList = useCallback(async () => {
    const [d, f] = await Promise.all([
      fetch('/api/dashboards').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/functions').then((r) => (r.ok ? r.json() : [])),
    ]);
    setDashboards(Array.isArray(d) ? d : []);
    setFunctions((Array.isArray(f) ? f : []).filter((x: FnRow) => x.implType === 'spc'));
    if (Array.isArray(d) && d.length > 0) await loadActive(d[0].id);
    setLoading(false);
  }, [loadActive]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const createDashboard = async () => {
    const name = prompt('대시보드 이름');
    if (!name) return;
    const r = await fetch('/api/dashboards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!r.ok) return toast.error('생성 실패');
    const dash = await r.json();
    await loadList();
    await loadActive(dash.id);
  };

  const removeWidget = async (wid: string) => {
    const r = await fetch(`/api/dashboard-widgets/${wid}`, { method: 'DELETE' });
    if (r.ok && active) await loadActive(active.id);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">대시보드</h1>
          <p className="text-sm text-muted-foreground">모니터링 · 준실시간(폴링) · 위젯은 코드 없이 조립</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className={SELECT_CLS + ' w-48'}
            value={active?.id ?? ''}
            onChange={(e) => e.target.value && loadActive(e.target.value)}
          >
            {dashboards.length === 0 && <option value="">대시보드 없음</option>}
            {dashboards.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={createDashboard}>
            <Plus className="mr-1 h-3.5 w-3.5" /> 새 대시보드
          </Button>
        </div>
      </header>

      {!active ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center text-sm text-muted-foreground">
          <LayoutDashboard className="h-8 w-8 opacity-40" />
          대시보드를 만들고 위젯을 조립하세요.
        </Card>
      ) : (
        <>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> 위젯 추가
            </Button>
          </div>
          {(active.widgets ?? []).length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              위젯이 없습니다. 위젯 추가 버튼으로 관리도·KPI·이상치 목록을 5분 안에 붙이세요.
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {(active.widgets ?? []).map((w) => (
                <WidgetRenderer key={w.id} widget={w} onRemove={() => removeWidget(w.id)} />
              ))}
            </div>
          )}
        </>
      )}

      {adding && active && (
        <AddWidgetDialog
          dashboardId={active.id}
          functions={functions}
          onClose={() => setAdding(false)}
          onAdded={async () => {
            setAdding(false);
            await loadActive(active.id);
          }}
        />
      )}
    </div>
  );
}

function WidgetRenderer({ widget, onRemove }: { widget: Widget; onRemove: () => void }) {
  if (SPC_TYPES.has(widget.widgetType)) {
    return (
      <SpcSeriesWidget
        widgetType={widget.widgetType as 'control_chart' | 'trend' | 'histogram'}
        functionId={widget.sourceRef?.functionId}
        propertyId={widget.sourceRef?.propertyId}
        title={widget.title || '관리도'}
        onRemove={onRemove}
      />
    );
  }
  if (widget.widgetType === 'kpi_card') return <KpiWidget title={widget.title || 'KPI'} onRemove={onRemove} />;
  return <AnomalyWidget title={widget.title || '이상치'} onRemove={onRemove} />;
}

function KpiWidget({ title, onRemove }: { title: string; onRemove: () => void }) {
  const [counts, setCounts] = useState({ fail: 0, warn: 0, total: 0 });
  useEffect(() => {
    fetch('/api/action-items?all=1')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { verdict: string }[]) => {
        const fail = rows.filter((x) => x.verdict === 'fail').length;
        const warn = rows.filter((x) => x.verdict === 'warn').length;
        setCounts({ fail, warn, total: rows.length });
      });
  }, []);
  return (
    <WidgetFrame title={title} source="결정함수/SPC 판정 집계" onRemove={onRemove}>
      <div className="flex items-center gap-6 py-6">
        <Kpi label="이상(fail)" value={counts.fail} tone="text-red-600" />
        <Kpi label="주의(warn)" value={counts.warn} tone="text-amber-600" />
        <Kpi label="전체" value={counts.total} tone="text-foreground" />
      </div>
    </WidgetFrame>
  );
}
function Kpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className={`text-2xl font-semibold ${tone}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function AnomalyWidget({ title, onRemove }: { title: string; onRemove: () => void }) {
  const [items, setItems] = useState<{ id: string; verdict: string; score: number | null }[]>([]);
  useEffect(() => {
    fetch('/api/action-items')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setItems(Array.isArray(rows) ? rows.slice(0, 5) : []));
  }, []);
  return (
    <WidgetFrame title={title} source="미처리 이상(액션보드 진입점)" onRemove={onRemove}>
      {items.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">미처리 이상 없음</div>
      ) : (
        <ul className="space-y-1 py-1 text-sm">
          {items.map((it) => (
            <li key={it.id} className="flex items-center justify-between">
              <span className={it.verdict === 'fail' ? 'text-red-600' : 'text-amber-600'}>{it.verdict}</span>
              <span className="text-xs text-muted-foreground">{it.score?.toFixed(2) ?? ''}</span>
            </li>
          ))}
        </ul>
      )}
      <Link href="/action-board" className="mt-1 block text-[11px] text-primary hover:underline">
        액션보드에서 처리 →
      </Link>
    </WidgetFrame>
  );
}

function AddWidgetDialog({
  dashboardId,
  functions,
  onClose,
  onAdded,
}: {
  dashboardId: string;
  functions: FnRow[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [widgetType, setWidgetType] = useState('control_chart');
  const [title, setTitle] = useState('');
  const [functionId, setFunctionId] = useState('');
  const [busy, setBusy] = useState(false);
  const needsFn = SPC_TYPES.has(widgetType);

  const add = async () => {
    if (needsFn && !functionId) {
      toast.error('SPC 함수를 선택하세요.');
      return;
    }
    const sourceKind = needsFn ? 'spc_series' : 'decision_function';
    setBusy(true);
    try {
      const r = await fetch(`/api/dashboards/${dashboardId}/widgets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          widgetType,
          title: title || WIDGET_TYPES.find((t) => t.v === widgetType)?.l,
          sourceKind,
          sourceRef: needsFn ? { functionId } : {},
        }),
      });
      if (!r.ok) {
        toast.error('위젯 추가 실패');
        return;
      }
      onAdded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>위젯 추가</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">유형</Label>
            <select className={SELECT_CLS} value={widgetType} onChange={(e) => setWidgetType(e.target.value)}>
              {WIDGET_TYPES.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">제목</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="선택" />
          </div>
          {needsFn && (
            <div>
              <Label className="text-xs">데이터 소스(SPC 함수)</Label>
              <select className={SELECT_CLS} value={functionId} onChange={(e) => setFunctionId(e.target.value)}>
                <option value="">선택…</option>
                {functions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button onClick={add} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : '추가'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
