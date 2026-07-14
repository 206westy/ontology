'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  FunctionSquare,
  Sparkles,
  Play,
  Trash2,
  Loader2,
  AlertTriangle,
  CircleCheck,
  CircleX,
} from 'lucide-react';
import { toast } from 'sonner';
import { astToText } from '@/lib/functions/ast';
import { useOntologyStore } from '@/features/ontology/hooks/useOntologyStore';
import {
  functionsApi,
  type DecisionFunction,
  type FunctionDraft,
  type EvaluateRow,
} from '../api';

interface ClassRow {
  id: string;
  name: string;
}

const OUTPUT_LABEL: Record<string, string> = {
  pass_fail: '통과/불통과',
  score: '점수',
  recommend: '추천',
};

export default function FunctionsPanel() {
  const [open, setOpen] = useState(false);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [fns, setFns] = useState<DecisionFunction[]>([]);
  const [targetClassId, setTargetClassId] = useState('');
  const [nl, setNl] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<{ draft: FunctionDraft; warnings: string[] } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [evalRows, setEvalRows] = useState<Record<string, EvaluateRow[]>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    functionsApi
      .list()
      .then(setFns)
      .catch(() => {});
  }, []);

  // PRD-PF-B M4: 함수·판정을 그래프 요소에 연결 — 대상 클래스/판정 인스턴스를 캔버스에서 하이라이트.
  function focusOnGraph(id: string) {
    const s = useOntologyStore.getState();
    s.highlightNodes([id]);
    s.focusNode(id);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    fetch('/api/classes')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Array<{ id: string; name: string }>) => {
        const list = Array.isArray(rows) ? rows.map((c) => ({ id: c.id, name: c.name })) : [];
        setClasses(list);
        setTargetClassId((prev) => prev || list[0]?.id || '');
      })
      .catch(() => {});
    refresh();
  }, [open, refresh]);

  async function genDraft() {
    if (!nl.trim() || !targetClassId) return;
    setDrafting(true);
    setDraft(null);
    try {
      setDraft(await functionsApi.draft(nl.trim(), targetClassId));
    } catch {
      toast.error('초안 생성에 실패했습니다.');
    } finally {
      setDrafting(false);
    }
  }

  async function confirmDraft() {
    if (!draft) return;
    setSaving(true);
    const d = draft.draft;
    const inputs = d.inputsResolved
      .filter((i) => i.propertyId)
      .map((i) => ({ propertyId: i.propertyId as string, alias: i.alias }));
    try {
      await functionsApi.create({
        name: d.name,
        targetClassId: d.targetClassId,
        inputs,
        logic: d.logic,
        outputSpec: d.outputSpec,
        nlSource: d.nlSource,
        status: 'confirmed',
      });
      toast.success(`결정함수 "${d.name}" 을(를) 확정했습니다.`);
      setDraft(null);
      setNl('');
      refresh();
    } catch {
      toast.error('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function runEval(fn: DecisionFunction) {
    setBusyId(fn.id);
    try {
      const res = await functionsApi.evaluate(fn.id, {});
      setEvalRows((prev) => ({ ...prev, [fn.id]: res.results }));
      toast.success(`${res.evaluated}건 평가${res.persisted ? ' · 감사 적재' : ''}`);
    } catch {
      toast.error('평가에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  async function del(fn: DecisionFunction) {
    try {
      await functionsApi.remove(fn.id);
      refresh();
    } catch {
      toast.error('삭제에 실패했습니다.');
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 h-8" title="결정함수">
          <FunctionSquare className="w-4 h-4" />
          결정함수
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[440px] sm:max-w-[440px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FunctionSquare className="w-5 h-5 text-primary" /> 결정함수 (키네틱)
          </SheetTitle>
        </SheetHeader>

        <p className="text-xs text-muted-foreground mt-1">
          속성을 읽어 통과/불통과·점수·추천을 산출하는 함수. 자연어로 규칙을 쓰면 AI가
          조건식 초안을 만들고, 사람이 확정합니다(자동 반영 없음).
        </p>

        {/* 저작: 자연어 → 초안 */}
        <div className="mt-4 space-y-2 rounded-lg border border-border p-3">
          <div className="text-sm font-medium">자연어로 새 함수</div>
          <select
            value={targetClassId}
            onChange={(e) => setTargetClassId(e.target.value)}
            className="w-full h-8 text-sm rounded border border-border bg-background px-2"
          >
            {classes.length === 0 && <option value="">클래스 없음</option>}
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Input
            value={nl}
            onChange={(e) => setNl(e.target.value)}
            placeholder='예) 결함밀도가 0.5 이상이면 불량'
            className="h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter') genDraft();
            }}
          />
          <Button size="sm" className="w-full h-8 gap-1.5" onClick={genDraft} disabled={drafting || !targetClassId}>
            {drafting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            조건식 초안 생성
          </Button>
        </div>

        {/* 컨펌카드(초안) */}
        {draft && (
          <div className="mt-3 space-y-2 rounded-lg border-2 border-dashed border-primary/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{draft.draft.name}</span>
              <Badge variant="outline" className="text-[10px]">
                {OUTPUT_LABEL[draft.draft.outputSpec.kind] ?? draft.draft.outputSpec.kind}
              </Badge>
            </div>
            <div className="text-xs font-mono bg-muted rounded px-2 py-1.5">
              {astToText(draft.draft.logic)}
            </div>
            <div className="text-xs text-muted-foreground">근거: {draft.draft.rationale}</div>
            {draft.warnings.length > 0 && (
              <div className="space-y-1">
                {draft.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-1 text-xs text-amber-600">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {w}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button size="sm" className="h-8 gap-1.5" onClick={confirmDraft} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CircleCheck className="w-4 h-4" />}
                확정 저장
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setDraft(null)}>
                취소
              </Button>
            </div>
          </div>
        )}

        {/* 함수 목록 + 평가 */}
        <div className="mt-4 space-y-2">
          <div className="text-sm font-medium">저장된 결정함수 ({fns.length})</div>
          {fns.length === 0 && (
            <div className="text-xs text-muted-foreground py-4 text-center">
              아직 결정함수가 없습니다. 위에서 자연어로 만들어 보세요.
            </div>
          )}
          {fns.map((fn) => (
            <div key={fn.id} className="rounded-lg border border-border p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <button
                  className="text-sm font-medium truncate text-left hover:text-primary disabled:hover:text-inherit"
                  onClick={() => fn.targetClassId && focusOnGraph(fn.targetClassId)}
                  disabled={!fn.targetClassId}
                  title="대상 클래스를 그래프에서 보기"
                >
                  {fn.name}
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge
                    variant={fn.status === 'confirmed' ? 'default' : 'secondary'}
                    className="text-[10px]"
                  >
                    {fn.status === 'confirmed' ? '확정' : fn.status === 'draft' ? '초안' : '보관'}
                  </Badge>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => runEval(fn)} disabled={busyId === fn.id} title="평가 실행">
                    {busyId === fn.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => del(fn)} title="삭제">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="text-xs font-mono text-muted-foreground truncate">
                {astToText(fn.logic)}
              </div>
              {evalRows[fn.id] && (
                <div className="space-y-0.5 pt-1 border-t border-border">
                  {evalRows[fn.id].map((row) => (
                    <button
                      key={row.instanceId}
                      onClick={() => focusOnGraph(row.instanceId)}
                      className="w-full flex items-center gap-1.5 text-xs text-left hover:bg-muted rounded px-1 py-0.5"
                      title="이 인스턴스를 그래프에서 보기"
                    >
                      {row.error ? (
                        <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                      ) : row.verdict?.pass === false ? (
                        <CircleX className="w-3 h-3 text-destructive shrink-0" />
                      ) : (
                        <CircleCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                      )}
                      <span className="truncate">{row.instanceName}</span>
                      <span className="ml-auto text-muted-foreground">
                        {row.error
                          ? '오류'
                          : row.verdict?.kind === 'score'
                            ? `${row.verdict.score}`
                            : (row.verdict?.label ?? row.verdict?.recommendation ?? '')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
