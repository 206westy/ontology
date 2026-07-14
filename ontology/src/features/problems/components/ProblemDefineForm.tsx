'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Loader2, Target, ListChecks, HelpCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { problemsApi, type ProblemDetail } from '../api';

interface ActionSlot {
  key: string;
  label: string;
}
interface DecisionQuestion {
  question: string;
  decision: string;
}

interface Props {
  /** 있으면 편집 모드, 없으면 생성 모드. */
  initial?: ProblemDetail;
}

// PRD-PF-C M1: 문제정의 폼. 문제·목표(지표)·사전 액션 슬롯·결정 질문(CQ→결정 승격).
// 생성 확정 시 온톨로지 연결(ontology-link) 로 이동, 편집 시 저장만.
export default function ProblemDefineForm({ initial }: Props) {
  const router = useRouter();
  const isEdit = !!initial;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [metricName, setMetricName] = useState(initial?.goalMetric?.name ?? '');
  const [metricTarget, setMetricTarget] = useState(initial?.goalMetric?.target ?? '');
  const [metricUnit, setMetricUnit] = useState(initial?.goalMetric?.unit ?? '');
  const [direction, setDirection] = useState<'higher' | 'lower' | 'target'>(
    initial?.goalMetric?.direction ?? 'target',
  );
  const [slots, setSlots] = useState<ActionSlot[]>(
    initial?.actionSlots?.length ? initial.actionSlots : [{ key: 'pass', label: '통과' }, { key: 'fail', label: '불통과' }],
  );
  const [questions, setQuestions] = useState<DecisionQuestion[]>(
    initial?.decisionQuestions?.map((q) => ({ question: q.question, decision: q.decision })) ?? [],
  );
  const [saving, setSaving] = useState(false);
  // PRD-C M1: 패턴 카탈로그의 competencyQuestions 를 결정질문 초안으로 복사(패턴 캐시 자체는 안 건드림).
  const [patternCqs, setPatternCqs] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/patterns')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: unknown) => {
        const list = Array.isArray(rows) ? rows : [];
        const cqs = list.flatMap((p) =>
          Array.isArray((p as { competencyQuestions?: unknown }).competencyQuestions)
            ? ((p as { competencyQuestions: unknown[] }).competencyQuestions.filter(
                (q): q is string => typeof q === 'string' && q.trim().length > 0,
              ))
            : [],
        );
        setPatternCqs(Array.from(new Set(cqs)).slice(0, 12));
      })
      .catch(() => {});
  }, []);

  function addPatternCq(cq: string) {
    setQuestions((prev) =>
      prev.some((q) => q.question === cq) ? prev : [...prev, { question: cq, decision: '' }],
    );
  }

  function updateSlot(i: number, patch: Partial<ActionSlot>) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function updateQuestion(i: number, patch: Partial<DecisionQuestion>) {
    setQuestions((prev) => prev.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }

  async function submit() {
    if (!title.trim()) {
      toast.error('문제명을 입력하세요.');
      return;
    }
    setSaving(true);
    const payload = {
      title: title.trim(),
      description: description.trim(),
      goalMetric: { name: metricName, target: metricTarget, unit: metricUnit, direction },
      actionSlots: slots.filter((s) => s.key.trim() && s.label.trim()),
      decisionQuestions: questions.filter((q) => q.question.trim()),
    };
    try {
      if (isEdit) {
        await problemsApi.update(initial!.id, payload);
        toast.success('문제 정의를 저장했습니다.');
        router.refresh();
      } else {
        const created = await problemsApi.create(payload);
        toast.success(`문제 "${created.title}" 를 정의했습니다.`);
        router.push(`/problems/${created.id}/ontology-link`);
      }
    } catch {
      toast.error('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto w-full space-y-6 py-6">
      <div className="space-y-2">
        <Label htmlFor="p-title">문제 (한 줄)</Label>
        <Input
          id="p-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예) 출하 전 웨이퍼 불량을 자동 판정하고 싶다"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-desc">문제 서술 (선택)</Label>
        <Textarea
          id="p-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="어떤 맥락에서, 왜 이 문제를 푸는지"
          rows={3}
        />
      </div>

      <div className="space-y-2 rounded-lg border border-border p-4">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Target className="w-4 h-4 text-primary" /> 목표 지표
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input value={metricName} onChange={(e) => setMetricName(e.target.value)} placeholder="지표명 (예: 불량률)" />
          <Input value={metricTarget} onChange={(e) => setMetricTarget(e.target.value)} placeholder="목표값 (예: 0.5)" />
          <Input value={metricUnit} onChange={(e) => setMetricUnit(e.target.value)} placeholder="단위 (예: %)" />
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as typeof direction)}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="lower">낮을수록 좋음</option>
            <option value="higher">높을수록 좋음</option>
            <option value="target">목표값 근접</option>
          </select>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <ListChecks className="w-4 h-4 text-primary" /> 사전 정의 액션 (결정 결과)
          </div>
          <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={() => setSlots((p) => [...p, { key: '', label: '' }])}>
            <Plus className="w-3.5 h-3.5" /> 추가
          </Button>
        </div>
        {slots.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input value={s.key} onChange={(e) => updateSlot(i, { key: e.target.value })} placeholder="키 (approve)" className="h-8 flex-1" />
            <Input value={s.label} onChange={(e) => updateSlot(i, { label: e.target.value })} placeholder="라벨 (승인)" className="h-8 flex-1" />
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setSlots((p) => p.filter((_, idx) => idx !== i))}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <HelpCircle className="w-4 h-4 text-primary" /> 결정 질문 (CQ → 결정 승격)
          </div>
          <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={() => setQuestions((p) => [...p, { question: '', decision: '' }])}>
            <Plus className="w-3.5 h-3.5" /> 추가
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          "무엇을 물어 어떤 결정을 내릴 것인가." 아래 패턴 추천에서 초안을 불러올 수 있습니다.
        </p>
        {patternCqs.length > 0 && (
          <div className="space-y-1.5 rounded-md border border-dashed border-primary/40 bg-primary/5 p-2.5">
            <div className="flex items-center gap-1 text-xs font-medium text-primary">
              <Sparkles className="w-3.5 h-3.5" /> 패턴에서 결정 질문 불러오기
            </div>
            <div className="flex flex-wrap gap-1.5">
              {patternCqs.map((cq, i) => {
                const added = questions.some((q) => q.question === cq);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => addPatternCq(cq)}
                    disabled={added}
                    className="text-[11px] rounded-full border border-border bg-background px-2 py-0.5 hover:border-primary/50 disabled:opacity-50 disabled:line-through"
                    title={added ? '이미 추가됨' : '결정 질문으로 추가'}
                  >
                    {cq}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {questions.length === 0 && (
          <div className="text-xs text-muted-foreground py-2 text-center">아직 결정 질문이 없습니다.</div>
        )}
        {questions.map((q, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="flex-1 space-y-1">
              <Input value={q.question} onChange={(e) => updateQuestion(i, { question: e.target.value })} placeholder="질문 (예: 이 웨이퍼는 규격을 만족하는가?)" className="h-8" />
              <Input value={q.decision} onChange={(e) => updateQuestion(i, { decision: e.target.value })} placeholder="결정 (예: 통과/불통과 판정)" className="h-8" />
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setQuestions((p) => p.filter((_, idx) => idx !== i))}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button size="lg" className="gap-1.5" onClick={submit} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {isEdit ? '저장' : '문제 정의하고 온톨로지 연결로'}
        </Button>
      </div>
    </div>
  );
}
