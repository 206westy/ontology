'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw, ExternalLink, ShieldCheck, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useOntologyStore } from '@/features/ontology/store';

interface ActionItem {
  id: string;
  verdict: 'fail' | 'warn' | 'pass';
  score: number | null;
  status: string;
  subjectInstanceId: string | null;
  sourceFunctionId: string | null;
  evidence: Record<string, unknown>;
  createdAt: string;
}

const VERDICT_TONE: Record<string, string> = {
  fail: 'border-red-500/40 bg-red-500/5 text-red-600',
  warn: 'border-amber-500/40 bg-amber-500/5 text-amber-600',
  pass: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-600',
};
const POLL_MS = 30_000;

// PRD-PF-G M3: 액션보드(처리 큐). 기본=미처리 이상만. HITL 확정/기각(행위자+사유 강제)·일괄·근거·하이라이트.
export default function ActionBoard() {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{ mode: 'confirm' | 'dismiss'; ids: string[] } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const highlightNodes = useOntologyStore((s) => s.highlightNodes);

  const load = useCallback(async () => {
    const r = await fetch(`/api/action-items${showAll ? '?all=1' : ''}`);
    if (r.ok) setItems(await r.json());
    setLoading(false);
  }, [showAll]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const toggleSel = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openBulk = (mode: 'confirm' | 'dismiss') => {
    if (selected.size === 0) return;
    setNote('');
    setDialog({ mode, ids: [...selected] });
  };
  const openSingle = (mode: 'confirm' | 'dismiss', id: string) => {
    setNote('');
    setDialog({ mode, ids: [id] });
  };

  const submit = async () => {
    if (!dialog) return;
    if (note.trim() === '') {
      toast.error('사유를 입력하세요(감사추적 필수).');
      return;
    }
    setBusy(true);
    try {
      if (dialog.ids.length === 1) {
        const r = await fetch(`/api/action-items/${dialog.ids[0]}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: dialog.mode === 'confirm' ? 'confirmed' : 'dismissed',
            resolutionNote: note,
          }),
        });
        if (!r.ok) {
          toast.error((await r.json())?.error ?? '전이 실패');
          return;
        }
      } else {
        const r = await fetch('/api/action-items/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: dialog.ids, action: dialog.mode, note }),
        });
        if (!r.ok) {
          toast.error('일괄 처리 실패');
          return;
        }
        const res = await r.json();
        toast.success(`${res.updated}건 처리${res.skipped ? `, ${res.skipped}건 제외` : ''}`);
      }
      setDialog(null);
      setSelected(new Set());
      await load();
    } finally {
      setBusy(false);
    }
  };

  const highlight = (instanceId: string | null) => {
    if (!instanceId) return;
    highlightNodes([instanceId]);
    toast.info('스튜디오 캔버스에서 하이라이트됩니다.');
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">액션보드</h1>
          <p className="text-sm text-muted-foreground">
            처리 큐 · 기본 = 미처리 이상만 · 준실시간(폴링 30초) · 확정은 사람(HITL)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? '이상만 보기' : '전체 보기'}
          </Button>
          <Button variant="ghost" size="icon" onClick={load} aria-label="새로고침">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          <span>{selected.size}건 선택</span>
          <Button size="sm" onClick={() => openBulk('confirm')}>
            <ShieldCheck className="mr-1 h-3.5 w-3.5" /> 일괄 확정
          </Button>
          <Button size="sm" variant="outline" onClick={() => openBulk('dismiss')}>
            <ShieldX className="mr-1 h-3.5 w-3.5" /> 일괄 기각
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          처리할 이상 항목이 없습니다. 결정함수·SPC 판정이 이상을 내면 여기로 올라옵니다.
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const resolved = it.status === 'confirmed' || it.status === 'dismissed';
            return (
              <Card
                key={it.id}
                className={`flex items-start gap-3 p-3 ${resolved ? 'opacity-70' : ''}`}
                style={{ borderStyle: resolved ? 'solid' : 'dashed' }}
              >
                {!resolved && (
                  <Checkbox
                    checked={selected.has(it.id)}
                    onCheckedChange={() => toggleSel(it.id)}
                    className="mt-1"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={`rounded border px-1.5 py-0.5 text-xs ${VERDICT_TONE[it.verdict]}`}>
                      {it.verdict}
                    </span>
                    <Badge variant="outline" className="text-[10px]">{it.status}</Badge>
                    {it.score != null && <span className="text-xs text-muted-foreground">score {it.score.toFixed(2)}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {/* 근거경로(필수 표기) */}
                    <span>근거: {summarizeEvidence(it.evidence)}</span>
                    {it.subjectInstanceId && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-0.5 text-primary hover:underline"
                        onClick={() => highlight(it.subjectInstanceId)}
                      >
                        대상 하이라이트 <ExternalLink className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                {!resolved && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="secondary" onClick={() => openSingle('confirm', it.id)}>
                      확정
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openSingle('dismiss', it.id)}>
                      기각
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        캔버스에서 근거를 보려면{' '}
        <Link href="/" className="text-primary hover:underline">
          스튜디오
        </Link>
        로 이동하세요. 확정/기각은 행위자·사유가 기록됩니다(완전자동 금지).
      </p>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === 'confirm' ? '확정' : '기각'} — {dialog?.ids.length}건
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">사유(감사추적 필수)</p>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 재작업 지시 / 오탐으로 판단" rows={3} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>취소</Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : dialog?.mode === 'confirm' ? '확정' : '기각'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function summarizeEvidence(ev: Record<string, unknown>): string {
  if (!ev || typeof ev !== 'object') return '—';
  const spc = ev.spc as { verdict?: string; violatedRules?: string[] } | undefined;
  if (spc?.violatedRules?.length) return `SPC ${spc.verdict} · ${spc.violatedRules.join(',')}`;
  if (typeof ev.value === 'number') return `값 ${ev.value}`;
  const keys = Object.keys(ev).slice(0, 2);
  return keys.length ? keys.map((k) => `${k}`).join(', ') : '판정 근거';
}
