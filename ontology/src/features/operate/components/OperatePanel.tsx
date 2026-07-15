'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Sparkles, Play, Bot, Zap, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

interface Trigger {
  id: string;
  name: string;
  eventType: string;
  enabled: boolean;
}
interface Run {
  id: string;
  status: string;
  createdAt: string;
}
interface Answer {
  answer: string;
  grounded?: boolean;
  sources?: unknown[];
}

// PRD-PF 시퀀스 7단계 — AIP·자동화(H·I). 읽기전용 답변·제안(HITL) + 준실시간 자동화(자율확정 금지).
export default function OperatePanel() {
  // ── H: 답변엔진(진단/전역 RAG) + 제안 에이전트 ──
  const [q, setQ] = useState('');
  const [global, setGlobal] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [asking, setAsking] = useState(false);
  const [proposing, setProposing] = useState(false);

  const ask = async () => {
    if (!q.trim()) return;
    setAsking(true);
    try {
      const url = global ? '/api/rag/global' : '/api/rag/answer';
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d?.error ?? '답변 실패');
        return;
      }
      setAnswer(d);
    } finally {
      setAsking(false);
    }
  };

  const propose = async () => {
    setProposing(true);
    try {
      const r = await fetch('/api/agent/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const d = await r.json();
      if (r.ok) toast.success(`제안 ${d.proposed}건 생성 — 액션보드에서 확인·확정`);
      else toast.error('제안 생성 실패');
    } finally {
      setProposing(false);
    }
  };

  // ── I: 트리거 + 실행 이력 ──
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const load = useCallback(async () => {
    const [t, r] = await Promise.all([
      fetch('/api/triggers').then((x) => (x.ok ? x.json() : [])),
      fetch('/api/automation-runs').then((x) => (x.ok ? x.json() : [])),
    ]);
    setTriggers(Array.isArray(t) ? t : []);
    setRuns(Array.isArray(r) ? r.slice(0, 8) : []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const runTrigger = async (id: string) => {
    const r = await fetch(`/api/triggers/${id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const d = await r.json();
    if (r.ok) {
      toast.success(d.proposalCreated ? '실행됨 · 제안 1건 생성' : '실행됨');
      load();
    } else {
      toast.error(d?.error ?? '실행 실패');
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">AIP · 자동화</h1>
        <p className="text-sm text-muted-foreground">
          모델 위에서 근거로 답하고 조치를 제안(사람 확정) · 준실시간 자동화(자율 실행 금지)
        </p>
      </header>

      {/* H: 답변 + 제안 */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Bot className="h-4 w-4 text-primary" /> 답변엔진 (읽기전용 · 근거경로)
        </div>
        <Textarea value={q} onChange={(e) => setQ(e.target.value)} placeholder="예: 3호기 반복 고장의 근본원인 후보는?" rows={2} />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox checked={global} onCheckedChange={(v) => setGlobal(!!v)} /> 전체 질의(구획 요약 종합)
          </label>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={propose} disabled={proposing}>
              {proposing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Sparkles className="mr-1 h-3.5 w-3.5" /> 제안 생성</>}
            </Button>
            <Button size="sm" onClick={ask} disabled={asking}>
              {asking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '질문'}
            </Button>
          </div>
        </div>
        {answer && (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
            <p className="whitespace-pre-wrap">{answer.answer}</p>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={answer.grounded ? 'secondary' : 'outline'} className="text-[10px]">
                {answer.grounded ? '근거 있음' : '모델에 근거 없음'}
              </Badge>
              {answer.sources && <span>근거 {answer.sources.length}건</span>}
            </div>
          </div>
        )}
      </Card>

      {/* I: 트리거 */}
      <Card className="space-y-2 p-4">
        <div className="flex items-center justify-between text-sm font-medium">
          <span className="flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-primary" /> 트리거 (이벤트→결정함수 실행)
          </span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={load} aria-label="새로고침">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        {triggers.length === 0 ? (
          <p className="py-3 text-xs text-muted-foreground">등록된 트리거가 없습니다. (수동 발화·스케줄은 준실시간)</p>
        ) : (
          <ul className="space-y-1.5">
            {triggers.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-sm">
                <span className="flex items-center gap-2 truncate">
                  {t.name}
                  <Badge variant="outline" className="text-[10px]">{t.eventType}</Badge>
                  {!t.enabled && <Badge variant="outline" className="text-[10px] text-muted-foreground">비활성</Badge>}
                </span>
                <Button size="sm" variant="secondary" onClick={() => runTrigger(t.id)}>
                  <Play className="mr-1 h-3.5 w-3.5" /> 지금 실행
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* I: 실행 이력 */}
      {runs.length > 0 && (
        <Card className="space-y-1.5 p-4">
          <div className="text-sm font-medium">실행 이력 (append-only 감사)</div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {runs.map((r) => (
              <li key={r.id} className="flex items-center justify-between">
                <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                <span>{new Date(r.createdAt).toLocaleString('ko-KR')}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
