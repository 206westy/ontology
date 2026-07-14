'use client';

import { useEffect, useState } from 'react';
import { Sparkles, Loader2, Wand2, CircleCheck, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { astToText } from '@/lib/functions/ast';
import { functionsApi, type FunctionDraft } from '@/features/functions/api';
import { copilotApi, type FunctionRecommendResponse } from '../../api';

interface ClassRow { id: string; name: string }

// PRD-PF-E M5(핵심): 문제유형 → 함수 추천(템플릿) → 자연어규칙 AST 초안(B 재사용) → 확정 등록.
export default function FunctionsCopilot({ problemId }: { problemId: string }) {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [targetClassId, setTargetClassId] = useState('');
  const [resp, setResp] = useState<FunctionRecommendResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ recId: string; draft: FunctionDraft; warnings: string[] } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/classes')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ClassRow[]) => {
        const list = Array.isArray(rows) ? rows.map((c) => ({ id: c.id, name: c.name })) : [];
        setClasses(list);
        setTargetClassId((p) => p || list[0]?.id || '');
      })
      .catch(() => {});
  }, []);

  async function run() {
    setLoading(true);
    try {
      setResp(await copilotApi.recommendFunctions(problemId));
    } catch {
      setResp(null);
    } finally {
      setLoading(false);
    }
  }

  async function makeDraft(recId: string, ruleSeed: string) {
    if (!targetClassId) {
      toast.error('대상 클래스를 선택하세요.');
      return;
    }
    setDraftingId(recId);
    setDraft(null);
    try {
      const d = await functionsApi.draft(ruleSeed, targetClassId);
      setDraft({ recId, ...d });
    } catch {
      toast.error('초안 생성 실패');
    } finally {
      setDraftingId(null);
    }
  }

  async function confirm() {
    if (!draft) return;
    setSaving(true);
    const d = draft.draft;
    try {
      await functionsApi.create({
        name: d.name,
        targetClassId: d.targetClassId,
        inputs: d.inputsResolved.filter((i) => i.propertyId).map((i) => ({ propertyId: i.propertyId as string, alias: i.alias })),
        logic: d.logic,
        outputSpec: d.outputSpec,
        nlSource: d.nlSource,
        status: 'confirmed',
      });
      toast.success(`결정함수 "${d.name}" 확정(스튜디오에 등록).`);
      setDraft(null);
    } catch {
      toast.error('저장 실패');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        문제유형에 맞는 결정함수 템플릿을 추천하고, 자연어 규칙을 조건식 초안으로 만듭니다(사람이 확정).
      </div>

      <select
        value={targetClassId}
        onChange={(e) => setTargetClassId(e.target.value)}
        className="w-full h-8 text-sm rounded border border-border bg-background px-2"
      >
        {classes.length === 0 && <option value="">클래스 없음</option>}
        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      <Button size="sm" className="w-full gap-1.5" onClick={run} disabled={loading}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        함수 추천
      </Button>

      {resp && !resp.coverage && (
        <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground flex items-start gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" /> {resp.guidance}
        </div>
      )}

      {resp?.recommendations.map((rec) => (
        <div key={rec.id} className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{rec.name}</span>
            <Badge variant="outline" className="text-[10px]">{rec.outputKind}</Badge>
          </div>
          <div className="text-xs text-muted-foreground">{rec.description}</div>
          <div className="text-[11px] text-muted-foreground">근거: {rec.rationale}</div>
          <div className="text-xs font-mono bg-muted rounded px-2 py-1">{rec.ruleSeed}</div>
          <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => makeDraft(rec.id, rec.ruleSeed)} disabled={draftingId === rec.id}>
            {draftingId === rec.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            이 규칙으로 초안 만들기
          </Button>

          {draft?.recId === rec.id && (
            <div className="rounded-lg border-2 border-dashed border-primary/50 p-2.5 space-y-1.5">
              <div className="text-sm font-semibold">{draft.draft.name}</div>
              <div className="text-xs font-mono bg-muted rounded px-2 py-1">{astToText(draft.draft.logic)}</div>
              <div className="text-xs text-muted-foreground">근거: {draft.draft.rationale}</div>
              {draft.warnings.map((w, i) => (
                <div key={i} className="text-xs text-amber-600">⚠ {w}</div>
              ))}
              <Button size="sm" className="h-7 gap-1.5" onClick={confirm} disabled={saving}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CircleCheck className="w-3.5 h-3.5" />}
                확정 저장
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
