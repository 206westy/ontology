'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Sparkles, Send, User, Bot, Loader2, RotateCcw, Import, X, AlertTriangle, Route } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { assistApi, ragApi, type RagAnswerResult } from '../api';
import type { OntologyAction } from '../lib/schemas';
import EvidencePathCard from './ai/EvidencePathCard';
import { isBulkInput } from '../lib/input-heuristics';
import { uuid } from '../lib/uuid';
import type { ActionPlan } from '../lib/plan-actions';
import ActionCard, { type ActionState } from './ai/ActionCard';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

interface ActionItem {
  action: OntologyAction;
  state: ActionState;
  skipReason?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  actions?: ActionItem[];
  // PRD-N M4: 진단형 RAG 답변의 근거경로·출처(있으면 답변 아래 렌더).
  evidence?: RagAnswerResult;
}

const ASSIST_TIMEOUT_MS = 45_000;

export default function AIAssistantTab({ nodeName }: { nodeName: string }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // "모두 적용" 전 영향 요약 확인용. null 이면 닫힘.
  const [applyConfirm, setApplyConfirm] = useState<{ msgId: string; indices: number[]; plan: ActionPlan } | null>(null);
  // PRD-N M4: 근거 기반 답변 모드(진단형 RAG). off 면 기존 구조화 액션 어시스턴트.
  const [groundedMode, setGroundedMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timedOutRef = useRef(false);
  const expandNonceRef = useRef(0);

  const selectedNodeId = useOntologyStore((s) => s.selectedNodeId);
  const aiExpandRequest = useOntologyStore((s) => s.aiExpandRequest);
  const consumeAiExpandRequest = useOntologyStore((s) => s.consumeAiExpandRequest);
  const aiClasses = useOntologyStore((s) => s.classes);
  const aiInstances = useOntologyStore((s) => s.instances);
  const aiEdges = useOntologyStore((s) => s.edges);
  const applyAssistantActions = useOntologyStore((s) => s.applyAssistantActions);
  const previewAssistantActions = useOntologyStore((s) => s.previewAssistantActions);
  const highlightNodes = useOntologyStore((s) => s.highlightNodes);
  const openPopover = useOntologyStore((s) => s.openPopover);
  const currentPartitionId = useOntologyStore((s) => s.currentPartitionId);

  const ontologySummary = useMemo(() => {
    const summary = `Classes: ${aiClasses.length}, Instances: ${aiInstances.length}, Relations: ${aiEdges.length}`;
    const classNames = aiClasses.map((c) => c.name).join(', ');
    return `${summary}\nClass list: ${classNames}`;
  }, [aiClasses, aiInstances, aiEdges]);

  const bulky = useMemo(() => isBulkInput(input), [input]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const stopTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    timeoutRef.current = null;
    tickRef.current = null;
  }, []);

  // Open the import (parse) flow with the current input prefilled.
  const handleRouteToImport = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    openPopover({
      type: 'newNode',
      position: { x: window.innerWidth / 2, y: 200 },
      initialText: text,
    });
    setInput('');
  }, [input, openPopover]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const submitMessage = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { id: uuid(), role: 'user', text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setElapsed(0);
    timedOutRef.current = false;

    const controller = new AbortController();
    abortRef.current = controller;
    const startedAt = Date.now();
    tickRef.current = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 250);
    timeoutRef.current = setTimeout(() => {
      timedOutRef.current = true;
      controller.abort();
    }, ASSIST_TIMEOUT_MS);

    try {
      if (groundedMode) {
        // PRD-N M4: 진단형 RAG — 구획 스코프 탐색 + 근거경로. 액션 제안 대신 근거 답변.
        const res = await ragApi.answer({
          question: trimmed,
          partitionId: currentPartitionId ?? undefined,
        });
        setMessages((prev) => [
          ...prev,
          { id: uuid(), role: 'assistant', text: res.answer, evidence: res },
        ]);
      } else {
        const res = await assistApi.send(
          { message: trimmed, selectedNodeId: selectedNodeId ?? undefined, ontologySummary },
          controller.signal,
        );
        setMessages((prev) => [
          ...prev,
          {
            id: uuid(),
            role: 'assistant',
            text: res.reply,
            actions: res.actions.map((action) => ({ action, state: 'pending' as ActionState })),
          },
        ]);
        // H1: 서버가 형식 오류로 드롭한 제안이 있으면 사용자에게 알린다(조용한 누락 방지).
        const warnings = (res as { warnings?: string[] }).warnings;
        if (warnings?.length) {
          toast.warning(warnings.join(' '));
        }
      }
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      if (aborted) {
        // Restore the input so the user can retry or route to import.
        setInput(trimmed);
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        if (timedOutRef.current) {
          toast.warning('응답이 지연되어 중단했습니다. 입력을 줄이거나 "가져오기"를 사용해 보세요.');
        } else {
          toast.info('요청을 취소했습니다.');
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: uuid(),
            role: 'assistant',
            text: err instanceof Error ? err.message : '요청 처리에 실패했습니다.',
          },
        ]);
      }
    } finally {
      stopTimers();
      abortRef.current = null;
      setLoading(false);
    }
  }, [loading, selectedNodeId, ontologySummary, stopTimers, groundedMode, currentPartitionId]);

  const handleSubmit = useCallback(() => {
    void submitMessage(input);
  }, [submitMessage, input]);

  // 진입점(컨텍스트 메뉴/패널 버튼)에서 올라온 노드 확장 요청을 소비해 확장
  // 프롬프트를 자동 전송한다. 전송을 한 틱 지연시켜 StrictMode/탭 전환의
  // mount→unmount→remount 사이클에서 언마운트 cleanup(abortRef.abort)이 방금 시작한
  // 요청을 죽이지 않게 한다(버려지는 mount는 clearTimeout으로 취소). nonce는 실제
  // 발화 시점에 기록하고, 소비 후 신호를 비워 재마운트 재전송을 방지한다.
  useEffect(() => {
    const req = aiExpandRequest;
    if (!req || req.nonce === expandNonceRef.current) return;
    const timer = setTimeout(() => {
      expandNonceRef.current = req.nonce;
      const kindKo = req.nodeType === 'class' ? '클래스' : '인스턴스';
      const prompt =
        `"${req.nodeName}" ${kindKo}를 기준으로 온톨로지를 확장해줘. ` +
        `이 개념과 직접 관련된 하위 클래스, 속성, 다른 개념과의 관계를 제안해줘. ` +
        `이미 존재하는 항목과 중복되지 않게 새로운 것만 제안해줘.`;
      void submitMessage(prompt);
      consumeAiExpandRequest();
    }, 80);
    return () => clearTimeout(timer);
  }, [aiExpandRequest, submitMessage, consumeAiExpandRequest]);

  // Apply a set of action items (single compound store action = one undo step).
  // 스토어 변경/토스트/하이라이트는 setMessages 업데이터 밖(이벤트 핸들러 본문)에서 수행한다.
  // 업데이터 안에서 store action 을 호출하면 렌더 도중 Home 등 구독 컴포넌트가
  // setState 되어 "Cannot update a component while rendering" 경고가 발생한다.
  const runApply = useCallback(
    (msgId: string, indices: number[]) => {
      const msg = messages.find((m) => m.id === msgId);
      if (!msg?.actions) return;

      const targets = indices
        .map((i) => ({ i, item: msg.actions![i] }))
        .filter(({ item }) => item && item.state === 'pending');
      if (targets.length === 0) return;

      const result = applyAssistantActions(targets.map(({ item }) => item.action));

      const skipQueue = [...result.skipped];
      const nextActions = msg.actions.map((item) => {
        const hit = targets.find((t) => t.item === item);
        if (!hit) return item;
        const skipIdx = skipQueue.findIndex((s) => s.label === item.action.label);
        if (skipIdx !== -1) {
          const [skip] = skipQueue.splice(skipIdx, 1);
          return { ...item, state: 'skipped' as ActionState, skipReason: skip.reason };
        }
        return { ...item, state: 'applied' as ActionState };
      });

      if (result.applied.length > 0) {
        highlightNodes(result.applied);
      }
      const appliedCount = targets.length - result.skipped.length;
      if (appliedCount > 0) toast.success(`${appliedCount}개 액션을 적용했습니다`);
      if (result.skipped.length > 0) toast.warning(`${result.skipped.length}개 액션을 적용하지 못했습니다`);

      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, actions: nextActions } : m)));
    },
    [messages, applyAssistantActions, highlightNodes],
  );

  // "모두 적용" → 즉시 적용하지 않고, 적용 전 영향 요약을 먼저 보여준다.
  const requestApplyAll = useCallback(
    (msgId: string, indices: number[]) => {
      const msg = messages.find((m) => m.id === msgId);
      if (!msg?.actions) return;
      const actions = indices
        .map((i) => msg.actions![i]?.action)
        .filter((a): a is OntologyAction => Boolean(a));
      if (actions.length === 0) return;
      setApplyConfirm({ msgId, indices, plan: previewAssistantActions(actions) });
    },
    [messages, previewAssistantActions],
  );

  const confirmApplyAll = useCallback(() => {
    if (!applyConfirm) return;
    runApply(applyConfirm.msgId, applyConfirm.indices);
    setApplyConfirm(null);
  }, [applyConfirm, runApply]);

  const ignoreOne = useCallback((msgId: string, index: number) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.actions) return m;
        return {
          ...m,
          actions: m.actions.map((item, i) =>
            i === index && item.state === 'pending' ? { ...item, state: 'ignored' as ActionState } : item,
          ),
        };
      }),
    );
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleReset = () => setMessages([]);

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Messages area */}
      {hasMessages ? (
        <ScrollArea className="flex-1 min-h-0">
          <div ref={scrollRef} className="p-3 space-y-3">
            {messages.map((msg) => {
              const pendingIdx =
                msg.actions
                  ?.map((item, i) => (item.state === 'pending' ? i : -1))
                  .filter((i) => i !== -1) ?? [];
              return (
                <div key={msg.id} className="flex gap-2">
                  <div className="shrink-0 mt-0.5">
                    {msg.role === 'user' ? (
                      <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                        <User className="w-3 h-3 text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bot className="w-3 h-3 text-primary" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">
                      {msg.role === 'user' ? '나' : 'AI 어시스턴트'}
                    </p>
                    <div className="text-xs text-foreground leading-relaxed whitespace-pre-wrap break-words">
                      {msg.text}
                    </div>

                    {/* PRD-N M4: 근거경로·출처(진단형 RAG 답변). 경로 클릭 → 캔버스 하이라이트. */}
                    {msg.evidence && (
                      <EvidencePathCard evidence={msg.evidence} onHighlight={highlightNodes} />
                    )}

                    {msg.actions && msg.actions.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {pendingIdx.length > 1 && (
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-5 text-xs px-2"
                              onClick={() => requestApplyAll(msg.id, pendingIdx)}
                            >
                              모두 적용 ({pendingIdx.length})
                            </Button>
                          </div>
                        )}
                        {msg.actions.map((item, i) => (
                          <ActionCard
                            key={i}
                            action={item.action}
                            state={item.state}
                            skipReason={item.skipReason}
                            onApply={() => runApply(msg.id, [i])}
                            onIgnore={() => ignoreOne(msg.id, i)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {loading && (
              <div className="flex gap-2 items-center">
                <div className="shrink-0">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="w-3 h-3 text-primary" />
                  </div>
                </div>
                <span
                  className="inline-flex items-center gap-1 text-muted-foreground text-xs"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                  분석 중… ({elapsed}s)
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-xs px-1.5 text-muted-foreground hover:text-destructive"
                  onClick={handleCancel}
                >
                  <X className="w-3 h-3 mr-0.5" />
                  취소
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      ) : (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <p className="text-xs text-muted-foreground mb-1">AI에게 요청하세요</p>
            <p className="text-xs text-muted-foreground/70">
              예: &quot;SUPRA 하위에 ECOLITE 클래스 추가&quot; — 제안을 검토 후 적용할 수 있습니다
            </p>
          </div>
        </div>
      )}

      <Separator />

      {/* Input area */}
      <div className="p-3 shrink-0">
        {hasMessages && (
          <div className="flex justify-end mb-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-xs px-1.5 text-muted-foreground hover:text-foreground"
              onClick={handleReset}
            >
              <RotateCcw className="w-2.5 h-2.5 mr-1" />
              대화 초기화
            </Button>
          </div>
        )}

        {/* Bulk input → suggest the import (parse) flow (PATCH-2) */}
        {bulky && !loading && (
          <div className="mb-2 rounded-md border border-warning/30 bg-warning/10 p-2 space-y-1.5">
            <div className="flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-warning leading-relaxed">
                이건 문서에 가까워요. &lsquo;가져오기&rsquo;로 처리하면 더 빠르고 정확합니다.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-6 w-full text-xs gap-1 border-warning/40"
              onClick={handleRouteToImport}
            >
              <Import className="w-3 h-3" />
              가져오기로 처리
            </Button>
          </div>
        )}

        {/* PRD-N M4: 근거 기반 답변 모드 토글 — 켜면 현재 구획을 탐색해 근거경로와 함께 답한다. */}
        <div className="mb-1.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setGroundedMode((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition-colors ${
              groundedMode
                ? 'border-primary/50 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
            title={
              groundedMode
                ? '근거 기반 답변: 현재 구획을 탐색해 근거경로와 함께 답합니다. 클릭하면 일반 어시스턴트로 전환.'
                : '일반 어시스턴트(구조화 제안). 클릭하면 근거 기반(근거경로) 답변으로 전환.'
            }
          >
            <Route className="w-3 h-3" />
            {groundedMode ? '근거 기반' : '일반'}
          </button>
        </div>

        <div className="flex gap-1.5 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              groundedMode
                ? '근거 기반으로 물어보세요 (현재 구획 탐색)...'
                : nodeName
                  ? `"${nodeName}"에 대해 요청하세요...`
                  : 'AI에게 요청하세요...'
            }
            className="flex-1 min-h-[32px] max-h-[120px] text-xs bg-transparent border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-primary/50 resize-none placeholder:text-muted-foreground"
            rows={1}
            disabled={loading}
          />
          <Button
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            disabled={!input.trim() || loading}
            onClick={handleSubmit}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
      </div>

      <AlertDialog open={!!applyConfirm} onOpenChange={(open) => { if (!open) setApplyConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>적용 전 확인</AlertDialogTitle>
            <AlertDialogDescription>
              {applyConfirm
                ? `추가 ${applyConfirm.plan.summary.create}개` +
                  (applyConfirm.plan.summary.update > 0 ? ` · 수정 ${applyConfirm.plan.summary.update}개` : '') +
                  (applyConfirm.plan.summary.skip > 0 ? ` · 건너뜀 ${applyConfirm.plan.summary.skip}개` : '')
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {applyConfirm && (
            <div className="max-h-64 overflow-y-auto space-y-1 text-xs">
              {applyConfirm.plan.outcomes.map((o, i) => {
                const isSkip = o.status === 'skip';
                return (
                  <div
                    key={i}
                    className={`flex items-start gap-2 rounded-md border px-2 py-1.5 ${
                      isSkip
                        ? 'border-warning/30 bg-warning/10'
                        : 'border-border bg-muted/30'
                    }`}
                  >
                    <span
                      className={`shrink-0 mt-px rounded px-1 text-xs font-medium ${
                        isSkip
                          ? 'bg-warning/20 text-warning'
                          : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {o.status === 'create' ? '추가' : o.status === 'update' ? '수정' : '건너뜀'}
                    </span>
                    <span className="min-w-0 break-words leading-relaxed text-foreground">{o.detail}</span>
                  </div>
                );
              })}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmApplyAll}
              disabled={!applyConfirm || applyConfirm.plan.summary.create + applyConfirm.plan.summary.update === 0}
            >
              적용{applyConfirm ? ` (${applyConfirm.plan.summary.create + applyConfirm.plan.summary.update})` : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
