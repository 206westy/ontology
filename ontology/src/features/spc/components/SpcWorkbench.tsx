'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Sparkles, Play, Activity, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

interface ClassRow {
  id: string;
  name: string;
}
interface PropertyRow {
  id: string;
  name: string;
  dataType?: string;
}
interface FunctionRow {
  id: string;
  name: string;
  implType: string;
  logic: Record<string, unknown>;
}
interface Settings {
  spcEnabled: boolean;
  fdcEnabled: boolean;
}

const SELECT_CLS =
  'h-9 w-full rounded-md border border-border bg-background px-2 text-sm';
const SPC_CHARTS = [
  { v: 'i_mr', l: 'I-MR (개별값)' },
  { v: 'xbar_r', l: 'X-bar/R (부분군)' },
];
const FDC_METHODS = [
  { v: 'threshold', l: '임계값' },
  { v: 'trend', l: '트렌드(급변·드리프트)' },
];
const VERDICT_TONE: Record<string, string> = {
  pass: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  warn: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  fail: 'bg-red-500/10 text-red-600 border-red-500/30',
};

// PRD-PF-F: SPC/FDC 워크벤치 — 모듈 토글 + 통계엔진 호출형 함수 저작(초안·HITL) + 판정 실행.
// ★경계★: 통계는 엔진(lib/spc·lib/fdc)이 계산, 온톨로지는 조직·근거. 준실시간(배치 단위).
export default function SpcWorkbench() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [functions, setFunctions] = useState<FunctionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFunctions = useCallback(async () => {
    const r = await fetch('/api/functions');
    if (!r.ok) return;
    const rows: FunctionRow[] = await r.json();
    setFunctions(rows.filter((f) => f.implType === 'spc' || f.implType === 'fdc'));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [s, c, p] = await Promise.all([
          fetch('/api/workspace-settings').then((r) => (r.ok ? r.json() : { spcEnabled: false, fdcEnabled: false })),
          fetch('/api/classes').then((r) => (r.ok ? r.json() : [])),
          fetch('/api/properties').then((r) => (r.ok ? r.json() : [])),
        ]);
        setSettings(s);
        setClasses(Array.isArray(c) ? c : []);
        setProperties(Array.isArray(p) ? p : []);
        await loadFunctions();
      } finally {
        setLoading(false);
      }
    })();
  }, [loadFunctions]);

  const toggle = async (key: 'spcEnabled' | 'fdcEnabled') => {
    if (!settings) return;
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    const r = await fetch('/api/workspace-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: next[key] }),
    });
    if (!r.ok) {
      setSettings(settings);
      toast.error('모듈 전환 실패');
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">SPC / FDC 공정 스펙관리</h1>
        <p className="text-sm text-muted-foreground">
          통계 판정은 엔진이 계산하고, 온톨로지는 규칙·근거를 조직합니다. 모든 판정은{' '}
          <span className="font-medium text-foreground">준실시간(배치/로트 단위)</span>이며 실시간이 아닙니다.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <ModuleToggle
          icon={<Gauge className="h-4 w-4" />}
          label="SPC (제품 측정값)"
          on={settings?.spcEnabled ?? false}
          onToggle={() => toggle('spcEnabled')}
        />
        <ModuleToggle
          icon={<Activity className="h-4 w-4" />}
          label="FDC (설비 센서)"
          on={settings?.fdcEnabled ?? false}
          onToggle={() => toggle('fdcEnabled')}
        />
      </div>

      {!settings?.spcEnabled && !settings?.fdcEnabled && (
        <Card className="p-6 text-sm text-muted-foreground">
          모듈이 꺼져 있습니다. 공정 데이터가 있는 워크스페이스라면 SPC(제품 측정값) 또는 FDC(설비 센서)를 켜세요.
          텍스트/ERP 중심 워크스페이스는 꺼진 채로 기존 기능(Text2Cypher·RAG)을 그대로 사용합니다.
        </Card>
      )}

      {settings?.spcEnabled && (
        <StatFunctionForm
          mode="spc"
          classes={classes}
          properties={properties}
          onCreated={loadFunctions}
        />
      )}
      {settings?.fdcEnabled && (
        <StatFunctionForm
          mode="fdc"
          classes={classes}
          properties={properties}
          onCreated={loadFunctions}
        />
      )}

      {functions.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">등록된 판정 함수</h2>
          {functions.map((f) => (
            <FunctionRunCard key={f.id} fn={f} />
          ))}
        </section>
      )}
    </div>
  );
}

function ModuleToggle({
  icon,
  label,
  on,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
        on ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground'
      }`}
    >
      {icon}
      {label}
      <Badge variant={on ? 'default' : 'outline'} className="text-[10px]">
        {on ? 'ON' : 'OFF'}
      </Badge>
    </button>
  );
}

function StatFunctionForm({
  mode,
  classes,
  properties,
  onCreated,
}: {
  mode: 'spc' | 'fdc';
  classes: ClassRow[];
  properties: PropertyRow[];
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [targetClassId, setTargetClassId] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [chartType, setChartType] = useState('i_mr');
  const [subgroupSize, setSubgroupSize] = useState(5);
  const [method, setMethod] = useState('threshold');
  const [upper, setUpper] = useState('');
  const [lower, setLower] = useState('');
  const [rationale, setRationale] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const suggest = async () => {
    const prop = properties.find((p) => p.id === propertyId);
    const r = await fetch('/api/llm/spc-suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: prop?.name, dataType: prop?.dataType }),
    });
    if (!r.ok) return;
    const { suggestion } = await r.json();
    if (suggestion?.chartType === 'i_mr' || suggestion?.chartType === 'xbar_r') {
      setChartType(suggestion.chartType);
    }
    setRationale(suggestion?.rationale ?? null);
  };

  const create = async () => {
    if (!name || !targetClassId || !propertyId) {
      toast.error('이름·대상 클래스·속성을 선택하세요.');
      return;
    }
    const logic =
      mode === 'spc'
        ? { kind: 'spc', propertyId, chartType, ...(chartType === 'xbar_r' ? { subgroupSize } : {}) }
        : {
            kind: 'fdc',
            sensorPropertyId: propertyId,
            method,
            params: {
              upper: upper === '' ? null : Number(upper),
              lower: lower === '' ? null : Number(lower),
            },
          };
    setSaving(true);
    try {
      const r = await fetch('/api/functions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, implType: mode, targetClassId, logic }),
      });
      if (!r.ok) {
        toast.error('함수 생성 실패');
        return;
      }
      toast.success(`${mode.toUpperCase()} 함수 생성(초안)`);
      setName('');
      setRationale(null);
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        {mode === 'spc' ? <Gauge className="h-4 w-4 text-primary" /> : <Activity className="h-4 w-4 text-primary" />}
        새 {mode === 'spc' ? 'SPC(관리도)' : 'FDC(센서 이상탐지)'} 함수
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs">함수 이름</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 두께 관리도" />
        </div>
        <div>
          <Label className="text-xs">대상 클래스</Label>
          <select className={SELECT_CLS} value={targetClassId} onChange={(e) => setTargetClassId(e.target.value)}>
            <option value="">선택…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">{mode === 'spc' ? '공정변수(속성)' : '센서(속성)'}</Label>
          <select className={SELECT_CLS} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
            <option value="">선택…</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {mode === 'spc' ? (
          <>
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">관리도</Label>
                <Button type="button" variant="ghost" size="sm" className="h-5 gap-1 text-[11px]" onClick={suggest}>
                  <Sparkles className="h-3 w-3" /> AI 추천
                </Button>
              </div>
              <select className={SELECT_CLS} value={chartType} onChange={(e) => setChartType(e.target.value)}>
                {SPC_CHARTS.map((c) => (
                  <option key={c.v} value={c.v}>
                    {c.l}
                  </option>
                ))}
              </select>
            </div>
            {chartType === 'xbar_r' && (
              <div>
                <Label className="text-xs">부분군 크기</Label>
                <Input
                  type="number"
                  min={2}
                  max={10}
                  value={subgroupSize}
                  onChange={(e) => setSubgroupSize(Number(e.target.value))}
                />
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <Label className="text-xs">탐지 방식</Label>
              <select className={SELECT_CLS} value={method} onChange={(e) => setMethod(e.target.value)}>
                {FDC_METHODS.map((m) => (
                  <option key={m.v} value={m.v}>
                    {m.l}
                  </option>
                ))}
              </select>
            </div>
            {method === 'threshold' && (
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="상한" value={upper} onChange={(e) => setUpper(e.target.value)} />
                <Input placeholder="하한" value={lower} onChange={(e) => setLower(e.target.value)} />
              </div>
            )}
          </>
        )}
      </div>
      {rationale && (
        <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" /> 초안: {rationale} <span className="text-[10px]">(확정은 아래 생성)</span>
        </div>
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={create} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '함수 생성(초안)'}
        </Button>
      </div>
    </Card>
  );
}

interface RunResult {
  kind?: string;
  verdict?: string;
  faultFlag?: boolean;
  violatedRuleSummary?: string[];
  capability?: { cp: number | null; cpk: number | null } | null;
  evaluated?: number;
  note?: string;
}

function FunctionRunCard({ fn }: { fn: FunctionRow }) {
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      const r = await fetch(`/api/functions/${fn.id}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persist: true }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data?.error ?? '판정 실행 실패');
        return;
      }
      setResult(data);
    } finally {
      setRunning(false);
    }
  };

  const verdict = result?.verdict ?? (result?.faultFlag != null ? (result.faultFlag ? 'fail' : 'pass') : null);

  return (
    <Card className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="truncate font-medium">{fn.name}</span>
          <Badge variant="outline" className="text-[10px] uppercase">
            {fn.implType}
          </Badge>
        </div>
        {result && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {verdict && (
              <span className={`rounded border px-1.5 py-0.5 ${VERDICT_TONE[verdict] ?? ''}`}>{verdict}</span>
            )}
            {result.note && <span>{result.note}</span>}
            {result.violatedRuleSummary && result.violatedRuleSummary.length > 0 && (
              <span>위반: {result.violatedRuleSummary.join(', ')}</span>
            )}
            {result.capability?.cpk != null && <span>Cpk {result.capability.cpk.toFixed(2)}</span>}
            {result.evaluated != null && <span>· {result.evaluated}건</span>}
            <span className="text-[10px]">· 준실시간(배치) · 통계=엔진</span>
          </div>
        )}
      </div>
      <Button size="sm" variant="secondary" onClick={run} disabled={running}>
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Play className="mr-1 h-3.5 w-3.5" /> 판정</>}
      </Button>
    </Card>
  );
}
